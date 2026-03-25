/**
 * rateService.ts — ShipStation Rate Fetching Service
 *
 * SCAFFOLD STATUS: Rate Enrichment Pipeline (Feature 6)
 * -------------------------------------------------------
 * This file is a scaffold — the ShipStation API call is stubbed with
 * a placeholder implementation. Once the backend proxy/credentials layer
 * ships, replace the TODO block in fetchRatesFromShipStation().
 *
 * MARKUP INTEGRATION: NOT YET APPLIED
 * Once Markup Chain (Feature 4) ships, update applyMarkup() and wire it
 * into selectBestRate(). See TODO comments below.
 *
 * MULTI-TENANT CREDENTIALS
 * Each client has their own ShipStation API key/secret. Credentials are
 * accepted as a parameter here. Where they're stored is TBD (auth store
 * or backend secret store) — resolved upstream before calling this service.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateFetchRequest {
  /** Order identifier — for logging/tracing; not included in cache key. */
  orderId: string;
  /** Multi-tenant client identifier. */
  clientId: string;
  /**
   * Carrier code — ShipStation carrier code format, e.g. 'stamps_com', 'fedex', 'ups'.
   * The legacy UI uses 'USPS' / 'UPS' / 'FedEx' labels; normalise to ShipStation codes
   * before passing here.
   */
  carrierCode: string;
  /** Package weight in ounces. */
  weight: number;
  /** Package dimensions in inches. */
  dimensions: { length: number; width: number; height: number };
  /** 5-digit origin postal code. */
  originZip: string;
  /** 5-digit destination postal code. */
  destinationZip: string;
  /** Whether the destination is a residential address. */
  residential: boolean;
}

export interface ClientCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface ShipStationRate {
  carrierCode: string;
  serviceCode: string;
  /** Total shipment rate in dollars. */
  rate: number;
}

// ---------------------------------------------------------------------------
// Internal: ShipStation API payload shapes
// (mirrors /shipments/getrates request/response)
// ---------------------------------------------------------------------------

interface ShipStationGetRatesPayload {
  carrierCode: string;
  fromPostalCode: string;
  toPostalCode: string;
  toState?: string;
  toCountry: string;
  toCity?: string;
  weight: { value: number; units: 'ounces' };
  dimensions?: { units: 'inches'; length: number; width: number; height: number };
  residential: boolean;
  confirmation?: string;
}

