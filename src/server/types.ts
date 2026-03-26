/**
 * @file src/server/types.ts
 * @description Shared types for server-side proxy handlers.
 *
 * These types are used internally by the proxy handlers
 * (src/server/handlers.ts) and are not part of the client bundle.
 *
 * The handlers accept a framework-agnostic HandlerRequest and return
 * a HandlerResponse so they can be tested without an HTTP runtime.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Framework-agnostic request/response types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized incoming request for proxy handlers.
 * Decoupled from any HTTP framework (Express, Hono, etc.)
 */
export interface HandlerRequest {
  /** Normalized headers — lowercased keys. */
  headers: Record<string, string | undefined>;
  /** Route params (e.g. { orderId: 'abc' } from /api/rates/:orderId). */
  params?: Record<string, string>;
  /** Parsed JSON body (undefined for GET requests). */
  body?: unknown;
  /**
   * Client IP address for rate limiting.
   * Use 'unknown' if unavailable (will be rate-limited together).
   */
  ip?: string;
}

/** Handler return value — HTTP status + serializable body. */
export interface HandlerResponse {
  status: number;
  body: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error response shapes
// ─────────────────────────────────────────────────────────────────────────────

/** Sanitized error body — never exposes stack traces to clients. */
export interface ApiErrorResponse {
  error: string;
  code: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared rate type (mirrors ShipStationRate from services/rateService.ts)
// Duplicated here so server code has no client/browser imports.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProxyRate {
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  totalCost: number;
  shipmentCost: number;
  otherCost: number;
  deliveryDays: number | null;
  estimatedDelivery: string | null;
  guaranteedDelivery: boolean;
  residential: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Label request body (mirrors LabelRequest from services/labelService.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProxyLabelAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ProxyLabelRequestBody {
  orderId: string;
  carrierCode: string;
  serviceCode: string;
  weightOz: number;
  dimensions: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  shipFrom: ProxyLabelAddress;
  shipTo: ProxyLabelAddress & { residential?: boolean };
  confirmation?: string;
  testLabel?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync request body
// ─────────────────────────────────────────────────────────────────────────────

export interface ProxySyncRequestBody {
  /** ISO string timestamp of last sync — used for incremental fetch. */
  lastSyncTime: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing settings response (mirrors BillingSettingsResponse from types/billing.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProxyBillingSettings {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}
