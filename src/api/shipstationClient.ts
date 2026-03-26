/**
 * @file shipstationClient.ts
 * @description HTTP client for ShipStation V1 + V2 APIs.
 *
 * Handles:
 * - Authentication (Basic Auth from env)
 * - Base URL routing (V1 vs V2)
 * - Request/response types
 * - Error handling (401, 429, 500+)
 * - Retry logic with exponential backoff
 *
 * @example
 * ```ts
 * const client = createShipStationClient({
 *   v1ApiKey: import.meta.env.PUBLIC_SHIPSTATION_API_KEY_V1,
 *   v2ApiKey: import.meta.env.PUBLIC_SHIPSTATION_API_KEY_V2,
 * });
 *
 * const rates = await client.v1.get<ShipStationRateItem[]>('/shipments/getrates', { body: payload });
 * const label = await client.v2.post<ShipStationV2LabelResponse>('/labels', labelPayload);
 * ```
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default ShipStation V1 base URL (legacy API). */
export const DEFAULT_BASE_URL_V1 = 'https://ssapi.shipstation.com';

/** Default ShipStation V2 base URL. */
export const DEFAULT_BASE_URL_V2 = 'https://api.shipstation.com/v2';

/** Maximum number of retry attempts (excluding the initial request). */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff. */
const BASE_DELAY_MS = 500;

/** Request timeout in milliseconds. */
const REQUEST_TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// Error Classes
// ─────────────────────────────────────────────────────────────────────────────

export type ShipStationErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

/**
 * Structured error thrown by the ShipStation client.
 * Always has a `code` for programmatic handling.
 */
