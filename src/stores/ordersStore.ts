/**
 * @file ordersStore.ts
 * @description Zustand store for the DrPrepper orders system.
 *
 * Design rules (enforced by this implementation):
 * 1. allOrders is the SSOT — never mutate, only replace
 * 2. No derived state in the store — compute on-demand in selectors
 * 3. No async operations in the store — services call APIs, then dispatch to store
 * 4. Changing any filter resets currentPage to 1
 * 5. Selection modes are mutually exclusive — enforced by all selection actions
 *
 * Selection mode transition matrix (per DJ spec):
 * | Current Mode          | Action              | Result                                |
 * |-----------------------|---------------------|---------------------------------------|
 * | null                  | Check checkbox      | Enter checkbox mode; add to set       |
 * | null                  | Click row           | Enter row-click mode; set rowId       |
 * | checkbox (1 checked)  | Uncheck that box    | Back to null mode                     |
 * | checkbox (2+ checked) | Click row           | NO ACTION (prevents misclick)         |
 * | checkbox (any)        | Check another box   | Stay checkbox mode; add to set        |
 * | row-click             | Click same row      | Deselect; back to null mode           |
 * | row-click             | Click different row | Stay row-click mode; switch to new row|
 * | row-click             | Check a checkbox    | Switch to checkbox; add checkbox      |
 */

import { create } from 'zustand';
import type {
  Order,
  OrderId,
  OrderLabel,
  OrderStatus,
  FilterState,
  SelectionState,
  PaginationState,
  PaginationMeta,
  ColumnsState,
  SyncState,
  ZoomLevel,
  PageSize,
  DateFilter,
  PanelState,
} from '../types/orders';
import {
  DEFAULT_FILTERS,
  DEFAULT_SELECTION,
  DEFAULT_PAGINATION,
  SYNC_HISTORY_MAX,
  ALL_COLUMNS,
  ALL_COLUMN_KEYS,
} from '../utils/orderConstants';
import {
  filterOrders,
  mergeOrders,
  validateOrderLabel,
} from '../utils/orderFilters';

// ─────────────────────────────────────────────────────────────────────────────
// Store Shape
// ─────────────────────────────────────────────────────────────────────────────

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
  // ── Orders (only updated via API response) ─────────────────────────────────
  /**
   * Replace the full orders list (e.g. initial load or hard reset).
   * This is the SSOT reset — use syncComplete for incremental updates.
   */
  setAllOrders: (orders: Order[]) => void;

  /**
   * Apply a partial update to a single order by ID.
   * Automatically sets lastUpdatedAt to now.
   * Callers must not include `id` in `updates` (enforced by Omit).
   */
  updateOrder: (id: OrderId, updates: Partial<Omit<Order, 'id'>>) => void;

  /**
   * Attach a validated OrderLabel to an order and transition it to 'shipped'.
   * Rejects invalid labels — never corrupts the store.
   *
   * Error handling: if label is invalid, logs to console and returns without
   * modifying state. The order remains 'awaiting_shipment'.
   */
  addLabel: (orderId: OrderId, label: OrderLabel) => void;

  // ── Status tab ─────────────────────────────────────────────────────────────
  /** Switch status tab and reset to page 1. */
  setStatus: (status: OrderStatus) => void;

  // ── Filters (each resets page to 1) ────────────────────────────────────────
  /** Update search string filter. Resets page to 1. */
  setSearchFilter: (search: string) => void;

  /** Set or clear SKU filter. Resets page to 1. */
  setSkuFilter: (skuId: string | null) => void;

  /** Set date range filter. Resets page to 1. */
  setDateFilter: (range: DateFilter) => void;

  /** Clear all filters back to defaults. Resets page to 1. */
  clearFilters: () => void;

  // ── Checkbox selection ──────────────────────────────────────────────────────
  /** Toggle checkbox for a single order. Handles mode transitions per spec matrix. */
  toggleCheckbox: (orderId: OrderId) => void;

  /** Clear all checkbox selections and reset selection state to null mode. */
  clearAllCheckboxes: () => void;

  // ── Row-click selection ─────────────────────────────────────────────────────
  /**
   * Select a row by click. Handles all mode transition cases:
   * - 2+ checkboxes active → NO ACTION (silent, per spec)
   * - Same row → deselect (back to null)
   * - Different row → switch row
   */
  selectRow: (orderId: OrderId) => void;

  /** Explicitly deselect the current row. Resets selection to null. */
  deselectRow: () => void;

  // ── Pagination ──────────────────────────────────────────────────────────────
  /** Set current page (minimum 1, clamped). */
  setCurrentPage: (page: number) => void;

  /** Change orders-per-page. Resets to page 1. */
  setOrdersPerPage: (count: PageSize) => void;

  // ── Columns ─────────────────────────────────────────────────────────────────
  /** Show or hide a column by key. */
  toggleColumnVisibility: (key: string) => void;

  /** Update column display order. Provide full ordered array of column keys. */
  reorderColumns: (newOrder: string[]) => void;

  /** Resize a column by key. */
  setColumnWidth: (key: string, widthPx: number) => void;

  // ── Sync ────────────────────────────────────────────────────────────────────
  /** Mark sync as started. Clears last error. */
  startSync: () => void;

  /**
   * Mark sync as complete. Merges incoming orders (upsert by id).
   * Caps sync history at SYNC_HISTORY_MAX entries.
   */
  syncComplete: (time: Date, incomingOrders: Order[]) => void;

  /** Record a sync error. Marks isSyncing = false. */
  syncError: (error: string) => void;

  // ── Zoom ────────────────────────────────────────────────────────────────────
  setZoom: (level: ZoomLevel) => void;
}

