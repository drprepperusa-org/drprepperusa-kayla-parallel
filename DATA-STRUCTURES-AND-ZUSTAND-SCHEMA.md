---
title: Data Structures & Zustand Store Schema
created: 2026-03-26 15:44 EDT
revised: 2026-03-26 16:00 EDT
audience: Albert (approval) + Kayla (implementation)
purpose: Concrete data structures + interfaces + Zustand store design before feature implementation
---

# Data Structures & Zustand Store Schema

**Core Principle**: Store complete API response (immutable source of truth), derive filtered views on-demand (never store derived state).

---

## Part 0: Shared Types

These aliases prevent repeating union literals throughout the codebase. Define once, reference everywhere.

```typescript
type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';
type PageSize = 50 | 100 | 200;
type ZoomLevel = 100 | 115 | 125;
type SelectionMode = 'checkbox' | 'row-click' | null;
type PanelType = 'empty' | 'shipping-panel' | 'batch-panel' | 'order-details-panel';
type RoundingMethod = 'bankers' | 'standard';
type OrderId = string;

// Date filter presets. No 'all' option — 'today' is the default.
// Custom ranges require explicit start/end (no open-ended ranges).
type DateFilter =
  | 'today'
  | 'yesterday'
  | 'last-7-days'
  | 'last-14-days'
  | 'last-30-days'
  | 'last-90-days'
  | { start: Date; end: Date };
```

---

## Part 1: Core Data Structures

### Shared Sub-structures

```typescript
interface Dimensions {
  lengthIn: number;  // inches
  widthIn: number;
  heightIn: number;
}

interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;   // ISO 3166-1 alpha-2 (e.g. "US")
  phone?: string;
}
```

### OrderItem

```typescript
interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;  // Must be >= 1
  weightOz: number;  // Per-unit weight in ounces
  dimensions?: Dimensions;
}
```

### Order Entity (Complete API Response)

```typescript
// Complete ShipStation order. Never mutate — only replace via setAllOrders or updateOrder.
interface Order {
  // Identity
  id: OrderId;          // Internal UUID (unique across all orders)
  orderNum: string;     // Display order number (shown in table)
  orderId: number;      // ShipStation numeric orderId

  // Multi-tenant
  clientId: string;     // 3PL client identifier (e.g. "kfgoods")
  storeId?: number;     // ShipStation store ID (optional on older orders)

  // Dates — always Date objects (never raw strings in the store)
  orderDate: Date;
  createdAt: Date;
  lastUpdatedAt: Date;

  // Customer
  customer: string;     // Ship-to recipient name (display)
  customerId?: string;

  // Addresses
  shipTo: Address & { residential: boolean };  // residential: inferred or manual override
  shipFrom: Address;

  // Items
  items: OrderItem[];
  itemCount: number;     // Denormalized: sum of item quantities
  itemNames: string[];   // Denormalized for search (one entry per unique item name)
  skus: string[];        // Denormalized for SKU filter (one entry per unique SKU)

  // Physical
  weightOz: number;      // Total order weight in ounces
  dimensions: Dimensions;

  // Rate (raw from ShipStation, before markup)
  baseRate: number;

  // Status
  status: OrderStatus;
  externallyShipped?: boolean;  // True if shipped outside this app

  // Label — set once on label creation; immutable after that
  label?: OrderLabel;

  // Billing — calculated cost with audit trail
  billing?: BillingCalculation;

  // Metadata
  notes?: string;
  customFields?: Record<string, unknown>;  // Never `any` — unknown forces callers to narrow
}
```

**Edge cases:**
- `items` may be an empty array for digital/service orders — `itemCount` would be 0
- `skus` may contain duplicates if the same SKU appears on multiple line items (intentional — for accurate count display)
- `storeId` may be missing on imported/legacy orders — callers must handle undefined
- `orderDate` vs `createdAt`: `orderDate` is when the customer placed the order; `createdAt` is when ShipStation received it. Use `orderDate` for date filtering.

---

### OrderLabel (IMMUTABLE CONTRACT)

> **Locked per DJ spec.** Once a label is created, this structure never changes. No additions, no removals, even if future features request it.

