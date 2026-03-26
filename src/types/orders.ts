/**
 * @file orders.ts
 * @description Core domain types for the DrPrepper orders system.
 *
 * Design principles:
 * - `Order` is the canonical entity — complete API response, never mutated
 * - `OrderDTO` kept for backward compatibility with existing API layer
 * - All Date fields are Date objects (never raw strings in the store)
 * - `unknown` over `any` everywhere — callers must narrow types explicitly
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive / Shared Aliases
// ─────────────────────────────────────────────────────────────────────────────

/** ShipStation-compatible order status values. */
export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';

/** Supported page-size options for the orders table. */
export type PageSize = 50 | 100 | 200;

/** Table zoom levels (percentage). */
export type ZoomLevel = 100 | 115 | 125;

/** Selection mode for the orders table. null = nothing selected. */
export type SelectionMode = 'checkbox' | 'row-click' | null;

/** Right-side panel type driven by current selection. */
export type PanelType = 'empty' | 'shipping-panel' | 'batch-panel' | 'order-details-panel';

/** Rounding method for billing calculations. */
export type RoundingMethod = 'bankers' | 'standard';

/** Opaque string ID for an Order. */
export type OrderId = string;

/**
 * Date filter presets plus a custom range.
 * Note: No 'all' option — 'today' is the default.
 * Custom ranges require explicit start/end (no open-ended ranges).
 */
export type DateFilter =
  | 'today'
  | 'yesterday'
  | 'last-7-days'
  | 'last-14-days'
  | 'last-30-days'
  | 'last-90-days'
  | { start: Date; end: Date };

// ─────────────────────────────────────────────────────────────────────────────
// Shared Sub-structures
// ─────────────────────────────────────────────────────────────────────────────

/** Physical package dimensions in inches. */
export interface Dimensions {
  /** Package length in inches. */
  lengthIn: number;
  /** Package width in inches. */
  widthIn: number;
  /** Package height in inches. */
  heightIn: number;
}

/** Shipping address. */
export interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  /** ZIP or postal code. */
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
  country: string;
  phone?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderItem
// ─────────────────────────────────────────────────────────────────────────────

/** A single line item within an order. */
export interface OrderItem {
  id: string;
  sku: string;
  name: string;
  /** Quantity ordered. Must be >= 1. */
  quantity: number;
  /** Per-unit weight in ounces. */
  weightOz: number;
  dimensions?: Dimensions;
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderLabel — IMMUTABLE CONTRACT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps raw ShipStation V1 + V2 label response fields.
 * All fields normalized to camelCase — raw API names noted in comments.
 *
 * IMMUTABLE CONTRACT (per DJ spec):
 * Once a label is created, this structure never changes.
 * No additions, no removals, even if future features request it.
 */
export interface OrderLabel {
  // ── ShipStation V2 create-label response ──────────────────────────────────
  /** V2: tracking_number */
  trackingNumber: string;
  /** V2: shipment_cost (dollars) */
  shipmentCost: number;
  /** V2: carrier_code (e.g. "stamps_com") */
  v2CarrierCode: string;
  /** V2: service_code (e.g. "usps_priority_mail") */
  serviceCode: string;
  /** V2: label_download.pdf — absent for thermal (ZPL) labels */
  labelUrl?: string;

  // ── ShipStation V1 create-label response ──────────────────────────────────
  /** V1: shipmentId → providerAccountId */
  v1ShippingProviderId: number;
  /** V1: carrierCode — may differ from V2 value (legacy naming) */
  v1CarrierCode: string;

  // ── Metadata ──────────────────────────────────────────────────────────────
  createdAt: Date;
  /** UserId of whoever printed the label; undefined for automation/sync. */
  createdBy?: string;