export class ShipStationError extends Error {
  constructor(
    message: string,
    public readonly code: ShipStationErrorCode,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'ShipStationError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the ShipStation client.
 * API keys are loaded from environment variables via the caller.
 */
export interface ShipStationClientConfig {
  /**
   * ShipStation V1 API key. Used for Basic Auth on V1 endpoints.
   * Format: `base64(apiKey:apiSecret)` — pass the raw key; client handles encoding.
   */
  v1ApiKey: string;
  /**
   * ShipStation V2 API key. Used as Bearer token on V2 endpoints.
   */
  v2ApiKey: string;
  /**
   * Override V1 base URL (useful for testing/staging).
   * Defaults to https://ssapi.shipstation.com
   */
  baseUrlV1?: string;
  /**
   * Override V2 base URL (useful for testing/staging).
   * Defaults to https://api.shipstation.com/v2
   */
  baseUrlV2?: string;
  /**
   * Request timeout in ms. Defaults to 15000ms.
   */
  timeoutMs?: number;
}

/**
 * Options for a single API request.
 */
export interface RequestOptions {
  /** Query string parameters. */
  query?: Record<string, string | number | boolean>;
  /** Request body (will be JSON-serialized). */
  body?: unknown;
  /** Additional headers to merge. */
  headers?: Record<string, string>;
  /** Override retry count for this specific call. */
  maxRetries?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ShipStation V1 Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShipStationV1RateItem {
  serviceCode: string;
  serviceName: string;
  shipmentCost: number;
  otherCost: number;
}

export interface ShipStationV1ShipmentDetail {
  shipmentId: number;
  orderId: number;
  orderKey?: string;
  userId?: string;
  customerEmail?: string;
  orderDate?: string;
  createDate?: string;
  shipDate?: string;
  shipmentCost: number;
  insuranceCost?: number;
  trackingNumber?: string;
  isReturnLabel?: boolean;
  batchNumber?: string;
  carrierCode: string;
  serviceCode: string;
  packageCode?: string;
  confirmation?: string;
  warehouseId?: number;
  voided?: boolean;
  voidDate?: string;
  marketplaceNotified?: boolean;
  notifyErrorMessage?: string | null;
  shipTo?: {
    name?: string;
    company?: string;
    street1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    residential?: boolean;
  };
  weight?: { value: number; units: string };
  dimensions?: { units: string; length: number; width: number; height: number } | null;
  providerAccountId?: number;
  /** The shipping provider internal ID (maps to shippingProviderId in our domain). */
  providerAccount?: {
    provider: string;
    accountName: string;
    providerAccountId: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ShipStation V2 Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShipStationV2LabelResponse {
  label_id: string;
  status: string;
  shipment_id?: string;
  tracking_number: string;
  is_return_label?: boolean;
  rma_number?: string | null;
  is_international?: boolean;
  batch_id?: string | null;
  carrier_id?: string;
  service_code: string;
  package_code?: string;
  validation_status?: string;
  shipment_cost: {
    currency: string;
    amount: number;
  };
  insurance_cost?: {
    currency: string;
    amount: number;
  };
  label_download: {
    pdf?: string;
    png?: string;
    zpl?: string;
    href?: string;
  };
  form_download?: { href?: string } | null;
  insurance_claim?: unknown | null;
  packages?: unknown[];
  carrier_code?: string;
}

export interface ShipStationV2RateItem {
  rate_id: string;
  rate_type: string;
  carrier_id: string;
  shipping_amount: { currency: string; amount: number };
  insurance_amount: { currency: string; amount: number };
  confirmation_amount: { currency: string; amount: number };
  other_amount: { currency: string; amount: number };
  tax_amount?: { currency: string; amount: number } | null;
  zone?: number | null;
  package_type?: string | null;
  delivery_days?: number | null;
  guaranteed_service?: boolean;
  estimated_delivery_date?: string | null;
  carrier_delivery_days?: string | null;
  ship_date?: string | null;
  negotiated_rate?: boolean;
  service_type?: string;
  service_code: string;
  trackable?: boolean;
  carrier_code: string;
  carrier_nickname?: string;
  carrier_friendly_name?: string;
  validation_status?: string;
  warning_messages?: string[];
  error_messages?: string[];
}

export interface ShipStationV2RatesResponse {
  shipment_id?: string;
  rates: ShipStationV2RateItem[];
  invalid_rates: ShipStationV2RateItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sleep for `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine whether an HTTP status code is retryable.
 * Retries on 429 (rate limit) and 5xx server errors.
 */
function isRetryable(statusCode: number): boolean {
  return statusCode === 429 || statusCode >= 500;
}

/**
 * Extract a human-readable error message from a response body string.
 */
function extractApiErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return (
      (parsed['message'] as string) ??
      (parsed['Message'] as string) ??
      (parsed['ExceptionMessage'] as string) ??
      (parsed['errors'] as string) ??
      body
    );
  } catch {
    return body;
  }
}

/**
 * Calculate exponential backoff delay.
 * Adds jitter to prevent thundering herd.
 *
 * @param attempt - 0-indexed attempt number
 * @param baseMs - Base delay in ms
 * @returns Delay in ms with jitter
 */
function backoffDelay(attempt: number, baseMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return exponential + jitter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch with retry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a fetch request with retry logic and timeout.
 *
 * Retry policy:
 * - Retries on 429 (rate limited) and 5xx
 * - Uses exponential backoff with jitter
 * - Does NOT retry on 4xx (client errors)
 *
 * @throws {ShipStationError} on permanent failure
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number,
  timeoutMs: number,
): Promise<Response> {
  let lastError: ShipStationError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(backoffDelay(attempt - 1, BASE_DELAY_MS));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Non-retryable 4xx (except 429)
      if (!isRetryable(response.status) && !response.ok) {
        const body = await response.text();
        const message = extractApiErrorMessage(body);

        if (response.status === 401) {
          throw new ShipStationError(
            `ShipStation authentication failed. Check your API key.`,
            'AUTH_ERROR',
            401,
            body,
          );
        }
        if (response.status === 400) {
          throw new ShipStationError(
            `ShipStation bad request: ${message}`,
            'BAD_REQUEST',
            400,
            body,
          );
        }
        if (response.status === 404) {
          throw new ShipStationError(
            `ShipStation resource not found.`,
            'NOT_FOUND',
            404,
            body,
          );
        }
        throw new ShipStationError(
          `ShipStation API error (${response.status}): ${message}`,
          'UNKNOWN',
          response.status,
          body,
        );
      }

      // Success or retryable — return the response for further processing
      if (response.ok) {
        return response;
      }

      // Retryable error — log and loop
      const body = await response.text();
      const message = extractApiErrorMessage(body);
      lastError = new ShipStationError(
        response.status === 429
          ? `ShipStation rate limit hit. Retrying... (attempt ${attempt + 1}/${maxRetries + 1})`
          : `ShipStation server error (${response.status}): ${message}`,
        response.status === 429 ? 'RATE_LIMITED' : 'SERVER_ERROR',
        response.status,
        body,
      );

      console.warn('[shipstationClient] Retryable error', {
        attempt,
        status: response.status,
        url,
      });

    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof ShipStationError) throw err; // Already typed — rethrow

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new ShipStationError(
          `ShipStation request timed out after ${timeoutMs}ms.`,
          'TIMEOUT',
        );
        // Timeout — don't retry
        break;
      }

      lastError = new ShipStationError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );
    }
  }

  throw lastError ?? new ShipStationError('Unknown error', 'UNKNOWN');
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint caller factory
// ─────────────────────────────────────────────────────────────────────────────

interface ApiCaller {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, body: unknown, options?: RequestOptions) => Promise<T>;
  put: <T>(path: string, body: unknown, options?: RequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
}

function buildApiCaller(
  baseUrl: string,
  defaultHeaders: Record<string, string>,
  timeoutMs: number,
): ApiCaller {
  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      ...defaultHeaders,
      ...(options?.headers ?? {}),
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = {
      method,
      headers,
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetchWithRetry(
      url.toString(),
      init,
      options?.maxRetries ?? MAX_RETRIES,
      timeoutMs,
    );

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string, options?: RequestOptions) =>
      call<T>('GET', path, undefined, options),
    post: <T>(path: string, body: unknown, options?: RequestOptions) =>
      call<T>('POST', path, body, options),
    put: <T>(path: string, body: unknown, options?: RequestOptions) =>
      call<T>('PUT', path, body, options),
    delete: <T>(path: string, options?: RequestOptions) =>
      call<T>('DELETE', path, undefined, options),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ShipStation client with V1 and V2 sub-clients.
 *
 * @example
 * ```ts
 * const client = createShipStationClient({
 *   v1ApiKey: 'apiKey:apiSecret',  // Basic Auth pair
 *   v2ApiKey: 'ss-v2-api-key',     // Bearer token
 * });
 *
 * // V1 rate fetch
 * const rates = await client.v1.post<ShipStationV1RateItem[]>('/shipments/getrates', payload);
 *
 * // V2 label creation
 * const label = await client.v2.post<ShipStationV2LabelResponse>('/labels', labelPayload);
 *
 * // V1 shipment detail
 * const shipment = await client.v1.get<ShipStationV1ShipmentDetail>(`/shipments/${shipmentId}`);
 * ```
 */
export interface ShipStationClient {
  /** V1 API caller (Basic Auth, https://ssapi.shipstation.com) */
  v1: ApiCaller;
  /** V2 API caller (Bearer token, https://api.shipstation.com/v2) */
  v2: ApiCaller;
}

/**
 * Create a configured ShipStation client.
 *
 * Authentication:
 * - V1: Basic Auth with `apiKey:apiSecret` pair (pass as `v1ApiKey` in format "key:secret")
 * - V2: API key as Bearer token (`v2ApiKey`)
 *
 * @param config - Client configuration
 * @returns Configured ShipStation client with v1 and v2 sub-clients
 *
 * @example
 * ```ts
 * const client = createShipStationClient({
 *   v1ApiKey: `${process.env.SHIPSTATION_API_KEY_V1}:${process.env.SHIPSTATION_API_SECRET_V1}`,
 *   v2ApiKey: process.env.SHIPSTATION_API_KEY_V2,
 * });
 * ```
 */
export function createShipStationClient(config: ShipStationClientConfig): ShipStationClient {
  const timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const baseUrlV1 = config.baseUrlV1 ?? DEFAULT_BASE_URL_V1;
  const baseUrlV2 = config.baseUrlV2 ?? DEFAULT_BASE_URL_V2;

  // V1: Basic Auth — apiKey is "key:secret" pair, base64 encoded
  const v1AuthToken = typeof btoa !== 'undefined'
    ? btoa(config.v1ApiKey)
    : Buffer.from(config.v1ApiKey).toString('base64');

  const v1Headers: Record<string, string> = {
    Authorization: `Basic ${v1AuthToken}`,
    Accept: 'application/json',
  };

  // V2: API key as Bearer token
  const v2Headers: Record<string, string> = {
    'API-Key': config.v2ApiKey,
    Accept: 'application/json',
  };

  return {
    v1: buildApiCaller(baseUrlV1, v1Headers, timeoutMs),
    v2: buildApiCaller(baseUrlV2, v2Headers, timeoutMs),
  };
}

/**
 * Create a ShipStation client from environment variables.
 * Reads from import.meta.env (Vite/Rsbuild convention).
 *
 * Required env vars:
 * - PUBLIC_SHIPSTATION_API_KEY_V1
 * - PUBLIC_SHIPSTATION_API_SECRET_V1
 * - PUBLIC_SHIPSTATION_API_KEY_V2
 *
 * @throws {ShipStationError} if required env vars are missing
 */
export function createShipStationClientFromEnv(): ShipStationClient {
  const keyV1 = import.meta.env['PUBLIC_SHIPSTATION_API_KEY_V1'] as string | undefined;
  const secretV1 = import.meta.env['PUBLIC_SHIPSTATION_API_SECRET_V1'] as string | undefined;
  const keyV2 = import.meta.env['PUBLIC_SHIPSTATION_API_KEY_V2'] as string | undefined;

  if (!keyV1 || !secretV1) {
    throw new ShipStationError(
      'Missing ShipStation V1 credentials. Set PUBLIC_SHIPSTATION_API_KEY_V1 and PUBLIC_SHIPSTATION_API_SECRET_V1.',
      'AUTH_ERROR',
    );
  }
  if (!keyV2) {
    throw new ShipStationError(
      'Missing ShipStation V2 API key. Set PUBLIC_SHIPSTATION_API_KEY_V2.',
      'AUTH_ERROR',
    );
  }

  return createShipStationClient({
    v1ApiKey: `${keyV1}:${secretV1}`,
    v2ApiKey: keyV2,
    baseUrlV1: (import.meta.env['PUBLIC_SHIPSTATION_BASE_URL_V1'] as string | undefined) ?? DEFAULT_BASE_URL_V1,
    baseUrlV2: (import.meta.env['PUBLIC_SHIPSTATION_BASE_URL_V2'] as string | undefined) ?? DEFAULT_BASE_URL_V2,
  });
}