```typescript
// Maps raw ShipStation V1 + V2 label response fields.
// All fields normalized to camelCase — raw API names noted in comments.
interface OrderLabel {
  // — ShipStation V2 create-label response —
  trackingNumber: string;    // V2: tracking_number
  shipmentCost: number;      // V2: shipment_cost (dollars)
  v2CarrierCode: string;     // V2: carrier_code (e.g. "stamps_com")
  serviceCode: string;       // V2: service_code (e.g. "usps_priority_mail")
  labelUrl?: string;         // V2: label_download.pdf (may be absent for thermal)

  // — ShipStation V1 create-label response —
  v1ShippingProviderId: number;  // V1: shipmentId → providerAccountId
  v1CarrierCode: string;         // V1: carrierCode (may differ from V2 value)

  // — Metadata —
  createdAt: Date;
  createdBy?: string;  // UserId of whoever printed the label

  // — Void state —
  voided: boolean;     // Always present — false until voided
  voidedAt?: Date;     // Only set if voided === true
}
```

**Edge cases:**
- `v2CarrierCode` and `v1CarrierCode` may differ — V1 uses legacy code names, V2 uses current codes
- `labelUrl` is absent for thermal (ZPL) labels — UI must guard against null before rendering
- Voiding a label does NOT delete it from the store — it stays with `voided: true`
- `createdBy` is undefined for labels created by automation/sync

---

### BillingCalculation

```typescript
interface BillingCalculation {
  baseRate: number;                // Raw carrier cost (no markup)
  residentialSurcharge: number;   // Extra charge for residential delivery
  carrierMarkupPercent: number;   // Client-specific markup (e.g. 0.15 = 15%)
  subtotal: number;               // baseRate + residentialSurcharge
  totalCost: number;              // subtotal * (1 + carrierMarkupPercent)
  breakdown: string;              // Human-readable audit trail (e.g. "$4.50 + $0.20 res + 15% markup")
  calculatedAt: Date;
  roundingMethod: RoundingMethod;
}
```

---

### FilterState

```typescript
// All filters apply across ALL orders regardless of current status tab.
// Status filtering is separate (see getFilteredOrdersByStatus).
interface FilterState {
  search: string;           // Real-time, searches: customer, orderNum, itemNames, skus, clientId, postalCode
  skuId: string | null;     // null = no SKU filter; string = exact SKU match
  dateRange: DateFilter;    // Default: 'today'
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  skuId: null,
  dateRange: 'today',
};
```

**Behavior contract:**
- Filters are AND-stacked: all active filters must match
- Search field is case-insensitive substring match
- SKU filter is exact match (not partial)
- Date filter uses `orderDate` (not `createdAt`)
- Changing any filter resets `currentPage` to 1

---

### SelectionState

```typescript
// Selection modes are mutually exclusive per spec.
// See selection transition matrix in Part 4 for mode-switching rules.
interface SelectionState {
  mode: SelectionMode;
  checkboxSelectedIds: Set<OrderId>;  // Active in 'checkbox' mode
  rowSelectedId: OrderId | null;      // Active in 'row-click' mode
}

const DEFAULT_SELECTION: SelectionState = {
  mode: null,
  checkboxSelectedIds: new Set(),
  rowSelectedId: null,
};
```

**Derived — never stored:**
```typescript
interface PanelState {
  type: PanelType;
  selectedOrderIds: OrderId[];
  selectedCount: number;
}
```

---

### ColumnConfig & ColumnsState

```typescript
interface ColumnConfig {
  key: string;
  label: string;
  widthPx: number;
  visible: boolean;
  sortable: boolean;
  order: number;   // Display position (0-indexed)
}

interface ColumnsState {
  columns: ColumnConfig[];
  columnOrder: string[];       // Ordered list of column keys
  visibleColumns: Set<string>; // Fast O(1) lookup for visibility checks
}

// All 24 column keys (16 core + 2 shipped-only + 6 debug/test).
// "23 columns" in spec excludes one debug column — use this full list in implementation.
const ALL_COLUMN_KEYS = [
  // Core (shown in both awaiting_shipment and shipped)
  'select', 'date', 'client', 'orderNum', 'customer', 'itemname',
  'sku', 'qty', 'weight', 'shipto', 'carrier', 'custcarrier',
  'total', 'bestrate', 'margin',
  // Awaiting only
  'age',
  // Shipped only
  'tracking', 'labelcreated',
  // Debug/test columns (can be toggled off in production)
  'test_carrierCode', 'test_shippingProviderId', 'test_clientId',
  'test_serviceCode', 'test_bestRate', 'test_orderLocal',
] as const;

type ColumnKey = typeof ALL_COLUMN_KEYS[number];
```

---

### PaginationState

