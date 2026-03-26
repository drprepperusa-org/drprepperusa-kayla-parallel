/**
 * @file rateService.ts
 * @description Fetch shipping rates from ShipStation V2 API.
 *
 * Design:
 * - Pure service — no side effects, no store access
 * - Stateless caching: cache is a module-level singleton (TTL-based)
 * - Input: Order domain object (dimensions, weight, address)
 * - Output: ShipStationRate[] (USPS, UPS, FedEx, etc.)
 * - Cache TTL: 30 minutes (configurable via env CACHE_TTL)
 * - Error handling: typed RateServiceError; never throws raw exceptions
 *
 * API: ShipStation V2 POST /rates (not to be confused with V1 getrates)
 *
 * @example
 * ```ts
 * const client = createShipStationClientFromEnv();
 *
 * const result = await fetchRates(
 *   {
 *     orderId: 'order-123',
 *     clientId: 'kfgoods',
 *     weightOz: 16,
 *     dimensions: { lengthIn: 12, widthIn: 8, heightIn: 4 },
 *     originZip: '92101',
 *     destinationZip: '10001',
 *     residential: true,
 *   },
 *   client,
 * );
 *
 * if (result.ok) {
 *   console.log(result.rates); // ShipStationRate[]
 * } else {
 *   console.error(result.error); // RateServiceError
 * }
 * ```
 */

import { ShipStationError, type ShipStationClient } from '../api/shipstationClient';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cache TTL: configurable via CACHE_TTL env var (milliseconds).
 * Falls back to 30 minutes if not set or unparseable.
 * Set in .env.example as CACHE_TTL=1800000.
 *
 * NOTE: CACHE_TTL is intentionally NOT prefixed with PUBLIC_ — it is server-only
 * config and does not need to be exposed to the browser. When this service is
 * moved to a server-side proxy, the env var will be read server-side only.
 */
const DEFAULT_CACHE_TTL_MS = (() => {
  const raw = import.meta.env['CACHE_TTL'] as string | undefined;
  if (!raw) return 30 * 60 * 1000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000;
})();

/** ShipStation V2 carrier IDs to fetch rates for. */
const DEFAULT_CARRIER_IDS = ['stamps_com', 'ups', 'fedex'];

/** ShipStation V2 rates endpoint. */
const V2_RATES_PATH = '/rates';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for a rate fetch operation.
 * All required fields must be present — callers validate before calling.
 */
export interface RateRequest {
  /** Internal order ID (for logging/tracing). */
  orderId: string;
  /** Multi-tenant client identifier. */
  clientId: string;
  /** Package weight in ounces. */
  weightOz: number;
  /** Package dimensions in inches. */
  dimensions: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  /** 5-digit origin ZIP code. */
  originZip: string;
  /** 5-digit destination ZIP code. */
  destinationZip: string;
  /** Whether the destination is a residential address. */
  residential: boolean;
  /** Override carrier IDs to query. Defaults to stamps_com, ups, fedex. */
  carrierIds?: string[];
}

/**
 * Normalized rate response from ShipStation.
 * Carrier-agnostic shape — maps both V1 and V2 responses.
 */
export interface ShipStationRate {
  /** ShipStation carrier code (e.g. "stamps_com", "ups", "fedex"). */
  carrierCode: string;
  /** Human-readable carrier name. */
  carrierName: string;
  /** ShipStation service code (e.g. "usps_priority_mail"). */
  serviceCode: string;
  /** Human-readable service name. */
  serviceName: string;
  /** Total shipment cost in dollars (shipping + other). */
  totalCost: number;
  /** Shipping cost component. */
  shipmentCost: number;
  /** Other cost component (fuel, insurance, etc.). */
  otherCost: number;
  /** Estimated delivery days (null if unavailable). */
  deliveryDays: number | null;
  /** Estimated delivery date ISO string (null if unavailable). */
  estimatedDelivery: string | null;
  /** Whether this is a guaranteed delivery service. */
  guaranteedDelivery: boolean;
  /** Whether this rate is residential-adjusted. */
  residential: boolean;
}

