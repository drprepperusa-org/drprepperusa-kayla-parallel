/**
 * @file src/api/proxyClient.ts
 * @description Client-side typed fetch helpers for /api/* proxy endpoints.
 *
 * These functions replace direct ShipStation API calls in hooks.
 * Credentials are NEVER in this file — they live in server process.env only.
 *
 * Authentication: Sends PROXY_CLIENT_API_KEY (a client-to-server key)
 * in the x-api-key header. This is NOT the ShipStation API key.
 * Set PUBLIC_PROXY_API_KEY in client env (this is a different, less sensitive
 * key that authenticates the frontend to the backend proxy, not ShipStation).
 *
 * Design:
 * - Typed request/response shapes for each endpoint
 * - Sanitized error handling (status + message, no raw server errors)
 * - Retry-friendly: callers can catch and retry on 502
 */

import type { ShipStationRate } from '../services/rateService';
import type { OrderLabel } from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Auth header
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the proxy API key for client→server authentication.
 * Reads from PUBLIC_PROXY_API_KEY (client-safe, not ShipStation credentials).
 * Returns empty string if not set (server will return 401).
 */
function getProxyApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (import.meta.env['PUBLIC_PROXY_API_KEY'] as string | undefined) ?? '';
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared fetch helper
// ─────────────────────────────────────────────────────────────────────────────

interface ProxyFetchOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

interface ProxyErrorResponse {
  ok: false;
  status: number;
  error: string;
  code: string;
}

interface ProxySuccessResponse<T> {
  ok: true;
  status: number;
  data: T;
}

type ProxyResult<T> = ProxySuccessResponse<T> | ProxyErrorResponse;

async function proxyFetch<T>(options: ProxyFetchOptions): Promise<ProxyResult<T>> {
  const { method, path, body } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': getProxyApiKey(),
  };

  const init: RequestInit = {
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(path, init);
    const responseBody = await response.json().catch(() => ({ error: 'Non-JSON response', code: 'PARSE_ERROR' })) as unknown;

    if (!response.ok) {
      const errBody = responseBody as { error?: string; code?: string };
      return {
        ok: false,
        status: response.status,
        error: errBody?.error ?? `Request failed with status ${response.status}`,
        code: errBody?.code ?? 'UNKNOWN_ERROR',
      };
    }

    return {
      ok: true,
      status: response.status,
      data: responseBody as T,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      code: 'NETWORK_ERROR',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/rates/:orderId
// ─────────────────────────────────────────────────────────────────────────────

export interface GetRatesResponse {
  rates: ShipStationRate[];
  fromCache: boolean;
  cachedAt: string | null;
}

/**
 * Fetch shipping rates for an order via the server proxy.
 *
 * @param orderId - Internal order ID
 * @returns Typed proxy result (ok: true with rates, or ok: false with error)
 */
export async function fetchRatesFromProxy(
  orderId: string,
): Promise<ProxyResult<GetRatesResponse>> {
  return proxyFetch<GetRatesResponse>({
    method: 'GET',
    path: `/api/rates/${encodeURIComponent(orderId)}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/labels
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateLabelProxyRequest {
  orderId: string;
  carrierCode: string;
  serviceCode: string;
  weightOz: number;
  dimensions: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  shipFrom: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
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

export interface CreateLabelProxyResponse {
  label: OrderLabel;
}

/**
 * Create a shipping label via the server proxy.
 * Server handles V1+V2 routing; credentials never touch the client.
 *
 * @param request - Label creation parameters
 * @returns Typed proxy result (ok: true with label, or ok: false with error)
 */
export async function createLabelViaProxy(
  request: CreateLabelProxyRequest,
): Promise<ProxyResult<CreateLabelProxyResponse>> {
  return proxyFetch<CreateLabelProxyResponse>({
    method: 'POST',
    path: '/api/labels',
    body: request,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sync
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncProxyRequest {
  /** ISO timestamp of last sync, or null for full sync. */
  lastSyncTime: string | null;
}

export interface NormalizedOrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  weightOz: number;
}

export interface NormalizedOrder {
  id: string;
  orderNum: string;
  orderId: number;
  clientId: string;
  storeId?: number;
  /** ISO date string — deserialize to Date before passing to store. */
  orderDate: string;
  createdAt: string;
  lastUpdatedAt: string;
  customer: string;
  shipTo: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    residential: boolean;
    phone?: string;
  };
  items: NormalizedOrderItem[];
  itemCount: number;
  weightOz: number;
  status: string;
  externallyShipped: boolean;
}

export interface SyncProxyResponse {
  syncedAt: string;
  newOrders: number;
  updatedOrders: number;
  externallyShipped: number;
  fetchedCount: number;
  orders: NormalizedOrder[];
}

/**
 * Trigger a sync via the server proxy.
 * Server calls ShipStation V1 /orders; credentials never touch the client.
 *
 * @param lastSyncTime - ISO timestamp of last sync (null = full sync)
 * @returns Typed proxy result
 */
export async function syncViaProxy(
  lastSyncTime: Date | null,
): Promise<ProxyResult<SyncProxyResponse>> {
  const body: SyncProxyRequest = {
    lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
  };
  return proxyFetch<SyncProxyResponse>({
    method: 'POST',
    path: '/api/sync',
    body,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/billing
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingSettingsProxyResponse {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}

/**
 * Load billing settings via the server proxy.
 * Returns 404 if no settings configured yet (first-run; use store defaults).
 *
 * @returns Typed proxy result
 */
export async function fetchBillingSettingsFromProxy(): Promise<ProxyResult<BillingSettingsProxyResponse>> {
  return proxyFetch<BillingSettingsProxyResponse>({
    method: 'GET',
    path: '/api/settings/billing',
  });
}