```typescript
interface PaginationState {
  currentPage: number;   // 1-indexed. Always >= 1.
  ordersPerPage: PageSize;
}

// Derived — never stored:
interface PaginationMeta {
  totalOrders: number;
  totalPages: number;    // max(1, ceil(totalOrders / ordersPerPage))
  startIndex: number;    // 1-indexed start of current page (0 if no results)
  endIndex: number;      // 1-indexed end of current page (0 if no results)
  displayRange: string;  // "1–50 of 105" | "No results"
}
```

---

### SyncState

```typescript
interface SyncState {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  lastSyncError: string | null;
  syncHistory: Date[];   // Last N sync timestamps (capped — see SYNC_HISTORY_MAX)
}

const SYNC_HISTORY_MAX = 50; // Prevent unbounded growth
```

---

## Part 2: Validation Functions

Validate data at the boundary (API response → store). Never trust raw API data.

```typescript
/**
 * Validate a raw order from the API before storing.
 * Returns an array of error strings — empty array = valid.
 */
function validateOrder(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Order is not an object'];
  const o = raw as Record<string, unknown>;

  if (!o.id || typeof o.id !== 'string') errors.push('Missing or invalid id');
  if (!o.orderNum || typeof o.orderNum !== 'string') errors.push('Missing orderNum');
  if (typeof o.orderId !== 'number') errors.push('Missing or invalid orderId');
  if (!o.clientId || typeof o.clientId !== 'string') errors.push('Missing clientId');
  if (!Array.isArray(o.items)) errors.push('Missing items array');
  if (!['awaiting_shipment', 'shipped', 'cancelled'].includes(o.status as string)) {
    errors.push(`Invalid status: ${String(o.status)}`);
  }
  if (typeof o.weightOz !== 'number' || o.weightOz < 0) {
    errors.push('Invalid weightOz');
  }

  return errors;
}

/**
 * Validate an OrderLabel before attaching to an order.
 * Enforces the immutable contract.
 */
function validateOrderLabel(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return ['Label is not an object'];
  const l = raw as Record<string, unknown>;

  if (!l.trackingNumber || typeof l.trackingNumber !== 'string') {
    errors.push('Missing trackingNumber');
  }
  if (typeof l.shipmentCost !== 'number' || l.shipmentCost < 0) {
    errors.push('Invalid shipmentCost');
  }
  if (!l.v2CarrierCode || typeof l.v2CarrierCode !== 'string') {
    errors.push('Missing v2CarrierCode');
  }
  if (!l.serviceCode || typeof l.serviceCode !== 'string') {
    errors.push('Missing serviceCode');
  }
  if (typeof l.v1ShippingProviderId !== 'number') {
    errors.push('Missing v1ShippingProviderId');
  }

  return errors;
}

/**
 * Type guard: confirms an unknown value is a valid Order.
 */
function isValidOrder(raw: unknown): raw is Order {
  return validateOrder(raw).length === 0;
}

/**
 * Type guard: confirms an unknown value is a valid OrderLabel.
 */
function isValidOrderLabel(raw: unknown): raw is OrderLabel {
  return validateOrderLabel(raw).length === 0;
}
```

---

## Part 3: Helper Functions

These are required by the store — define them before wiring up Zustand.

### getDateRange

```typescript
interface DateRange {
  start: Date;
  end: Date;
}

function getDateRange(filter: DateFilter): DateRange {
  // Custom range — pass through as-is
  if (typeof filter === 'object') {
    return filter;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (filter) {
    case 'today':
      return { start: startOfToday, end: endOfToday };

    case 'yesterday': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      const end = new Date(endOfToday);
      end.setDate(end.getDate() - 1);
      return { start, end };
    }

    case 'last-7-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6); // 6 days ago + today = 7 days
      return { start, end: endOfToday };
    }

    case 'last-14-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 13);
      return { start, end: endOfToday };
    }

    case 'last-30-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }

    case 'last-90-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 89);
      return { start, end: endOfToday };
    }

    default:
      // TypeScript exhaustiveness check
      const _never: never = filter;
      throw new Error(`Unknown DateFilter: ${String(_never)}`);
  }
}
```

### filterOrders

