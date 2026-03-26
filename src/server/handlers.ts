/**
 * @file src/server/handlers.ts
 * @description Framework-agnostic proxy handler stubs for ShipStation endpoints.
 *
 * All handlers:
 * 1. Validate auth (PROXY_API_KEY in x-api-key header or Authorization: Bearer)
 * 2. Validate rate limit (10 req/min per IP)
 * 3. Validate input shape
 * 4. Return typed stub responses (no real ShipStation calls yet)
 *
 * STUB STATUS: All endpoints return well-shaped stubs.
 * Real ShipStation integration is a separate backend task.
 * Credentials (SHIPSTATION_API_KEY, SHIPSTATION_API_SECRET) are read from
 * process.env server-side when real integration ships.
 *
 * Endpoints:
 *   GET  /api/rates/:orderId      → Fetch shipping rates (30min cache)
 *   POST /api/labels              → Create shipping label
 *   POST /api/sync                → Sync orders from ShipStation
 *   GET  /api/settings/billing    → Load billing settings
 *
 * Error sanitization: All server errors are caught and returned as
 * { error: string, code: string } — stack traces are never sent to client.
 */

import { validateAuth } from './auth';
import { checkRateLimit } from './rateLimiter';
import type {
  HandlerRequest,
  HandlerResponse,
  ApiErrorResponse,
  ProxyRate,
  ProxyLabelRequestBody,
  ProxySyncRequestBody,
  ProxyBillingSettings,
} from './types';
import type { OrderLabel } from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Shared guard: auth + rate limit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run auth + rate limit checks.
 * Returns a HandlerResponse if either check fails, null if both pass.
 */
function runGuards(req: HandlerRequest): HandlerResponse | null {
  const authResult = validateAuth(req);
  if (authResult) return authResult;

  const rateLimitResult = checkRateLimit(req.ip);
  if (rateLimitResult) return rateLimitResult;

  return null;
}

/**
 * Sanitize an unknown error into a safe client-facing error response.
 * Never exposes stack traces or internal messages.
 */