interface OrdersStoreSelectors {
  /**
   * Core filtered set — applies search + SKU + date filters.
   * Does NOT filter by status (use getFilteredOrdersByStatus for that).
   */
  getFilteredOrders: () => Order[];

  /** Current status tab + all active filters applied. */
  getFilteredOrdersByStatus: () => Order[];

  /** Current page slice of the current status tab + filters. */
  getPaginatedOrders: () => Order[];

  /** Derived panel state. Drives the right-side panel. Never stored. */
  getPanelState: () => PanelState;

  /**
   * Selection banner state.
   * Banner shows when 2+ checkboxes are selected.
   */
  getBannerState: () => { show: boolean; count: number };

  /** Pagination display metadata. Never stored — computed on demand. */
  getPaginationMeta: () => PaginationMeta;

  /** Total count of all orders (unfiltered). */
  getTotalOrderCount: () => number;

  /**
   * Filtered order count for the current status tab.
   * This is what the pagination counter shows.
   */
  getFilteredOrderCount: () => number;

  /**
   * Number of checkboxes currently checked.
   * Note: returns 0 when in row-click mode (not 1).
   * Use getPanelState() for panel logic.
   */
  getCheckboxSelectedCount: () => number;
}

type OrdersStore = OrdersStoreState & OrdersStoreActions & OrdersStoreSelectors;

