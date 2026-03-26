/**
 * @file orderConstants.ts
 * @description Compile-time constants for the orders domain.
 *
 * All values here are pure data — no side effects, no imports from the store.
 * Import these freely without circular dependency risk.
 */

import type {
  ColumnConfig,
  FilterState,
  PaginationState,
  SelectionState,
} from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Column Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All 24 column keys used by the orders table.
 * 16 core + 2 shipped-only + 6 debug/test.
 *
 * "23 columns" in some spec references excludes one debug column —
 * this list is the authoritative full set.
 */
export const ALL_COLUMN_KEYS = [
  // Core — shown in both awaiting_shipment and shipped views
  'select',
  'date',
  'client',
  'orderNum',
  'customer',
  'itemname',
  'sku',
  'qty',
  'weight',
  'shipto',
  'carrier',
  'custcarrier',
  'total',
  'bestrate',
  'margin',
  // Awaiting-only column
  'age',
  // Shipped-only columns
  'tracking',
  'labelcreated',
  // Debug/test columns — hidden by default in production
  'test_carrierCode',
  'test_shippingProviderId',
  'test_clientId',
  'test_serviceCode',
  'test_bestRate',
  'test_orderLocal',
] as const;

/** Union type of all valid column keys. */
export type ColumnKey = (typeof ALL_COLUMN_KEYS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Column Defaults
// ─────────────────────────────────────────────────────────────────────────────

/** Per-column configuration defaults. */
const COLUMN_DEFAULTS: Record<ColumnKey, Partial<ColumnConfig>> = {
  select:                  { widthPx: 40,  visible: true,  sortable: false },
  date:                    { widthPx: 100, visible: true,  sortable: true  },
  client:                  { widthPx: 100, visible: true,  sortable: true  },
  orderNum:                { widthPx: 120, visible: true,  sortable: true  },
  customer:                { widthPx: 150, visible: true,  sortable: true  },
  itemname:                { widthPx: 200, visible: true,  sortable: false },
  sku:                     { widthPx: 100, visible: true,  sortable: true  },
  qty:                     { widthPx: 60,  visible: true,  sortable: true  },
  weight:                  { widthPx: 80,  visible: true,  sortable: true  },
  shipto:                  { widthPx: 150, visible: true,  sortable: false },
  carrier:                 { widthPx: 80,  visible: true,  sortable: true  },
  custcarrier:             { widthPx: 100, visible: true,  sortable: true  },
  total:                   { widthPx: 80,  visible: true,  sortable: true  },
  bestrate:                { widthPx: 80,  visible: true,  sortable: true  },
  margin:                  { widthPx: 80,  visible: true,  sortable: true  },
  age:                     { widthPx: 60,  visible: true,  sortable: true  },
  tracking:                { widthPx: 150, visible: true,  sortable: false },
  labelcreated:            { widthPx: 120, visible: true,  sortable: true  },
  // Debug columns — hidden by default in production
  test_carrierCode:        { widthPx: 120, visible: false, sortable: false },
  test_shippingProviderId: { widthPx: 120, visible: false, sortable: false },
  test_clientId:           { widthPx: 120, visible: false, sortable: false },
  test_serviceCode:        { widthPx: 120, visible: false, sortable: false },
  test_bestRate:           { widthPx: 100, visible: false, sortable: false },
  test_orderLocal:         { widthPx: 100, visible: false, sortable: false },
};

/** Human-readable display labels for each column key. */
export const COLUMN_LABELS: Record<ColumnKey, string> = {
  select:                  '',
  date:                    'Order Date',
  client:                  'Client',
  orderNum:                'Order #',
  customer:                'Customer',
  itemname:                'Item Name',
  sku:                     'SKU',
  qty:                     'Qty',
  weight:                  'Weight',
  shipto:                  'Ship To',
  carrier:                 'Carrier',
  custcarrier:             'Cust Carrier',
  total:                   'Total',
  bestrate:                'Best Rate',
  margin:                  'Margin',
  age:                     'Age',
  tracking:                'Tracking',
  labelcreated:            'Label Created',
  test_carrierCode:        '[T] Carrier Code',
  test_shippingProviderId: '[T] Provider ID',
  test_clientId:           '[T] Client ID',
  test_serviceCode:        '[T] Service Code',
  test_bestRate:           '[T] Best Rate',
  test_orderLocal:         '[T] Order Local',
};

// ─────────────────────────────────────────────────────────────────────────────
// ALL_COLUMNS — initialized ColumnConfig[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default column configuration array, ready to seed ColumnsState.
 * Widths and visibility from COLUMN_DEFAULTS; labels from COLUMN_LABELS.
 */
export const ALL_COLUMNS: ColumnConfig[] = ALL_COLUMN_KEYS.map(
  (key, index): ColumnConfig => ({
    key,
    label: COLUMN_LABELS[key],
    widthPx: 100,   // fallback — overridden below
    visible: true,  // fallback — overridden below
    sortable: false,
    order: index,
    ...COLUMN_DEFAULTS[key],
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Default Filter/Selection/Pagination State
// ─────────────────────────────────────────────────────────────────────────────

/** Default filter state. dateRange defaults to 'today' per spec. */
export const DEFAULT_FILTERS: FilterState = {
  search: '',
  skuId: null,
  dateRange: 'today',
} as const;

/** Default selection state — nothing selected. */
export const DEFAULT_SELECTION: SelectionState = {
  mode: null,
  checkboxSelectedIds: new Set(),
  rowSelectedId: null,
};

/** Default pagination — page 1, 50 orders per page. */
export const DEFAULT_PAGINATION: PaginationState = {
  currentPage: 1,
  ordersPerPage: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Date Range Labels (for UI dropdowns)
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable labels for each date filter preset. */
export const DATE_RANGE_LABELS: Record<
  Exclude<import('../types/orders').DateFilter, { start: Date; end: Date }>,
  string
> = {
  'today':       'Today',
  'yesterday':   'Yesterday',
  'last-7-days': 'Last 7 Days',
  'last-14-days':'Last 14 Days',
  'last-30-days':'Last 30 Days',
  'last-90-days':'Last 90 Days',
} as const;

/**
 * Ordered list of date filter preset keys for rendering a dropdown.
 * Custom range is handled separately in the UI.
 */
export const DATE_RANGES = [
  'today',
  'yesterday',
  'last-7-days',
  'last-14-days',
  'last-30-days',
  'last-90-days',
] as const satisfies ReadonlyArray<
  Exclude<import('../types/orders').DateFilter, { start: Date; end: Date }>
>;

// ─────────────────────────────────────────────────────────────────────────────
// Sync Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum number of sync timestamps to keep in history. Prevents unbounded growth. */
export const SYNC_HISTORY_MAX = 50;

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL_STATE (store seed value — import into ordersStore.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete initial state for the Zustand orders store.
 * Import this in ordersStore.ts to seed the store on first render.
 *
 * Note: ColumnsState.visibleColumns is derived from ALL_COLUMNS at startup.
 * Note: Set instances here are NOT frozen — the store manages immutability.
 */
export const INITIAL_ORDERS_STATE = {
  allOrders: [] as import('../types/orders').Order[],
  currentStatus: 'awaiting_shipment' as import('../types/orders').OrderStatus,
  filters: DEFAULT_FILTERS,
  pagination: DEFAULT_PAGINATION,
  selection: DEFAULT_SELECTION,
  columns: {
    columns: ALL_COLUMNS,
    columnOrder: [...ALL_COLUMN_KEYS] as string[],
    visibleColumns: new Set(
      ALL_COLUMNS.filter((c) => c.visible).map((c) => c.key),
    ),
  },
  sync: {
    lastSyncTime: null as Date | null,
    isSyncing: false,
    lastSyncError: null as string | null,
    syncHistory: [] as Date[],
  },
  zoom: 100 as import('../types/orders').ZoomLevel,
} as const satisfies {
  allOrders: import('../types/orders').Order[];
  currentStatus: import('../types/orders').OrderStatus;
  filters: FilterState;
  pagination: PaginationState;
  selection: SelectionState;
  // columns, sync, zoom: looser shape (satisfies checks structural compat)
  columns: {
    columns: ColumnConfig[];
    columnOrder: string[];
    visibleColumns: Set<string>;
  };
  sync: {
    lastSyncTime: Date | null;
    isSyncing: boolean;
    lastSyncError: string | null;
    syncHistory: Date[];
  };
  zoom: import('../types/orders').ZoomLevel;
};