```typescript
// Applies search + SKU + date filters to a set of orders.
// Does NOT apply status filtering — status is applied separately.
// All filters are AND-stacked.
function filterOrders(orders: Order[], filters: FilterState): Order[] {
  let result = orders;

  // Search filter — case-insensitive substring across all searchable fields
  if (filters.search.trim() !== '') {
    const term = filters.search.trim().toLowerCase();
    result = result.filter((o) => {
      const searchTarget = [
        o.customer,
        o.orderNum,
        o.clientId,
        o.shipTo.postalCode,
        ...o.itemNames,
        ...o.skus,
      ].join(' ').toLowerCase();
      return searchTarget.includes(term);
    });
  }

  // SKU filter — exact match on any of the order's SKUs
  if (filters.skuId !== null) {
    const skuId = filters.skuId; // TypeScript: narrow from string | null → string
    result = result.filter((o) => o.skus.includes(skuId));
  }

  // Date filter — uses orderDate (not createdAt)
  const range = getDateRange(filters.dateRange);
  result = result.filter((o) => o.orderDate >= range.start && o.orderDate <= range.end);

  return result;
}
```

### mergeOrders

```typescript
// Merge new orders from an incremental sync into the existing store.
// Strategy: upsert by id — update if exists, append if new.
// Preserves local label/billing data on existing orders (API doesn't return it).
function mergeOrders(existing: Order[], incoming: Order[]): Order[] {
  const existingMap = new Map<OrderId, Order>(existing.map((o) => [o.id, o]));

  for (const newOrder of incoming) {
    const current = existingMap.get(newOrder.id);
    if (current) {
      // Merge: preserve local-only fields (label, billing) that the API doesn't return
      existingMap.set(newOrder.id, {
        ...newOrder,
        label: current.label ?? newOrder.label,
        billing: current.billing ?? newOrder.billing,
      });
    } else {
      existingMap.set(newOrder.id, newOrder);
    }
  }

  return Array.from(existingMap.values());
}
```

### initializeColumns

```typescript
// Default column configuration. Adjust widths and defaults before launch.
function initializeColumns(): ColumnConfig[] {
  const DEFAULTS: Record<string, Partial<ColumnConfig>> = {
    select:    { widthPx: 40,  visible: true,  sortable: false },
    date:      { widthPx: 100, visible: true,  sortable: true  },
    client:    { widthPx: 100, visible: true,  sortable: true  },
    orderNum:  { widthPx: 120, visible: true,  sortable: true  },
    customer:  { widthPx: 150, visible: true,  sortable: true  },
    itemname:  { widthPx: 200, visible: true,  sortable: false },
    sku:       { widthPx: 100, visible: true,  sortable: true  },
    qty:       { widthPx: 60,  visible: true,  sortable: true  },
    weight:    { widthPx: 80,  visible: true,  sortable: true  },
    shipto:    { widthPx: 150, visible: true,  sortable: false },
    carrier:   { widthPx: 80,  visible: true,  sortable: true  },
    custcarrier: { widthPx: 100, visible: true, sortable: true },
    total:     { widthPx: 80,  visible: true,  sortable: true  },
    bestrate:  { widthPx: 80,  visible: true,  sortable: true  },
    margin:    { widthPx: 80,  visible: true,  sortable: true  },
    age:       { widthPx: 60,  visible: true,  sortable: true  },
    tracking:  { widthPx: 150, visible: true,  sortable: false },
    labelcreated: { widthPx: 120, visible: true, sortable: true },
    // Debug columns — hidden by default in production
    test_carrierCode:        { widthPx: 120, visible: false, sortable: false },
    test_shippingProviderId: { widthPx: 120, visible: false, sortable: false },
    test_clientId:           { widthPx: 120, visible: false, sortable: false },
    test_serviceCode:        { widthPx: 120, visible: false, sortable: false },
    test_bestRate:           { widthPx: 100, visible: false, sortable: false },
    test_orderLocal:         { widthPx: 100, visible: false, sortable: false },
  };

  return ALL_COLUMN_KEYS.map((key, index) => ({
    key,
    label: key, // Override in UI with display-friendly names
    widthPx: 100,
    visible: true,
    sortable: false,
    order: index,
    ...DEFAULTS[key],
  }));
}
```

---

## Part 4: Zustand Store Architecture

### Store Design Rules

```
Rule 1: allOrders is the SSOT — never mutate, only replace
Rule 2: No derived state in the store — compute on-demand in selectors
Rule 3: No async operations in the store — services call APIs, then dispatch to store
Rule 4: Changing any filter resets currentPage to 1
Rule 5: Selection modes are mutually exclusive — enforced by all selection actions
```

### Selection Mode Transition Matrix

Per DJ spec:

| Current Mode | Action | Result |
|---|---|---|
| null | Check checkbox | Enter checkbox mode; add to set |
| null | Click row | Enter row-click mode; set rowSelectedId |
| checkbox (1 checked) | Uncheck that box | Back to null mode |
| checkbox (2+ checked) | Click row | **NO ACTION** — prevents misclick |
| checkbox (any) | Check another box | Stay in checkbox mode; add to set |
| row-click | Click same row | Deselect; back to null mode |
| row-click | Click different row | Stay in row-click mode; switch to new row |
| row-click | Check a checkbox | Switch to checkbox mode; clear rowSelectedId; add checkbox |

### OrdersStore (Complete Implementation)

```typescript
import { create } from 'zustand';

// ─────────────────────────────────────────────
// Store shape (split for readability)
// ─────────────────────────────────────────────

interface OrdersStoreState {
  allOrders: Order[];
  currentStatus: OrderStatus;
  filters: FilterState;
  pagination: PaginationState;
  selection: SelectionState;
  columns: ColumnsState;
  sync: SyncState;
  zoom: ZoomLevel;
}

interface OrdersStoreActions {
  // Orders (only updated via API response)
  setAllOrders: (orders: Order[]) => void;
  updateOrder: (id: OrderId, updates: Partial<Omit<Order, 'id'>>) => void;
  addLabel: (orderId: OrderId, label: OrderLabel) => void;

  // Status tab
  setStatus: (status: OrderStatus) => void;

  // Filters (each resets page to 1)
  setSearchFilter: (search: string) => void;
  setSkuFilter: (skuId: string | null) => void;
  setDateFilter: (range: DateFilter) => void;
  clearFilters: () => void;

  // Checkbox selection
  toggleCheckbox: (orderId: OrderId) => void;
  clearAllCheckboxes: () => void;

  // Row-click selection
  selectRow: (orderId: OrderId) => void;
  deselectRow: () => void;

  // Pagination
  setCurrentPage: (page: number) => void;
  setOrdersPerPage: (count: PageSize) => void;

  // Columns
  toggleColumnVisibility: (key: string) => void;
  reorderColumns: (newOrder: string[]) => void;
  setColumnWidth: (key: string, widthPx: number) => void;

  // Sync
  startSync: () => void;
  syncComplete: (time: Date, incomingOrders: Order[]) => void;
  syncError: (error: string) => void;

  // Zoom
  setZoom: (level: ZoomLevel) => void;
}

interface OrdersStoreSelectors {
  // Core filtered set — applies search + SKU + date, NOT status
  getFilteredOrders: () => Order[];

  // Current status tab filtered set
  getFilteredOrdersByStatus: () => Order[];

  // Current page of the current status tab
  getPaginatedOrders: () => Order[];

  // Derived panel state (drives right-side panel)
  getPanelState: () => PanelState;

  // Banner: shown when 2+ checkboxes selected
  getBannerState: () => { show: boolean; count: number };

  // Pagination display metadata
  getPaginationMeta: () => PaginationMeta;

  // Counts
  getTotalOrderCount: () => number;
  getFilteredOrderCount: () => number;
  getCheckboxSelectedCount: () => number;
}

type OrdersStore = OrdersStoreState & OrdersStoreActions & OrdersStoreSelectors;

// ─────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────

const INITIAL_STATE: OrdersStoreState = {
  allOrders: [],
  currentStatus: 'awaiting_shipment',
  filters: DEFAULT_FILTERS,
  pagination: { currentPage: 1, ordersPerPage: 50 },
  selection: DEFAULT_SELECTION,
  columns: {
    columns: initializeColumns(),
    columnOrder: [...ALL_COLUMN_KEYS],
    visibleColumns: new Set(ALL_COLUMN_KEYS),
  },
  sync: {
    lastSyncTime: null,
    isSyncing: false,
    lastSyncError: null,
    syncHistory: [],
  },
  zoom: 100,
};

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  ...INITIAL_STATE,

  // ── Orders ──────────────────────────────────

  setAllOrders: (orders) => set({ allOrders: orders }),

  updateOrder: (id, updates) =>
    set((state) => ({
      allOrders: state.allOrders.map((o) =>
        o.id === id ? { ...o, ...updates, lastUpdatedAt: new Date() } : o
      ),
    })),

  addLabel: (orderId, label) => {
    const errors = validateOrderLabel(label);
    if (errors.length > 0) {
      console.error('[OrdersStore] addLabel: invalid label', errors);
      return; // Reject invalid labels — never corrupt the store
    }
    set((state) => ({
      allOrders: state.allOrders.map((o) =>
        o.id === orderId
          ? { ...o, label, status: 'shipped', lastUpdatedAt: new Date() }
          : o
      ),
    }));
  },

  // ── Status ──────────────────────────────────

  setStatus: (status) =>
    set({ currentStatus: status, pagination: { ...get().pagination, currentPage: 1 } }),

  // ── Filters ─────────────────────────────────

  setSearchFilter: (search) =>
    set((state) => ({
      filters: { ...state.filters, search },
      pagination: { ...state.pagination, currentPage: 1 },
    })),

  setSkuFilter: (skuId) =>
    set((state) => ({
      filters: { ...state.filters, skuId },
      pagination: { ...state.pagination, currentPage: 1 },
    })),

  setDateFilter: (dateRange) =>
    set((state) => ({
      filters: { ...state.filters, dateRange },
      pagination: { ...state.pagination, currentPage: 1 },
    })),

  clearFilters: () =>
    set((state) => ({
      filters: DEFAULT_FILTERS,
      pagination: { ...state.pagination, currentPage: 1 },
    })),

  // ── Checkbox Selection ───────────────────────

  toggleCheckbox: (orderId) =>
    set((state) => {
      const { mode, checkboxSelectedIds, rowSelectedId } = state.selection;

      // Row-click mode → switching to checkbox mode
      if (mode === 'row-click') {
        return {
          selection: {
            mode: 'checkbox',
            checkboxSelectedIds: new Set([orderId]),
            rowSelectedId: null,
          },
        };
      }

      const next = new Set(checkboxSelectedIds);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }

      return {
        selection: {
          ...state.selection,
          mode: next.size > 0 ? 'checkbox' : null,
          checkboxSelectedIds: next,
        },
      };
    }),

  clearAllCheckboxes: () =>
    set({ selection: DEFAULT_SELECTION }),

  // ── Row Selection ────────────────────────────

  selectRow: (orderId) =>
    set((state) => {
      const { mode, checkboxSelectedIds } = state.selection;

      // 2+ checkboxes active → NO ACTION (per spec, prevent misclick)
      if (mode === 'checkbox' && checkboxSelectedIds.size >= 2) {
        return {};
      }

      // Same row already selected → deselect
      if (mode === 'row-click' && state.selection.rowSelectedId === orderId) {
        return { selection: DEFAULT_SELECTION };
      }

      return {
        selection: {
          mode: 'row-click',
          checkboxSelectedIds: new Set(),
          rowSelectedId: orderId,
        },
      };
    }),

  deselectRow: () =>
    set({ selection: DEFAULT_SELECTION }),

  // ── Pagination ───────────────────────────────

  setCurrentPage: (page) =>
    set((state) => ({
      pagination: { ...state.pagination, currentPage: Math.max(1, page) },
    })),

  setOrdersPerPage: (count) =>
    set({ pagination: { currentPage: 1, ordersPerPage: count } }),

  // ── Columns ──────────────────────────────────

  toggleColumnVisibility: (key) =>
    set((state) => {
      const next = new Set(state.columns.visibleColumns);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { columns: { ...state.columns, visibleColumns: next } };
    }),

  reorderColumns: (newOrder) =>
    set((state) => ({
      columns: { ...state.columns, columnOrder: newOrder },
    })),

  setColumnWidth: (key, widthPx) =>
    set((state) => ({
      columns: {
        ...state.columns,
        columns: state.columns.columns.map((c) =>
          c.key === key ? { ...c, widthPx } : c
        ),
      },
    })),

  // ── Sync ─────────────────────────────────────

  startSync: () =>
    set((state) => ({
      sync: { ...state.sync, isSyncing: true, lastSyncError: null },
    })),

  syncComplete: (time, incomingOrders) =>
    set((state) => {
      const history = [...state.sync.syncHistory, time].slice(-SYNC_HISTORY_MAX);
      return {
        allOrders: mergeOrders(state.allOrders, incomingOrders),
        sync: {
          lastSyncTime: time,
          isSyncing: false,
          lastSyncError: null,
          syncHistory: history,
        },
      };
    }),

  syncError: (error) =>
    set((state) => ({
      sync: { ...state.sync, isSyncing: false, lastSyncError: error },
    })),

  // ── Zoom ─────────────────────────────────────

  setZoom: (level) => set({ zoom: level }),

  // ─────────────────────────────────────────────
  // SELECTORS
  // ─────────────────────────────────────────────

  getFilteredOrders: () => {
    const { allOrders, filters } = get();
    return filterOrders(allOrders, filters);
  },

  getFilteredOrdersByStatus: () => {
    const { currentStatus } = get();
    return get().getFilteredOrders().filter((o) => o.status === currentStatus);
  },

  getPaginatedOrders: () => {
    const { pagination } = get();
    const filtered = get().getFilteredOrdersByStatus();
    const { currentPage, ordersPerPage } = pagination;
    // Clamp page to valid range in case filter changed total
    const totalPages = Math.max(1, Math.ceil(filtered.length / ordersPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * ordersPerPage;
    return filtered.slice(start, start + ordersPerPage);
  },

  getPanelState: (): PanelState => {
    const { mode, checkboxSelectedIds, rowSelectedId } = get().selection;

    if (mode === 'checkbox') {
      const ids = Array.from(checkboxSelectedIds);
      const count = ids.length;
      if (count === 1) {
        return { type: 'shipping-panel', selectedOrderIds: ids, selectedCount: 1 };
      }
      if (count > 1) {
        return { type: 'batch-panel', selectedOrderIds: ids, selectedCount: count };
      }
    }

    if (mode === 'row-click' && rowSelectedId !== null) {
      return { type: 'shipping-panel', selectedOrderIds: [rowSelectedId], selectedCount: 1 };
    }

    return { type: 'empty', selectedOrderIds: [], selectedCount: 0 };
  },

  getBannerState: () => {
    const count = get().selection.checkboxSelectedIds.size;
    return { show: count >= 2, count };
  },

  getPaginationMeta: (): PaginationMeta => {
    const { pagination } = get();
    const total = get().getFilteredOrderCount();
    const { currentPage, ordersPerPage } = pagination;

    if (total === 0) {
      return {
        totalOrders: 0,
        totalPages: 1,
        startIndex: 0,
        endIndex: 0,
        displayRange: 'No results',
      };
    }

    const totalPages = Math.ceil(total / ordersPerPage);
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * ordersPerPage + 1;
    const endIndex = Math.min(safePage * ordersPerPage, total);

    return {
      totalOrders: total,
      totalPages,
      startIndex,
      endIndex,
      displayRange: `${startIndex}–${endIndex} of ${total}`,
    };
  },

  getTotalOrderCount: () => get().allOrders.length,

  getFilteredOrderCount: () => get().getFilteredOrdersByStatus().length,

  // Returns number of checkboxes checked (0 if nothing selected).
  // Note: does NOT return 1 for row-click — use getPanelState() for panel logic.
  getCheckboxSelectedCount: () => get().selection.checkboxSelectedIds.size,
}));
```

