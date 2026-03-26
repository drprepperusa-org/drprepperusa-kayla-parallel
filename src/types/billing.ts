/**
 * billing.ts — TypeScript types for billing database records and API shapes.
 *
 * Q7 (DJ, LOCKED): "Billing should be stored in database."
 * Schema: See src/db/schema.sql (order_billing, billing_settings tables).
 *
 * These types mirror the DB schema exactly — snake_case fields map to the
 * columns in the migration. API responses use camelCase (see API types below).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Database record types (snake_case = column names)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Row shape for the `order_billing` table.
 * Persisted when an order is shipped (auto-calculate) or recalculated.
 */
export interface BillingRecord {
  id: string;
  order_id: string;
  client_id: string | null;

  // Cost inputs
  shipping_cost: number;
  prep_cost: number;
  package_cost: number;
  carrier_markup_percent: number;
  markup_amount: number;

  // Totals
  subtotal: number;
  total_cost: number;

  // Audit
  breakdown: string | null;
  rounding_method: string;

  // Status
  voided: boolean;
  voided_at: string | null; // ISO timestamp

  // Timestamps
  calculated_at: string; // ISO timestamp
  created_at: string;
  updated_at: string;
}

/**
 * Row shape for the `billing_settings` table.
 * client_id = null means global defaults.
 */
export interface BillingSettingsRecord {
  id: string;
  client_id: string | null;

  // Q7 billing fields
  prep_cost: number;
  package_cost_per_oz: number;

  // Sync frequency (minutes): 5, 10, 30, 60
  sync_frequency_min: 5 | 10 | 30 | 60;

  // Auto-void configuration
  auto_void_after_days: number | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API request/response types (camelCase)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Response from GET /api/billing/:orderId and POST/PUT /api/billing/:orderId.
 * Maps BillingRecord to camelCase for frontend consumption.
 */
export interface BillingRecordResponse {
  id: string;
  orderId: string;
  clientId: string | null;

  shippingCost: number;
  prepCost: number;
  packageCost: number;
  carrierMarkupPercent: number;
  markupAmount: number;
  subtotal: number;
  totalCost: number;

  breakdown: string | null;
  roundingMethod: string;

  voided: boolean;
  voidedAt: string | null;

  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for POST /api/billing/:orderId (create billing on ship).
 * Called automatically when an order is marked as shipped.
 */
export interface CreateBillingBody {
  shippingCost: number;
  weightOz: number;
  carrierMarkupPercent: number;
  clientId?: string;
  /** Optional customer name (display only, not stored in order_billing) */
  customer?: string;
}

/**
 * Body for PUT /api/billing/:orderId (recalculate billing).
 */
export interface RecalculateBillingBody {
  shippingCost: number;
  weightOz: number;
  carrierMarkupPercent: number;
}

/**
 * Body for PUT /api/billing/:orderId/void.
 */
export interface VoidBillingBody {
  voided: true;
  voidedAt: string; // ISO timestamp
}

/**
 * Query params for GET /api/billing.
 */
export interface ListBillingsQuery {
  clientId?: string;
  dateStart?: string; // ISO date string
  dateEnd?: string;   // ISO date string
  voided?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Response from GET /api/billing (list with filters).
 */
export interface ListBillingsResponse {
  billings: BillingRecordResponse[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

/**
 * Body for POST /api/billing/recalculate-bulk.
 * Recalculates all non-voided billings within a date range.
 */
export interface BulkRecalculateBody {
  clientId?: string;
  dateStart?: string;
  dateEnd?: string;
}

/**
 * Response from POST /api/billing/recalculate-bulk.
 */
export interface BulkRecalculateResponse {
  recalculated: number;
  skippedVoided: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * API shape for GET/PUT /api/settings/billing.
 * Stored in billing_settings table.
 */
export interface BillingSettingsResponse {
  prepCost: number;
  packageCostPerOz: number;
  /** Sync interval in minutes (5 | 10 | 30 | 60). */
  syncFrequencyMin: 5 | 10 | 30 | 60;
  /** Auto-void after N days (null = disabled). */
  autoVoidAfterDays: number | null;
}

/**
 * Body for PUT /api/settings/billing.
 * All fields optional — partial update allowed.
 */
export interface UpdateBillingSettingsBody {
  prepCost?: number;
  packageCostPerOz?: number;
  syncFrequencyMin?: 5 | 10 | 30 | 60;
  autoVoidAfterDays?: number | null;
}
