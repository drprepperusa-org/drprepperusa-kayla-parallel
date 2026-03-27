/**
 * billingApi.ts — Backend API stubs for billing endpoints.
 *
 * Q7 (DJ, LOCKED): "Billing should be stored in database."
 * These stubs wire the frontend billingStore to the backend REST API.
 *
 * Endpoints:
 *   POST   /api/billing/:orderId          → Create billing (auto on ship)
 *   PUT    /api/billing/:orderId          → Recalculate billing
 *   PUT    /api/billing/:orderId/void     → Void billing
 *   GET    /api/billing                   → List billings (with filters)
 *   POST   /api/billing/recalculate-bulk  → Bulk recalculate
 *   GET    /api/settings/billing          → Get settings
 *   PUT    /api/settings/billing          → Update settings
 *
 * Error handling:
 *   404 → Settings not yet configured (first-run, use defaults)
 *   409 → Conflict (billing already exists for order, use PUT instead)
 *   500 → DB error (log + surface to UI)
 */

import type {
  BillingRecordResponse,
  CreateBillingBody,
  RecalculateBillingBody,
  VoidBillingBody,
  ListBillingsQuery,
  ListBillingsResponse,
  BulkRecalculateBody,
  BulkRecalculateResponse,
  BillingSettingsResponse,
  UpdateBillingSettingsBody,
} from '../types/billing';

// Rsbuild injects PUBLIC_API_BASE via source.define at build time.
// Falls back to /api (relative) which works when frontend + backend run on same host.
// For local dev with separate ports, set PUBLIC_API_BASE=http://localhost:3001/api in .env
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE: string = (import.meta.env as any).PUBLIC_API_BASE ?? process.env['PUBLIC_API_BASE'] ?? '/api';

/**
 * Generic fetch wrapper. Throws on non-2xx responses.
 * @internal
 */
async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options?: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
  }
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxyApiKey: string = (import.meta.env as any).PUBLIC_PROXY_API_KEY ?? process.env['PUBLIC_PROXY_API_KEY'] ?? '';
  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': proxyApiKey,
    },
  };
  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw Object.assign(
      new Error(`API ${method} ${path}: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`),
      { status: response.status }
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing record endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/billing/:orderId
 * Create billing record when an order is shipped.
 * Q7: Called automatically when markOrderAsShipped fires.
 *
 * Returns 409 if billing already exists — use recalculateBilling() instead.
 */
export async function createBilling(
  orderId: string,
  body: CreateBillingBody
): Promise<BillingRecordResponse> {
  return apiRequest<BillingRecordResponse>('POST', `/billing/${orderId}`, { body });
}

/**
 * PUT /api/billing/:orderId
 * Recalculate and update an existing billing record.
 * Q7: "There should be a calculate button that allows the user to refresh the
 * calculations based on any fields that have changed."
 *
 * Returns 404 if no billing record exists — use createBilling() instead.
 */
export async function recalculateBillingApi(
  orderId: string,
  body: RecalculateBillingBody
): Promise<BillingRecordResponse> {
  return apiRequest<BillingRecordResponse>('PUT', `/billing/${orderId}`, { body });
}

/**
 * PUT /api/billing/:orderId/void
 * Void a billing record. Voided records cannot be recalculated.
 * Q7: "If an order has been voided, then there should be a mark on the billing
 * at the order level notating that."
 */
export async function voidBillingApi(
  orderId: string,
  body: VoidBillingBody
): Promise<BillingRecordResponse> {
  return apiRequest<BillingRecordResponse>('PUT', `/billing/${orderId}/void`, { body });
}

/**
 * GET /api/billing
 * List billing records with optional filters.
 * Supports: clientId, dateStart, dateEnd, voided, page, pageSize.
 */
export async function listBillings(
  query?: ListBillingsQuery
): Promise<ListBillingsResponse> {
  return apiRequest<ListBillingsResponse>('GET', '/billing', {
    query: query as Record<string, string | number | boolean | undefined | null>,
  });
}

/**
 * POST /api/billing/recalculate-bulk
 * Recalculate all non-voided billings within a date range.
 * Returns count of recalculated, skipped (voided), and errors.
 */
export async function bulkRecalculate(
  body: BulkRecalculateBody
): Promise<BulkRecalculateResponse> {
  return apiRequest<BulkRecalculateResponse>('POST', '/billing/recalculate-bulk', { body });
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/settings/billing
 * Load billing settings (prepCost, packageCostPerOz, syncFrequencyMin, autoVoidAfterDays).
 *
 * Returns 404 if no settings have been saved yet (first-run).
 * Callers should catch 404 and fall back to store defaults.
 */
export async function getBillingSettings(): Promise<BillingSettingsResponse> {
  return apiRequest<BillingSettingsResponse>('GET', '/settings/billing');
}

/**
 * PUT /api/settings/billing
 * Update billing settings. All fields optional (partial update).
 * Creates settings row if none exists.
 */
export async function updateBillingSettings(
  body: UpdateBillingSettingsBody
): Promise<BillingSettingsResponse> {
  return apiRequest<BillingSettingsResponse>('PUT', '/settings/billing', { body });
}