---

## Part 5: Filtering Strategy

### Current Implementation: Filter-on-Read

Filter `allOrders` on every selector call. Correct for <5k orders.

```
allOrders (source) → filterOrders() → status filter → paginate → render
```

**Performance characteristics:**
- 1k orders: ~1ms filter time — negligible
- 10k orders: ~10–20ms filter time — acceptable if selectors are memoized
- 50k+ orders: consider client-side cache (below)

**Critical: filters are stateless** — `filterOrders()` is a pure function. No cache invalidation bugs.

### Future: Client-Based Cache (When Needed)

Add after behavior is validated. Do NOT prematurely optimize.

```typescript
// Add to OrdersStoreState when needed:
ordersByClient: Map<string, Order[]>;  // clientId → orders

// Update in syncComplete:
const buildClientCache = (orders: Order[]): Map<string, Order[]> => {
  const cache = new Map<string, Order[]>();
  for (const order of orders) {
    const existing = cache.get(order.clientId) ?? [];
    existing.push(order);
    cache.set(order.clientId, existing);
  }
  return cache;
};
```

**Trigger**: Only when profiling shows filter time > 50ms on real data.

---

## Part 6: Real-World Edge Cases

### Case 1: Label creation fails mid-flow

```
Error handling rule (per DJ spec): Show error, leave order in current state. NEVER auto-ship.
```