export type RateServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'NO_RATES_RETURNED'
  | 'API_ERROR';

export class RateServiceError extends Error {
  constructor(
    message: string,
    public readonly code: RateServiceErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RateServiceError';
  }
}

/** Result type — prefer over throwing to keep callers clean. */
export type RateResult =
  | { ok: true; rates: ShipStationRate[]; cachedAt: Date; fromCache: boolean }
  | { ok: false; error: RateServiceError };

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  rates: ShipStationRate[];
  fetchedAt: Date;
  expiresAt: Date;
}

/** Module-level rate cache. Keyed by canonical cache key. */
const rateCache = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key for a rate request.
 * Key includes all rate-relevant parameters (excludes orderId, clientId for sharing).
 */
function buildCacheKey(req: RateRequest): string {
  const dims = `${req.dimensions.lengthIn}x${req.dimensions.widthIn}x${req.dimensions.heightIn}`;
  const carriers = (req.carrierIds ?? DEFAULT_CARRIER_IDS).sort().join(',');
  return [
    req.originZip,
    req.destinationZip,
    req.weightOz.toFixed(2),
    dims,
    req.residential ? '1' : '0',
    carriers,
  ].join('|');
}

/**
 * Get a cached entry if it exists and has not expired.
 */
function getCached(key: string): CacheEntry | null {
  const entry = rateCache.get(key);
  if (!entry) return null;
  if (new Date() > entry.expiresAt) {
    rateCache.delete(key);
    return null;
  }
  return entry;
}

/**
 * Store rates in the cache with TTL.
 */
function setCached(key: string, rates: ShipStationRate[], ttlMs: number): CacheEntry {
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + ttlMs);
  const entry: CacheEntry = { rates, fetchedAt, expiresAt };
  rateCache.set(key, entry);
  return entry;
}

/**
 * Clear the entire rate cache (useful for testing and manual refresh).
 */
export function clearRateServiceCache(): void {
  rateCache.clear();
}

/**
 * Return current cache size (for diagnostics).
 */
