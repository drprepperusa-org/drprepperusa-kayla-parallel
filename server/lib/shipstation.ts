/**
 * @file server/lib/shipstation.ts
 * @description Server-side ShipStation API client.
 *
 * Wraps V1 (Basic Auth) and V2 (API-Key header) endpoints.
 * Credentials ONLY from server-side process.env — never browser.
 *
 * Error handling:
 * - 401 → ShipStationAuthError
 * - 429 → ShipStationRateLimitError (with Retry-After)
 * - 5xx → ShipStationServerError (retried with exponential backoff)
 * - Network → ShipStationNetworkError
 *
 * @example
 * const client = createServerShipStationClient();
 * const rates = await client.getRates({ orderId: '123', ... });
 */

import { createLogger } from './logger.js';

const log = createLogger('shipstation');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SS_BASE_V1 = process.env['SHIPSTATION_BASE_URL_V1'] ?? 'https://ssapi.shipstation.com';
export const SS_BASE_V2 = process.env['SHIPSTATION_BASE_URL_V2'] ?? 'https://api.shipstation.com/v2';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export type SSErrorCode = 'AUTH_ERROR' | 'RATE_LIMITED' | 'NOT_FOUND' | 'BAD_REQUEST' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT';

export class ShipStationError extends Error {
  constructor(
    message: string,
    public readonly code: SSErrorCode,
    public readonly statusCode?: number,
    public readonly retryAfterSecs?: number,
  ) {
    super(message);
    this.name = 'ShipStationError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V1/V2 Response types
// ─────────────────────────────────────────────────────────────────────────────

export interface SSV2RateItem {
  rate_id: string;
  carrier_id: string;
  carrier_code: string;
  carrier_friendly_name?: string;
  service_code: string;
  service_type?: string;
  shipping_amount: { currency: string; amount: number };
  other_amount: { currency: string; amount: number };
  insurance_amount: { currency: string; amount: number };
  delivery_days?: number | null;
  estimated_delivery_date?: string | null;
  guaranteed_service?: boolean;
  validation_status?: string;
  warning_messages?: string[];
  error_messages?: string[];
}

export interface SSV2RatesResponse {
  rates: SSV2RateItem[];
  invalid_rates: SSV2RateItem[];
}

export interface SSV2LabelResponse {
  label_id: string;
  status: string;
  tracking_number: string;
  service_code: string;
  carrier_code: string;
  shipment_cost: { currency: string; amount: number };
  label_download: { pdf?: string; png?: string; href?: string };
}

export interface SSV1OrderItem {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  createDate: string;
  modifyDate: string;
  billTo?: { name?: string };
  shipTo?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    residential?: boolean | null;
    phone?: string;
  };
  items?: Array<{
    lineItemKey: string;
    sku: string;
    name: string;
    quantity: number;
    weight?: { value: number; units: string };
  }>;
  weight?: { value: number; units: string };
  dimensions?: { units: string; length: number; width: number; height: number } | null;
  storeId?: number;
  advancedOptions?: { storeId?: number };
}

export interface SSV1OrdersResponse {
  orders: SSV1OrderItem[];
  total: number;
  page: number;
  pages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate fetch request
// ─────────────────────────────────────────────────────────────────────────────

export interface SSRateRequest {
  carrierCode?: string;
  fromPostalCode: string;
  toPostalCode: string;
  toCountry: string;
  weightOz: number;
  dimensions?: { lengthIn: number; widthIn: number; heightIn: number };
  residential?: boolean;
}

export interface SSLabelRequest {
  orderId: string;
  carrierCode: string;
  serviceCode: string;
  weightOz: number;
  dimensions: { lengthIn: number; widthIn: number; heightIn: number };
  shipFrom: {
    name: string;
    street1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  shipTo: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    residential?: boolean;
  };
  confirmation?: string;
  testLabel?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number, baseMs: number): number {
  return baseMs * Math.pow(2, attempt) + Math.random() * baseMs;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let lastErr: ShipStationError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(backoff(attempt - 1, BASE_BACKOFF_MS));
    }

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(tid);