```typescript
// DO THIS (in the service layer, not the store):
try {
  const label = await labelService.create(orderId, rate);
  useOrdersStore.getState().addLabel(orderId, label);
} catch (err) {
  // Order stays as 'awaiting_shipment' — store is not touched
  showErrorToast(`Label creation failed: ${err.message}`);
}
```

### Case 2: Sync returns orders already in the store

Handled by `mergeOrders` — upserts by `id`, preserves local `label`/`billing` fields that the API doesn't return.

```typescript
// Scenario: 100 existing orders, sync returns 95 unchanged + 5 updated
syncComplete(new Date(), incomingOrders);
// Result: existing orders updated, new orders appended, labels preserved
```

### Case 3: Filter change while on page 5

```typescript
// User is on page 5, applies a search filter → only 1 page of results
setSearchFilter('Danny');
// currentPage resets to 1 via filter actions
// getPaginatedOrders() also clamps to totalPages as a safety net
```

### Case 4: All checkboxes cleared from banner

```typescript
// User clicks "×" in selection banner
clearAllCheckboxes();
// Selection resets to DEFAULT_SELECTION (mode: null, empty set, null rowId)
// Panel returns to 'empty' state automatically (getPanelState is derived)
```

### Case 5: Row click while 2+ checkboxes active