  // ── Void state ────────────────────────────────────────────────────────────
  /** Always present — false until voided. Voiding does NOT delete the label. */
  voided: boolean;
  /** Only set if voided === true. */
  voidedAt?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// BillingCalculation
// ─────────────────────────────────────────────────────────────────────────────

/** Full billing cost breakdown with audit trail. */
export interface BillingCalculation {
  /** Raw carrier cost — no markup. */
  baseRate: number;
  /** Extra charge for residential delivery. */
  residentialSurcharge: number;
  /** Client-specific markup percentage (e.g. 0.15 = 15%). */
  carrierMarkupPercent: number;
  /** baseRate + residentialSurcharge */
  subtotal: number;
  /** subtotal * (1 + carrierMarkupPercent) */
  totalCost: number;
  /** Human-readable audit trail (e.g. "$4.50 + $0.20 res + 15% markup") */
  breakdown: string;
  calculatedAt: Date;
  roundingMethod: RoundingMethod;
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Entity — Complete API Response
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete ShipStation order entity.
 *
 * SSOT rule: Never mutate an Order — only replace via setAllOrders or updateOrder.
 *
 * Edge cases:
 * - `items` may be empty for digital/service orders (itemCount === 0)
 * - `skus` may contain duplicates if the same SKU appears on multiple line items
 * - `storeId` may be missing on imported/legacy orders — callers must handle undefined
 * - `orderDate` = when customer placed order; `createdAt` = when ShipStation received it
 * - Use `orderDate` for date filtering, not `createdAt`
 */
export interface Order {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** Internal UUID — unique across all orders. */
  id: OrderId;
  /** Display order number (shown in table). */
  orderNum: string;
  /** ShipStation numeric orderId. */
  orderId: number;

  // ── Multi-tenant ──────────────────────────────────────────────────────────
  /** 3PL client identifier (e.g. "kfgoods"). */
  clientId: string;
  /** ShipStation store ID — may be absent on older/imported orders. */
  storeId?: number;

  // ── Dates — always Date objects (never raw strings in the store) ──────────
  /** When the customer placed the order. Use this for date filtering. */
  orderDate: Date;
  /** When ShipStation received/created the order. */
  createdAt: Date;
  lastUpdatedAt: Date;

  // ── Customer ──────────────────────────────────────────────────────────────
  /** Ship-to recipient name (display). */
  customer: string;
  customerId?: string;

  // ── Addresses ─────────────────────────────────────────────────────────────
  /** residential: inferred or manual override. */
  shipTo: Address & { residential: boolean };
  shipFrom: Address;

  // ── Items ─────────────────────────────────────────────────────────────────
  items: OrderItem[];
  /** Denormalized: sum of item quantities. */
  itemCount: number;
  /** Denormalized for search — one entry per unique item name. */
  itemNames: string[];
  /**
   * Denormalized for SKU filter — one entry per unique SKU.
   * May contain duplicates if same SKU appears on multiple line items (intentional).
   */
  skus: string[];

  // ── Physical ──────────────────────────────────────────────────────────────
  /** Total order weight in ounces. */
  weightOz: number;
  dimensions: Dimensions;

  // ── Rate ──────────────────────────────────────────────────────────────────
  /** Raw carrier cost from ShipStation, before markup. */
  baseRate: number;

  // ── Status ────────────────────────────────────────────────────────────────
  status: OrderStatus;
  /** True if shipped outside this app. */
  externallyShipped?: boolean;

  // ── Label — set once on label creation; immutable after that ──────────────
  label?: OrderLabel;

  // ── Billing — calculated cost with audit trail ────────────────────────────
  billing?: BillingCalculation;