      if (res.ok) return res;

      const body = await res.text();
      let message = body;
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        message = (parsed['message'] as string) ?? (parsed['errors'] as string) ?? body;
      } catch { /* ignore parse errors */ }

      if (res.status === 401) {
        throw new ShipStationError(`ShipStation authentication failed: ${message}`, 'AUTH_ERROR', 401);
      }
      if (res.status === 400) {
        throw new ShipStationError(`ShipStation bad request: ${message}`, 'BAD_REQUEST', 400);
      }
      if (res.status === 404) {
        throw new ShipStationError(`ShipStation resource not found`, 'NOT_FOUND', 404);
      }
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
        lastErr = new ShipStationError(`Rate limited by ShipStation`, 'RATE_LIMITED', 429, retryAfter);
        log.warn({ url, attempt, retryAfterSecs: retryAfter }, 'ShipStation rate limit hit — will retry');
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status >= 500) {
        lastErr = new ShipStationError(`ShipStation server error (${res.status}): ${message}`, 'SERVER_ERROR', res.status);
        log.warn({ url, attempt, status: res.status }, 'ShipStation server error — will retry');
        continue;
      }

      throw new ShipStationError(`Unexpected ShipStation response: ${res.status}`, 'SERVER_ERROR', res.status);
    } catch (err) {
      clearTimeout(tid);
      if (err instanceof ShipStationError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ShipStationError(`Request timed out after ${timeoutMs}ms`, 'TIMEOUT');
      }
      lastErr = new ShipStationError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );
    }
  }

  throw lastErr ?? new ShipStationError('Unknown error', 'NETWORK_ERROR');
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export interface ServerShipStationClient {
  getRates(orderId: string, req: SSRateRequest): Promise<SSV2RatesResponse>;
  createLabel(req: SSLabelRequest): Promise<SSV2LabelResponse>;
  getOrders(params: {
    lastSyncTime?: Date | null;
    storeId?: number | null;
    page?: number;
    pageSize?: number;
  }): Promise<SSV1OrdersResponse>;
}

/**
 * Create a server-side ShipStation client from environment variables.
 *
 * Required env vars:
 *   SHIPSTATION_API_KEY    — V2 API key (Bearer)
 *   SHIPSTATION_API_SECRET — V1 secret (for Basic Auth with API_KEY as username)
 *
 * Optional:
 *   SHIPSTATION_BASE_URL_V1  — override V1 base (for testing)
 *   SHIPSTATION_BASE_URL_V2  — override V2 base (for testing)
 */