```typescript
selectRow('order-123');
// If mode === 'checkbox' && checkboxSelectedIds.size >= 2:
// → returns {} (no state change — silent no-op per spec)
```

### Case 6: Empty order list after sync

```typescript
// getPaginationMeta() when total === 0:
// → { displayRange: 'No results', startIndex: 0, endIndex: 0, totalPages: 1 }
// getPaginatedOrders() → []
// getPanelState() → { type: 'empty', ... }
```

### Case 7: Label with missing URL (thermal printer)

```typescript
// labelUrl is optional — never assumed present
const label = order.label;
if (label?.labelUrl) {
  window.open(label.labelUrl);
} else {
  // Thermal label — send raw ZPL to printer instead
}
```

### Case 8: Set serialization for persistence

`checkboxSelectedIds` and `visibleColumns` are `Set` — not JSON-serializable. If persisting to localStorage with `zustand/middleware/persist`:

```typescript
// Custom serializer required:
partialize: (state) => ({
  ...state,
  selection: {
    ...state.selection,
    checkboxSelectedIds: [], // Reset selection on reload (intentional)
  },
  columns: {
    ...state.columns,
    visibleColumns: Array.from(state.columns.visibleColumns), // Serialize Set → Array
  },
}),
// Custom deserializer restores Array → Set on hydration
```

---

## Part 7: Implementation Roadmap

### Week 1: Store + Table Shell
- [ ] Implement Zustand store (this document)
- [ ] Define `initializeColumns()` with final widths
- [ ] Wire table render from `getPaginatedOrders()`
- [ ] Pagination controls (prev/next, per-page toggle, display range)

### Week 2: Filters + Selection
- [ ] Search bar → `setSearchFilter` (debounce 150ms)
- [ ] SKU dropdown → `setSkuFilter` (with order count display)
- [ ] Date dropdown → `setDateFilter`
- [ ] Checkbox selection → `toggleCheckbox`, `clearAllCheckboxes`
- [ ] Row-click selection → `selectRow`, `deselectRow`
- [ ] Selection banner (2+ selected → show banner with count + × button)

### Week 3: Services + APIs
- [ ] RateService (ShipStation V2 — fetch all 3 carriers once)
- [ ] LabelService (V1 + V2 extraction → `OrderLabel`)
- [ ] SyncService (incremental — dispatch to `syncComplete`)
- [ ] BillingService (markup calculation → `BillingCalculation`)

### Week 4: Polish + Testing
- [ ] Column toggle + drag-to-reorder
- [ ] Zoom controls
- [ ] CSV export (current page, visible columns, active filters)
- [ ] Unit tests for all selectors and filter logic

---

## Part 8: Implementation Gate (85% Confidence Required)

Before implementing any feature, confirm:

- [ ] Data structure complete? (all fields known, no `unknown` gaps)
- [ ] Zustand action defined? (named in interface above)
- [ ] API contract locked? (V1/V2 field mapping confirmed by DJ)
- [ ] Edge cases handled? (null, empty array, invalid state)
- [ ] Performance acceptable? (filter time on max expected order count)
- [ ] Test plan written? (unit + integration)

**If <85% confident on any item: stop, log reason, escalate to Albert.**

---

## Part 9: Feature Log

| Feature | Status | Confidence | Notes |
|---------|--------|------------|-------|
| | | | |

Add an entry for each feature as it's started. Record outcome + blockers.

---

**Ready for Albert's approval before feature implementation begins.**

**Last Updated**: 2026-03-26 ~16:00 EDT
