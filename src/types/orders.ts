/**
 * Order domain types — ported from prepship-v3
 */

// ---------------------------------------------------------------------------
// Primitives & utility types
// ---------------------------------------------------------------------------

/** Unique identifier for an order (internal, string form). */
export type OrderId = string;

/** Rounding strategy used in billing calculations. */
export type RoundingMethod = 'bankers' | 'standard';

// ---------------------------------------------------------------------------
// BillingCalculation — exported here so services/billingService.ts can import it.
// The `utils/billingService.ts` uses a legacy shape for backward compat.
// ---------------------------------------------------------------------------

export interface BillingCalculation {
  /** Raw carrier cost before markup. */
  baseRate: number;
  /** Residential delivery surcharge. */
  residentialSurcharge: number;
  /** Markup percentage applied. */
  carrierMarkupPercent: number;
  /** baseRate + residentialSurcharge */
  subtotal: number;
  /** Final total after markup, rounded via RoundingMethod. */
  totalCost: number;
  /** Human-readable audit trail, e.g. "$7.50 base + $4.40 residential × (1 + 15%) = $13.68" */
  breakdown: string;
  calculatedAt: Date;
  /** Which rounding algorithm was used. */
  roundingMethod: RoundingMethod;
}

// ---------------------------------------------------------------------------
// OrderLabel — shape locked by DJ contract (Q1 pending V1 provider ID path).
// DO NOT add/remove fields without resolving Q1.
// ---------------------------------------------------------------------------

export interface OrderLabel {
  /** Carrier-assigned tracking number. */
  trackingNumber: string;
  /** Shipment cost in dollars (from V2 response). */
  shipmentCost: number;
  /** Carrier code from V2 response. */
  v2CarrierCode: string;
  /** Service code from V2 response. */
  serviceCode: string;
  /** URL to the label PDF (may be undefined if V2 didn't return one). */
  labelUrl: string | undefined;
  /**
   * ShipStation V1 shipping provider ID (from V1 enrichment).
   * Q1 PENDING: exact field path in V1 response. Defaults to 0 if V1 fails.
   */
  v1ShippingProviderId: number;
  /** Carrier code from V1 enrichment. Empty string if V1 enrichment failed. */
  v1CarrierCode: string;
  createdAt: Date;
  /** Creator identifier (user ID or automation token). */
  createdBy?: string;
  /** True if the label was voided after creation. */
  voided: boolean;
}

// ---------------------------------------------------------------------------
// Order — canonical domain type used by syncService & ordersStore.allOrders.
// Distinct from OrderDTO (the legacy paginated API type).
// ---------------------------------------------------------------------------

export interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  weightOz: number;
}

/**
 * Canonical ship-to address for Order domain type.
 * All key fields required (unlike OrderAddress which allows optional fields for DTO compat).
 */
export interface OrderShipToAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  residential?: boolean;
}

export interface OrderShipFrom {
  name: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Package dimensions for canonical Order domain type (in inches).
 * Named with `In` suffix to distinguish from legacy OrderDimensions (no suffix).
 */
export interface OrderDimensionsIn {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';

/**
 * Canonical Order domain type. Used by syncService and ordersStore.allOrders.
 * Separate from OrderDTO (legacy ShipStation V1 API shape).
 */
export interface Order {
  /** Internal string ID (String(orderId)). */
  id: string;
  /** ShipStation order number (e.g. "ORD-100001"). */
  orderNum: string;
  /** ShipStation numeric order ID. */
  orderId: number;
  /** Multi-tenant client ID (storeId as string). */
  clientId: string;
  /** Raw ShipStation store ID. */
  storeId?: number;

  orderDate: Date;
  createdAt: Date;
  lastUpdatedAt: Date;

  /** Customer display name. */
  customer: string;
  customerId?: string;

  shipTo: OrderShipToAddress;
  shipFrom: OrderShipFrom;

  items: OrderItem[];
  itemCount: number;
  itemNames: string[];
  skus: string[];

  /** Total order weight in ounces. */
  weightOz: number;
  dimensions: OrderDimensionsIn;

  /** Base shipping rate (populated after rate fetch). */
  baseRate: number;

  status: OrderStatus;

  /** True if the order was shipped outside this app (Q6 heuristic). */
  externallyShipped: boolean;

  /** Label created for this order (undefined until printed). */
  label?: OrderLabel;