// ─────────────────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_STATE: OrdersStoreState = {
  allOrders: [],
  currentStatus: 'awaiting_shipment',
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
    lastSyncTime: null,
    isSyncing: false,
    lastSyncError: null,
    syncHistory: [],
  },
  zoom: 100,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  ...INITIAL_STATE,

  // ── Orders ─────────────────────────────────────────────────────────────────

  setAllOrders: (orders) => set({ allOrders: orders }),

  updateOrder: (id, updates) =>
    set((state) => ({
      allOrders: state.allOrders.map((o) =>
        o.id === id ? { ...o, ...updates, lastUpdatedAt: new Date() } : o,
      ),
    })),

  addLabel: (orderId, label) => {
    const errors = validateOrderLabel(label);
    if (errors.length > 0) {
      console.error(
        `[OrdersStore] addLabel: rejected invalid label for order ${orderId}`,
        errors,
      );
      return; // Never corrupt the store with an invalid label
    }
    set((state) => ({
      allOrders: state.allOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              label,
              status: 'shipped' as OrderStatus,
              lastUpdatedAt: new Date(),
            }
          : o,
      ),
    }));
  },

  // ── Status ──────────────────────────────────────────────────────────────────

  setStatus: (status) =>
    set((state) => ({
      currentStatus: status,
      pagination: { ...state.pagination, currentPage: 1 },
    })),

  // ── Filters ─────────────────────────────────────────────────────────────────

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

  // ── Checkbox Selection ───────────────────────────────────────────────────────

  toggleCheckbox: (orderId) =>
    set((state) => {
      const { mode, checkboxSelectedIds } = state.selection;

      // Transition: row-click mode → switch to checkbox mode
      if (mode === 'row-click') {
        return {
          selection: {
            mode: 'checkbox' as SelectionMode,
            checkboxSelectedIds: new Set<OrderId>([orderId]),
            rowSelectedId: null,
          },
        };
      }

      // Build next set
      const next = new Set<OrderId>(checkboxSelectedIds);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }

      return {
        selection: {
          mode: next.size > 0 ? ('checkbox' as SelectionMode) : (null as SelectionMode),
          checkboxSelectedIds: next,
          rowSelectedId: null,
        },
      };
    }),

  clearAllCheckboxes: () =>
    set({ selection: { ...DEFAULT_SELECTION } }),

  // ── Row Selection ────────────────────────────────────────────────────────────

  selectRow: (orderId) =>
    set((state) => {
      const { mode, checkboxSelectedIds, rowSelectedId } = state.selection;

      // 2+ checkboxes active → NO ACTION (prevents misclick per spec)
      if (mode === 'checkbox' && checkboxSelectedIds.size >= 2) {
        return {};
      }

      // Same row already selected → deselect (back to null)
      if (mode === 'row-click' && rowSelectedId === orderId) {
        return { selection: { ...DEFAULT_SELECTION } };
      }

      // Otherwise: enter or stay in row-click mode, switch to this row
      return {
        selection: {
          mode: 'row-click' as SelectionMode,
          checkboxSelectedIds: new Set<OrderId>(),
          rowSelectedId: orderId,
        },
      };
    }),

  deselectRow: () => set({ selection: { ...DEFAULT_SELECTION } }),

  // ── Pagination ───────────────────────────────────────────────────────────────

  setCurrentPage: (page) =>
    set((state) => ({
      pagination: { ...state.pagination, currentPage: Math.max(1, page) },
    })),

  setOrdersPerPage: (count) =>
    set({ pagination: { currentPage: 1, ordersPerPage: count } }),

  // ── Columns ──────────────────────────────────────────────────────────────────

  toggleColumnVisibility: (key) =>
    set((state) => {
      const next = new Set<string>(state.columns.visibleColumns);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return {
        columns: { ...state.columns, visibleColumns: next },
      };
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
          c.key === key ? { ...c, widthPx } : c,
        ),
      },
    })),

  // ── Sync ──────────────────────────────────────────────────────────────────────

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

  // ── Zoom ──────────────────────────────────────────────────────────────────────

  setZoom: (level) => set({ zoom: level }),

  // ─────────────────────────────────────────────────────────────────────────────
  // SELECTORS
  // ─────────────────────────────────────────────────────────────────────────────

  getFilteredOrders: () => {
    const { allOrders, filters } = get();
    return filterOrders(allOrders, filters);
  },

  getFilteredOrdersByStatus: () => {
    const { currentStatus } = get();
    return get()
      .getFilteredOrders()
      .filter((o) => o.status === currentStatus);
  },

  getPaginatedOrders: () => {
    const { pagination } = get();
    const filtered = get().getFilteredOrdersByStatus();
    const { currentPage, ordersPerPage } = pagination;

    // Clamp page to valid range (filter change may reduce total pages)
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
      return {
        type: 'shipping-panel',
        selectedOrderIds: [rowSelectedId],
        selectedCount: 1,
      };
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

  getCheckboxSelectedCount: () =>
    get().selection.checkboxSelectedIds.size,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Backward Compatibility Exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use useOrdersStore directly.
 * Retained for components that import the old store shape.
 */
export type { OrdersStore };

// Re-export SelectionMode for convenience
type SelectionMode = import('../types/orders').SelectionMode;