export function createServerShipStationClient(overrides?: {
  baseUrlV1?: string;
  baseUrlV2?: string;
  apiKey?: string;
  apiSecret?: string;
}): ServerShipStationClient {
  const apiKey = overrides?.apiKey ?? process.env['SHIPSTATION_API_KEY'];
  const apiSecret = overrides?.apiSecret ?? process.env['SHIPSTATION_API_SECRET'];
  const baseV1 = overrides?.baseUrlV1 ?? SS_BASE_V1;
  const baseV2 = overrides?.baseUrlV2 ?? SS_BASE_V2;

  if (!apiKey) {
    throw new ShipStationError('Missing SHIPSTATION_API_KEY environment variable', 'AUTH_ERROR');
  }
  if (!apiSecret) {
    throw new ShipStationError('Missing SHIPSTATION_API_SECRET environment variable', 'AUTH_ERROR');
  }

  // V1 Basic Auth: base64(apiKey:apiSecret)
  const v1Auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const v1Headers = {
    Authorization: `Basic ${v1Auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // V2: API-Key header
  const v2Headers = {
    'API-Key': apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return {
    async getRates(orderId: string, req: SSRateRequest): Promise<SSV2RatesResponse> {
      const payload = {
        shipment: {
          carrier_id: req.carrierCode,
          packages: [
            {
              weight: { value: req.weightOz, unit: 'ounce' },
              ...(req.dimensions ? {
                dimensions: {
                  unit: 'inch',
                  length: req.dimensions.lengthIn,
                  width: req.dimensions.widthIn,
                  height: req.dimensions.heightIn,
                },
              } : {}),
            },
          ],
          ship_from: { postal_code: req.fromPostalCode, country_code: 'US' },
          ship_to: {
            postal_code: req.toPostalCode,
            country_code: req.toCountry,
            address_residential_indicator: req.residential ? 'yes' : 'no',
          },
        },
      };

      log.info({ orderId, event: 'rates.request', carrierCode: req.carrierCode }, 'Fetching rates from ShipStation V2');

      const res = await fetchWithRetry(`${baseV2}/rates/estimate`, {
        method: 'POST',
        headers: v2Headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json() as SSV2RatesResponse;
      log.info({ orderId, event: 'rates.response', count: data.rates?.length ?? 0 }, 'Rates received');
      return data;
    },

    async createLabel(req: SSLabelRequest): Promise<SSV2LabelResponse> {
      const payload = {
        shipment: {
          carrier_id: req.carrierCode,
          service_code: req.serviceCode,
          ship_date: new Date().toISOString().split('T')[0],
          ship_from: {
            name: req.shipFrom.name,
            address_line1: req.shipFrom.street1,
            city_locality: req.shipFrom.city,
            state_province: req.shipFrom.state,
            postal_code: req.shipFrom.postalCode,
            country_code: req.shipFrom.country,
          },
          ship_to: {
            name: req.shipTo.name,
            company_name: req.shipTo.company,
            address_line1: req.shipTo.street1,
            address_line2: req.shipTo.street2,
            city_locality: req.shipTo.city,
            state_province: req.shipTo.state,
            postal_code: req.shipTo.postalCode,
            country_code: req.shipTo.country,
            address_residential_indicator: req.shipTo.residential ? 'yes' : 'no',
          },
          packages: [
            {
              weight: { value: req.weightOz, unit: 'ounce' },
              dimensions: {
                unit: 'inch',
                length: req.dimensions.lengthIn,
                width: req.dimensions.widthIn,
                height: req.dimensions.heightIn,
              },
            },
          ],
          confirmation: req.confirmation ?? 'none',
          test_label: req.testLabel ?? false,
        },
      };

      log.info({ orderId: req.orderId, event: 'label.request', serviceCode: req.serviceCode }, 'Creating label via ShipStation V2');

      const res = await fetchWithRetry(`${baseV2}/labels`, {
        method: 'POST',
        headers: v2Headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json() as SSV2LabelResponse;
      log.info({ orderId: req.orderId, event: 'label.created', trackingNumber: data.tracking_number }, 'Label created');
      return data;
    },

    async getOrders(params): Promise<SSV1OrdersResponse> {
      const url = new URL(`${baseV1}/orders`);
      url.searchParams.set('pageSize', String(params.pageSize ?? 500));
      url.searchParams.set('page', String(params.page ?? 1));
      url.searchParams.set('sortBy', 'ModifyDate');
      url.searchParams.set('sortDir', 'ASC');

      if (params.lastSyncTime) {
        url.searchParams.set('modifyDateStart', params.lastSyncTime.toISOString());
      }
      if (params.storeId) {
        url.searchParams.set('storeId', String(params.storeId));
      }

      log.info({ event: 'sync.request', page: params.page ?? 1 }, 'Fetching orders from ShipStation V1');

      const res = await fetchWithRetry(url.toString(), {
        method: 'GET',
        headers: v1Headers,
      });

      const data = await res.json() as SSV1OrdersResponse;
      log.info({ event: 'sync.response', count: data.orders?.length ?? 0, total: data.total }, 'Orders received');
      return data;
    },
  };
}