  /** Billing calculation result (populated by calculateOrderCosts action). */
  billing?: BillingCalculation;

  notes?: string;
}

// ---------------------------------------------------------------------------
// Legacy OrderDTO types (ShipStation V1 API shape — kept for backward compat)
// ---------------------------------------------------------------------------

export interface OrderDTOItem {
  sku: string;
  quantity: number;
  name?: string;
  price?: number;
  imageUrl?: string;
  adjustment?: boolean;
}

/**
 * Legacy dimensions shape used by OrderDTO (from ShipStation V1 API).
 * Uses `length/width/height` (no unit suffix).
 * Kept for backward compat with utils/orders.ts and PrintLabelButton.
 */
export interface OrderDimensions {
  length: number;
  width: number;
  height: number;
}

/** Alias for backward compat — prefer OrderDimensions for DTO types. */
export type OrderDTODimensions = OrderDimensions;

export interface OrderWeight {
  value: number;
  units: 'ounces' | 'grams';
}

/** Alias for backward compat. */
export type OrderDTOWeight = OrderWeight;

/**
 * Legacy address shape used by OrderDTO (all fields optional — mirrors ShipStation V1 API).
 * Used by: utils/labelService.ts, utils/orders.ts, PrintLabelButton.tsx
 *
 * Note: utils/labelService.ts imports OrderAddress from this file. Keep this
 * permissive shape to avoid breaking the old code and tests.
 */
export interface OrderAddress {
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** Alias for backward compat. */
export type OrderDTOAddress = OrderAddress;

export interface Rate {
  shipmentId?: string;
  shippingProviderId: number;
  carrierCode: string;
  serviceCode: string;
  serviceName: string;
  amount: number;
  shipmentCost?: number;
  otherCost?: number;
  carrierNickname?: string | null;
  deliveryDays?: number | null;
  estimatedDelivery?: string | null;
  estimatedDeliveryDays?: number;
  surcharges?: Array<{ name: string; amount: number }>;
}

/**
 * Enriched rate selection — populated by the Rate Enrichment Pipeline (Feature 6).
 */
export interface SelectedRate {
  carrierCode: string;
  serviceCode: string;
  /** Total rate in dollars (pre-markup). */
  rate: number;
  /** Timestamp when this rate was fetched from ShipStation. */
  fetchedAt: Date;
}

export interface OrderDTO {
  orderId: number;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  clientId: number;
  storeId: number;
  shipTo?: OrderAddress;
  residential?: boolean;
  sourceResidential?: boolean;
  items?: OrderDTOItem[];
  weight?: OrderWeight;
  dimensions?: OrderDimensions;
  selectedServiceCode?: string;
  selectedCarrierCode?: string;
  selectedShippingProviderId?: number;
  selectedRate?: Rate;
  billingProviderId?: number;
  orderTotal?: number;
  status: 'pending' | 'awaiting_shipment' | 'shipped' | 'cancelled';
  labelCreated?: string;
  trackingNumber?: string;
  printCount?: number;
  _enrichedWeight?: OrderWeight;
  _enrichedDims?: OrderDimensions;
  bestRate?: Rate;

  // --- Rate Enrichment Pipeline fields (Feature 6) ---
  enrichedRate?: SelectedRate;
  ratesFetched?: boolean;
  rateError?: string;

  // --- Billing Calculation fields (Feature 7) ---
  calculatedCost?: number;
  billingCalculation?: BillingCalculation;

  // --- Label / State Machine fields (Feature 8) ---
  label?: {
    shippingNumber: string;
    labelUrl: string;
    carrierCode: string;
    createdAt: Date;
    status: 'pending' | 'ready' | 'failed';
  };
}

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  sortable: boolean;
  defaultVisible: boolean;
}

export interface StoreDTO {
  clientId: number;
  name: string;
  storeIds: number[];
  platform?: string;
}

export interface ListOrdersResponse {
  orders: OrderDTO[];
  total: number;
  pages: number;
  currentPage: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Re-export legacy OrderLabel alias for OrderDTO.label shape compatibility
// (OrderDTO.label uses an inline type; OrderLabel is the canonical label type)
// ---------------------------------------------------------------------------

/** Legacy alias — prefer OrderLabel for new code. */
export type OrderLabelLegacy = NonNullable<OrderDTO['label']>;