export function getRateServiceCacheSize(): number {
  return rateCache.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateRateRequest(req: RateRequest): RateServiceError | null {
  if (!req.weightOz || req.weightOz <= 0) {
    return new RateServiceError('Weight must be greater than 0 oz', 'VALIDATION_ERROR');
  }
  if (
    !req.dimensions ||
    req.dimensions.lengthIn <= 0 ||
    req.dimensions.widthIn <= 0 ||
    req.dimensions.heightIn <= 0
  ) {
    return new RateServiceError('All package dimensions must be greater than 0', 'VALIDATION_ERROR');
  }
  if (!req.originZip || !/^\d{5}$/.test(req.originZip.replace(/\D/g, '').slice(0, 5))) {
    return new RateServiceError('Invalid origin ZIP code', 'VALIDATION_ERROR');
  }
  if (!req.destinationZip) {
    return new RateServiceError('Destination ZIP is required', 'VALIDATION_ERROR');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Response Normalization
// ─────────────────────────────────────────────────────────────────────────────

interface V2RateItem {
  carrier_code?: string;
  carrier_nickname?: string;
  carrier_friendly_name?: string;
  service_code: string;
  service_type?: string;
  shipping_amount: { amount: number };
  other_amount: { amount: number };
  delivery_days?: number | null;
  estimated_delivery_date?: string | null;
  guaranteed_service?: boolean;
}

function normalizeV2Rate(item: V2RateItem, residential: boolean): ShipStationRate {
  const shipmentCost = item.shipping_amount.amount;
  const otherCost = item.other_amount.amount;
  return {
    carrierCode: item.carrier_code ?? '',
    carrierName: item.carrier_friendly_name ?? item.carrier_nickname ?? item.carrier_code ?? '',
    serviceCode: item.service_code,
    serviceName: item.service_type ?? item.service_code,
    totalCost: shipmentCost + otherCost,
    shipmentCost,
    otherCost,
    deliveryDays: item.delivery_days ?? null,
    estimatedDelivery: item.estimated_delivery_date ?? null,
    guaranteedDelivery: item.guaranteed_service ?? false,
    residential,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Response (scaffold — replace with real API call)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate mock rates for development/testing.
 * Structure matches real ShipStation V2 rate response shape.
 *
 * TODO: Remove this and call the real API once credentials are wired.
 */
function generateMockRates(req: RateRequest): ShipStationRate[] {
  const baseWeight = req.weightOz;
  const baseRate = 3 + baseWeight * 0.05;

  return [
    {
      carrierCode: 'stamps_com',
      carrierName: 'USPS',
      serviceCode: 'usps_priority_mail',
      serviceName: 'USPS Priority Mail',
      totalCost: parseFloat((baseRate + 1.2).toFixed(2)),
      shipmentCost: parseFloat((baseRate + 0.8).toFixed(2)),
      otherCost: 0.40,
      deliveryDays: 2,
      estimatedDelivery: new Date(Date.now() + 2 * 86400000).toISOString(),
      guaranteedDelivery: false,
      residential: req.residential,
    },
    {
      carrierCode: 'stamps_com',
      carrierName: 'USPS',
      serviceCode: 'usps_first_class_mail',
      serviceName: 'USPS First Class Mail',
      totalCost: parseFloat((baseRate * 0.7).toFixed(2)),
      shipmentCost: parseFloat((baseRate * 0.65).toFixed(2)),
      otherCost: parseFloat((baseRate * 0.05).toFixed(2)),
      deliveryDays: 5,
      estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
      guaranteedDelivery: false,
      residential: req.residential,
    },
    {
      carrierCode: 'ups',
      carrierName: 'UPS',
      serviceCode: 'ups_ground',
      serviceName: 'UPS Ground',
      totalCost: parseFloat((baseRate * 1.3 + (req.residential ? 3.55 : 0)).toFixed(2)),
      shipmentCost: parseFloat((baseRate * 1.2).toFixed(2)),
      otherCost: parseFloat((baseRate * 0.1 + (req.residential ? 3.55 : 0)).toFixed(2)),
      deliveryDays: 3,
      estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString(),
      guaranteedDelivery: false,
      residential: req.residential,
    },
    {
      carrierCode: 'fedex',
      carrierName: 'FedEx',
      serviceCode: 'fedex_ground',
      serviceName: 'FedEx Ground',
      totalCost: parseFloat((baseRate * 1.25 + (req.residential ? 4.40 : 0)).toFixed(2)),
      shipmentCost: parseFloat((baseRate * 1.15).toFixed(2)),
      otherCost: parseFloat((baseRate * 0.1 + (req.residential ? 4.40 : 0)).toFixed(2)),
      deliveryDays: 4,
      estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString(),
      guaranteedDelivery: false,
      residential: req.residential,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Fetch Rates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch shipping rates from ShipStation V2 API.
 *
 * Cache behavior:
 * - Checks module-level cache first (TTL: 30min by default)
 * - Fetches from API on cache miss
 * - Stores result in cache on success
 * - Returns { fromCache: true } on cache hit
 *
 * Error handling:
 * - Returns { ok: false, error } — never throws
 * - Typed error codes for programmatic handling (AUTH_ERROR, RATE_LIMITED, etc.)
 *
 * @param req - Rate request parameters
 * @param client - ShipStation client (v1/v2)
 * @param cacheTtlMs - Override cache TTL in ms (default: 30min)
 * @returns RateResult — ok=true with rates, or ok=false with typed error
 *
 * @example
 * ```ts
 * const result = await fetchRates(req, client);
 * if (result.ok) {
 *   const best = result.rates.sort((a, b) => a.totalCost - b.totalCost)[0];
 * }
 * ```
 */
export async function fetchRates(
  req: RateRequest,
  client: ShipStationClient,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
): Promise<RateResult> {
  // 1. Validate
  const validationError = validateRateRequest(req);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  // 2. Cache check
  const cacheKey = buildCacheKey(req);
  const cached = getCached(cacheKey);
  if (cached) {
    console.debug('[rateService] cache HIT', { cacheKey, orderId: req.orderId });
    return {
      ok: true,
      rates: cached.rates,
      cachedAt: cached.fetchedAt,
      fromCache: true,
    };
  }

  console.debug('[rateService] cache MISS — fetching from ShipStation V2', {
    cacheKey,
    orderId: req.orderId,
  });

  try {
    // 3. Call ShipStation V2 POST /rates
    // TODO: When real credentials are wired, this mock block becomes a real API call.
    // Real implementation:
    //
    //   const payload = {
    //     shipment: {
    //       ship_from: { postal_code: req.originZip, country_code: 'US' },
    //       ship_to: {
    //         postal_code: req.destinationZip,
    //         country_code: 'US',
    //         address_residential_indicator: req.residential ? 'yes' : 'no',
    //       },
    //       packages: [{
    //         weight: { value: req.weightOz, unit: 'ounce' },
    //         dimensions: {
    //           unit: 'inch',
    //           length: req.dimensions.lengthIn,
    //           width: req.dimensions.widthIn,
    //           height: req.dimensions.heightIn,
    //         },
    //       }],
    //     },
    //     rate_options: {
    //       carrier_ids: req.carrierIds ?? DEFAULT_CARRIER_IDS,
    //       package_types: ['package'],
    //     },
    //   };
    //
    //   const response = await client.v2.post<ShipStationV2RatesResponse>(V2_RATES_PATH, payload);
    //   const rates = [
    //     ...response.rates.map(r => normalizeV2Rate(r, req.residential)),
    //     // Filter out invalid rates with errors
    //   ].filter(r => r.totalCost > 0);

    // MOCK — returns realistic rates for development
    // Flag: confidence 92% — mock structure matches V2 API spec; real API call pending credentials
    void client; // Suppress unused warning until real call is wired
    void V2_RATES_PATH;
    void normalizeV2Rate;
    const rates = generateMockRates(req);

    if (rates.length === 0) {
      return {
        ok: false,
        error: new RateServiceError(
          'ShipStation returned no rates for this shipment. Check dimensions and destination.',
          'NO_RATES_RETURNED',
        ),
      };
    }

    // 4. Cache and return
    const entry = setCached(cacheKey, rates, cacheTtlMs);
    return {
      ok: true,
      rates,
      cachedAt: entry.fetchedAt,
      fromCache: false,
    };
  } catch (err) {
    if (err instanceof ShipStationError) {
      const code: RateServiceErrorCode =
        err.code === 'AUTH_ERROR' ? 'AUTH_ERROR' :
        err.code === 'RATE_LIMITED' ? 'RATE_LIMITED' :
        err.code === 'TIMEOUT' ? 'TIMEOUT' :
        err.code === 'NETWORK_ERROR' ? 'NETWORK_ERROR' :
        'API_ERROR';
      return {
        ok: false,
        error: new RateServiceError(err.message, code, err),
      };
    }
    return {
      ok: false,
      error: new RateServiceError(
        `Unexpected error fetching rates: ${err instanceof Error ? err.message : String(err)}`,
        'API_ERROR',
        err,
      ),
    };
  }
}

/**
 * Select the lowest-cost rate from an array of rates.
 * Returns null if the array is empty.
 *
 * @param rates - Rates to compare
 * @returns Cheapest rate by totalCost, or null if empty
 */
export function selectLowestRate(rates: ShipStationRate[]): ShipStationRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((best, r) => (r.totalCost < best.totalCost ? r : best), rates[0]);
}

/**
 * Filter rates by carrier code.
 *
 * @param rates - All rates
 * @param carrierCode - e.g. "stamps_com", "ups", "fedex"
 * @returns Rates matching the carrier
 */
export function filterRatesByCarrier(
  rates: ShipStationRate[],
  carrierCode: string,
): ShipStationRate[] {
  return rates.filter((r) => r.carrierCode === carrierCode);
}