interface _ShipStationGetRatesResponseItem {
  serviceCode: string;
  serviceName: string;
  shipmentCost: number;
  otherCost: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SHIPSTATION_API_BASE = 'https://ssapi.shipstation.com';
const _SHIPSTATION_RATES_ENDPOINT = `${SHIPSTATION_API_BASE}/shipments/getrates`;

/**
 * Fetch shipping rates from ShipStation for a given request.
 *
 * Multi-tenant: each client supplies their own API key/secret via
 * Basic Auth (base64(apiKey:apiSecret)).
 *
 * TODO: Replace stub with real HTTP call once backend proxy is ready.
 * The payload and response shapes are wired correctly — just need real creds.
 *
 * Error handling: logs and returns [] on any failure — caller decides UI state.
 */
export async function fetchRatesFromShipStation(
  request: RateFetchRequest,
  clientCredentials: ClientCredentials,
): Promise<ShipStationRate[]> {
  // Validate required fields before hitting the API
  if (!request.originZip || !request.destinationZip) {
    console.warn('[rateService] fetchRatesFromShipStation: missing origin or destination ZIP', {
      orderId: request.orderId,
    });
    return [];
  }
  if (!Number.isFinite(request.weight) || request.weight < 0) {
    console.warn('[rateService] fetchRatesFromShipStation: invalid weight', {
      orderId: request.orderId,
      weight: request.weight,
    });
    return [];
  }
  if (!clientCredentials.apiKey || !clientCredentials.apiSecret) {
    console.warn('[rateService] fetchRatesFromShipStation: missing client credentials', {
      orderId: request.orderId,
      clientId: request.clientId,
    });
    return [];
  }

  const payload: ShipStationGetRatesPayload = {
    carrierCode: request.carrierCode,
    fromPostalCode: request.originZip.replace(/\D/g, '').slice(0, 5),
    toPostalCode: request.destinationZip.replace(/\D/g, '').slice(0, 5),
    toCountry: 'US',
    weight: { value: request.weight, units: 'ounces' },
    dimensions: {
      units: 'inches',
      length: request.dimensions.length,
      width: request.dimensions.width,
      height: request.dimensions.height,
    },
    residential: request.residential,
  };

  // TODO: Replace this stub with a real fetch() or axios call once:
  //   1. Backend CORS proxy or direct ShipStation access is confirmed
  //   2. Credential storage strategy (auth store vs backend secret) is resolved
  //   3. Rate endpoint URL is confirmed (staging vs production)
  //
  // Real implementation will look like:
  //
  //   const authHeader = btoa(`${clientCredentials.apiKey}:${clientCredentials.apiSecret}`);
  //   const response = await fetch(SHIPSTATION_RATES_ENDPOINT, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: `Basic ${authHeader}`,
  //     },
  //     body: JSON.stringify(payload),
  //   });
  //   if (!response.ok) {
  //     throw new Error(`ShipStation API error: ${response.status} ${response.statusText}`);
  //   }
  //   const data: ShipStationGetRatesResponseItem[] = await response.json();
  //   return data.map(item => ({
  //     carrierCode: request.carrierCode,
  //     serviceCode: item.serviceCode,
  //     rate: item.shipmentCost + item.otherCost,
  //   }));

  try {
    // STUB: return empty rates until real integration is wired
    console.info('[rateService] STUB: fetchRatesFromShipStation called — returning empty rates', {
      orderId: request.orderId,
      clientId: request.clientId,
      carrierCode: request.carrierCode,
      payload,
    });
    return [];
  } catch (err) {
    console.error('[rateService] fetchRatesFromShipStation failed', {
      orderId: request.orderId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Select the best (lowest-cost) rate from an array of ShipStation rates.
 * Returns null if the array is empty.
 *
 * TODO (Markup Chain integration): Once markups are available, this function
 * should receive a markupMap and apply:
 *   finalCost = rate.rate + (rate.rate × carrierMarkup%) + residentialSurcharge
 * For now, raw rates are compared.
 */
export function selectBestRate(rates: ShipStationRate[]): ShipStationRate | null {
  if (!rates || rates.length === 0) return null;

  return rates.reduce<ShipStationRate>((best, current) => {
    return current.rate < best.rate ? current : best;
  }, rates[0]);
}

/**
 * Build a RateFetchRequest from an OrderDTO.
 * Returns null if the order is missing required shipping data.
 *
 * Used by the store enrichment action and React Query hooks.
 */
export function buildRateFetchRequest(
  order: {
    orderId: number | string;
    clientId: number | string;
    weight?: { value: number; units: 'ounces' | 'grams' } | null;
    dimensions?: { length: number; width: number; height: number } | null;
    shipTo?: { postalCode?: string } | null;
    residential?: boolean;
    _enrichedWeight?: { value: number; units: 'ounces' | 'grams' } | null;
    _enrichedDims?: { length: number; width: number; height: number } | null;
  },
  carrierCode: string,
  originZip: string,
): RateFetchRequest | null {
  const weight = order._enrichedWeight ?? order.weight;
  const dims = order._enrichedDims ?? order.dimensions;
  const destZip = order.shipTo?.postalCode;

  if (!weight || !dims || !destZip || !originZip) {
    return null;
  }

  // Convert grams to ounces if needed
  const weightOz =
    weight.units === 'grams' ? weight.value / 28.3495 : weight.value;

  return {
    orderId: String(order.orderId),
    clientId: String(order.clientId),
    carrierCode,
    weight: weightOz,
    dimensions: dims,
    originZip,
    destinationZip: destZip,
    residential: order.residential ?? false,
  };
}