  // ── Metadata ──────────────────────────────────────────────────────────────
  notes?: string;
  /** Never `any` — unknown forces callers to narrow explicitly. */
  customFields?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Active filter configuration for the orders table.
 *
 * Behavior contract:
 * - Filters are AND-stacked: all active filters must match
 * - `search` is case-insensitive substring match across: customer, orderNum, itemNames, skus, clientId, postalCode
 * - `skuId` is exact match (not partial)
 * - `dateRange` uses `orderDate` (not `createdAt`)
 * - Changing any filter resets `currentPage` to 1
 */
export interface FilterState {
  /** Real-time search across customer, orderNum, itemNames, skus, clientId, postalCode. */
  search: string;
  /** null = no SKU filter; string = exact SKU match. */
  skuId: string | null;
  /** Default: 'today'. */
  dateRange: DateFilter;
}

// ─────────────────────────────────────────────────────────────────────────────
// SelectionState
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Current selection state for the orders table.
 *
 * Selection modes are mutually exclusive per spec.
 * See selection transition matrix in DATA-STRUCTURES doc for mode-switching rules.
 */
export interface SelectionState {
  mode: SelectionMode;
  /** Active in 'checkbox' mode. */
  checkboxSelectedIds: Set<OrderId>;
  /** Active in 'row-click' mode. */
  rowSelectedId: OrderId | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelState (derived — never stored)
// ─────────────────────────────────────────────────────────────────────────────

/** Right-side panel state — derived from SelectionState, never stored directly. */
export interface PanelState {
  type: PanelType;
  selectedOrderIds: OrderId[];
  selectedCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ColumnConfig & ColumnsState
// ─────────────────────────────────────────────────────────────────────────────

/** Configuration for a single table column. */
export interface ColumnConfig {
  key: string;
  label: string;
  widthPx: number;
  visible: boolean;
  sortable: boolean;
  /** Display position (0-indexed). */
  order: number;
}

/** Full columns state including fast visibility lookup. */
export interface ColumnsState {
  columns: ColumnConfig[];
  /** Ordered list of column keys for display. */
  columnOrder: string[];
  /** O(1) lookup for visibility checks. */
  visibleColumns: Set<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PaginationState
// ─────────────────────────────────────────────────────────────────────────────

/** Pagination configuration. */
export interface PaginationState {
  /** 1-indexed. Always >= 1. */
  currentPage: number;
  ordersPerPage: PageSize;
}

/** Pagination display metadata — derived, never stored. */
export interface PaginationMeta {
  totalOrders: number;
  /** max(1, ceil(totalOrders / ordersPerPage)) */
  totalPages: number;
  /** 1-indexed start of current page (0 if no results). */
  startIndex: number;
  /** 1-indexed end of current page (0 if no results). */
  endIndex: number;
  /** "1–50 of 105" | "No results" */
  displayRange: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SyncState
// ─────────────────────────────────────────────────────────────────────────────

/** State for the background sync process. */
export interface SyncState {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  lastSyncError: string | null;
  /** Last N sync timestamps — capped at SYNC_HISTORY_MAX to prevent unbounded growth. */
  syncHistory: Date[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward Compatibility — Legacy OrderDTO (used by existing API layer)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `Order` instead.
 * Kept for backward compatibility with the existing API layer and components
 * that haven't been migrated to the new schema yet.
 */
export interface OrderItem_Legacy {
  sku: string;
  quantity: number;
  name?: string;
  price?: number;
  imageUrl?: string;
  adjustment?: boolean;
}

/** @deprecated Use `Dimensions` instead. */
export interface OrderDimensions {
  length: number;
  width: number;
  height: number;
}

/** @deprecated Use weightOz on Order instead. */
export interface OrderWeight {
  value: number;
  units: 'ounces' | 'grams';
}

/** @deprecated Use `Address` instead. */
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

/** @deprecated Use `OrderLabel` instead. */
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

/** @deprecated Use `Order` instead. */
export interface SelectedRate {
  carrierCode: string;
  serviceCode: string;
  rate: number;
  fetchedAt: Date;
}

/**
 * @deprecated Use `Order` for new code.
 * Legacy DTO shape from the original API layer — preserved for existing components.
 */
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
  items?: OrderItem_Legacy[];
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
  enrichedRate?: SelectedRate;
  ratesFetched?: boolean;
  rateError?: string;
  calculatedCost?: number;
  billingCalculation?: BillingCalculation;
  label?: {
    shippingNumber: string;
    labelUrl: string;
    carrierCode: string;
    createdAt: Date;
    status: 'pending' | 'ready' | 'failed';
  };
}

/** @deprecated Use `ColumnConfig` instead. */
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