function sanitizeError(err: unknown, fallbackCode: string): ApiErrorResponse {
  // Log server-side (safe — not sent to client)
  console.error(`[proxy:${fallbackCode}] Internal error:`, err);

  return {
    error: 'An internal error occurred. Please try again.',
    code: fallbackCode,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rates response type
// ─────────────────────────────────────────────────────────────────────────────

export interface RatesResponse {
  rates: ProxyRate[];
  fromCache: boolean;
  cachedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: GET /api/rates/:orderId
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rates/:orderId
 *
 * Fetch shipping rates for an order.
 * STUB: Returns mock rates with correct shape.
 * Real integration: Calls ShipStation V2 /rates via server-side client.
 *
 * Cache: 30min in-memory TTL (stub always returns fromCache: false).
 *
 * @returns 200 { rates, fromCache, cachedAt }
 * @returns 400 if orderId is missing
 * @returns 401 if auth fails
 * @returns 429 if rate limited
 * @returns 502 if ShipStation call fails (real integration)
 */
export function handleGetRates(req: HandlerRequest): HandlerResponse {
  try {
    const guard = runGuards(req);
    if (guard) return guard;

    const orderId = req.params?.['orderId'];
    if (!orderId || orderId.trim() === '') {
      const body: ApiErrorResponse = {
        error: 'orderId is required.',
        code: 'VALIDATION_ERROR',
      };
      return { status: 400, body };
    }

    // STUB: Return mock rates with correct shape.
    // Real integration: call ShipStation V2 /rates using server-side credentials:
    //   const keyV2 = process.env.SHIPSTATION_API_KEY_V2;
    //   const result = await shipstationV2Client.rates.get(orderId, ...);
    const stubRates: ProxyRate[] = [
      {
        carrierCode: 'stamps_com',
        carrierName: 'USPS',
        serviceCode: 'usps_priority_mail',
        serviceName: 'USPS Priority Mail',
        totalCost: 8.50,
        shipmentCost: 8.10,
        otherCost: 0.40,
        deliveryDays: 2,
        estimatedDelivery: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        guaranteedDelivery: false,
        residential: false,
      },
      {
        carrierCode: 'stamps_com',
        carrierName: 'USPS',
        serviceCode: 'usps_first_class_mail',
        serviceName: 'USPS First Class Mail',
        totalCost: 4.25,
        shipmentCost: 4.00,
        otherCost: 0.25,
        deliveryDays: 5,
        estimatedDelivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        guaranteedDelivery: false,
        residential: false,
      },
    ];

    const body: RatesResponse = {
      rates: stubRates,
      fromCache: false,
      cachedAt: null,
    };
    return { status: 200, body };
  } catch (err) {
    return { status: 502, body: sanitizeError(err, 'RATES_UPSTREAM_ERROR') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: POST /api/labels
// ─────────────────────────────────────────────────────────────────────────────

export interface LabelResponse {
  label: OrderLabel;
}

/**
 * POST /api/labels
 *
 * Create a shipping label.
 * STUB: Returns mock label with correct OrderLabel shape.
 * Real integration: Two-call flow — V2 POST /labels + V1 GET /shipments/{id}.
 *
 * @returns 200 { label: OrderLabel }
 * @returns 400 if required fields are missing
 * @returns 401 if auth fails
 * @returns 429 if rate limited
 * @returns 502 if ShipStation call fails (real integration)
 */
export function handlePostLabel(req: HandlerRequest): HandlerResponse {
  try {
    const guard = runGuards(req);
    if (guard) return guard;

    const requestBody = req.body as ProxyLabelRequestBody | undefined;

    // Validate required fields
    if (!requestBody) {
      const body: ApiErrorResponse = { error: 'Request body is required.', code: 'VALIDATION_ERROR' };
      return { status: 400, body };
    }
    if (!requestBody.orderId || requestBody.orderId.trim() === '') {
      const body: ApiErrorResponse = { error: 'orderId is required.', code: 'VALIDATION_ERROR' };
      return { status: 400, body };
    }
    if (!requestBody.carrierCode || requestBody.carrierCode.trim() === '') {
      const body: ApiErrorResponse = { error: 'carrierCode is required.', code: 'VALIDATION_ERROR' };
      return { status: 400, body };
    }
    if (!requestBody.serviceCode || requestBody.serviceCode.trim() === '') {
      const body: ApiErrorResponse = { error: 'serviceCode is required.', code: 'VALIDATION_ERROR' };
      return { status: 400, body };
    }
    if (!requestBody.weightOz || requestBody.weightOz <= 0) {
      const body: ApiErrorResponse = { error: 'weightOz must be > 0.', code: 'VALIDATION_ERROR' };
      return { status: 400, body };
    }

    // STUB: Return mock label with correct OrderLabel shape.
    // Real integration: Two-call flow via server-side ShipStation client:
    //   const keyV1 = process.env.SHIPSTATION_API_KEY_V1;
    //   const secretV1 = process.env.SHIPSTATION_API_SECRET_V1;
    //   const keyV2 = process.env.SHIPSTATION_API_KEY_V2;
    //   const client = createShipStationClient({ v1ApiKey: `${keyV1}:${secretV1}`, v2ApiKey: keyV2 });
    //   const result = await createLabel(requestBody, client);
    const stubLabel: OrderLabel = {
      trackingNumber: `STUB-${requestBody.orderId}-${Date.now()}`,
      shipmentCost: 8.50,
      v2CarrierCode: requestBody.carrierCode,
      serviceCode: requestBody.serviceCode,
      labelUrl: 'https://stub.example.com/label.pdf',
      v1ShippingProviderId: 0,
      v1CarrierCode: requestBody.carrierCode,
      createdAt: new Date(),
      voided: false,
    };

    const body: LabelResponse = { label: stubLabel };
    return { status: 200, body };
  } catch (err) {
    return { status: 502, body: sanitizeError(err, 'LABEL_UPSTREAM_ERROR') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: POST /api/sync
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncResponse {
  syncedAt: string;
  newOrders: number;
  updatedOrders: number;
  externallyShipped: number;
  fetchedCount: number;
}

/**
 * POST /api/sync
 *
 * Sync orders from ShipStation.
 * STUB: Returns empty sync result with correct shape.
 * Real integration: Calls ShipStation V1 /orders with incremental filter.
 *
 * @returns 200 { syncedAt, newOrders, updatedOrders, externallyShipped, fetchedCount }
 * @returns 401 if auth fails
 * @returns 429 if rate limited
 * @returns 502 if ShipStation call fails (real integration)
 */
export function handlePostSync(req: HandlerRequest): HandlerResponse {
  try {
    const guard = runGuards(req);
    if (guard) return guard;

    const requestBody = req.body as ProxySyncRequestBody | undefined;
    const lastSyncTime = requestBody?.lastSyncTime ?? null;

    // Validate lastSyncTime if provided
    if (lastSyncTime !== null) {
      const parsed = new Date(lastSyncTime);
      if (isNaN(parsed.getTime())) {
        const body: ApiErrorResponse = {
          error: 'lastSyncTime must be a valid ISO timestamp or null.',
          code: 'VALIDATION_ERROR',
        };
        return { status: 400, body };
      }
    }

    // STUB: Return empty sync result.
    // Real integration: Call syncOrders via server-side ShipStation client:
    //   const keyV1 = process.env.SHIPSTATION_API_KEY_V1;
    //   const secretV1 = process.env.SHIPSTATION_API_SECRET_V1;
    //   const keyV2 = process.env.SHIPSTATION_API_KEY_V2;
    //   const client = createShipStationClient({ ... });
    //   const outcome = await syncOrders({ lastSyncTime: parsed }, client, []);
    const body: SyncResponse = {
      syncedAt: new Date().toISOString(),
      newOrders: 0,
      updatedOrders: 0,
      externallyShipped: 0,
      fetchedCount: 0,
    };
    return { status: 200, body };
  } catch (err) {
    return { status: 502, body: sanitizeError(err, 'SYNC_UPSTREAM_ERROR') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: GET /api/settings/billing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/settings/billing
 *
 * Load billing settings.
 * STUB: Returns default settings with correct shape.
 * Real integration: Reads from DB billing_settings table.
 *
 * @returns 200 { prepCost, packageCostPerOz, syncFrequencyMin, autoVoidAfterDays }
 * @returns 401 if auth fails
 * @returns 429 if rate limited
 * @returns 502 if DB call fails (real integration)
 */
export function handleGetBillingSettings(req: HandlerRequest): HandlerResponse {
  try {
    const guard = runGuards(req);
    if (guard) return guard;

    // STUB: Return default billing settings.
    // Real integration: Read from DB:
    //   const settings = await db.billingSettings.findFirst({ where: { clientId: null } });
    //   if (!settings) return { status: 404, body: { error: 'No settings configured.', code: 'NOT_FOUND' } };
    const body: ProxyBillingSettings = {
      prepCost: 0,
      packageCostPerOz: 0,
      syncFrequencyMin: 5,
      autoVoidAfterDays: null,
    };
    return { status: 200, body };
  } catch (err) {
    return { status: 502, body: sanitizeError(err, 'SETTINGS_UPSTREAM_ERROR') };
  }
}
