---
title: Data Structures & Zustand Store Schema
created: 2026-03-26 15:44 EDT
audience: Albert (approval) + Kayla (implementation)
purpose: Concrete data structures + interfaces + Zustand store design before feature implementation
---

# Data Structures & Zustand Store Schema

**Core Principle**: Store complete API response (immutable source), derive filtered views (client-based cache for performance).

---

## Part 1: Core Data Structures (TypeScript Interfaces)

### Order Entity (Complete API Response)

```typescript
// Core order from ShipStation
interface Order {
  // IDs
  id: string;                    // OrderID (unique)
  orderNum: string;              // Order # (display)
  orderId: number;               // ShipStation orderId
  
  // Client/Store
  clientId: string;              // Multi-tenant identifier
  storeId?: number;              // ShipStation store ID
  
  // Dates
  date: Date;                    // Order date
  createdAt: Date;               // Created timestamp
  lastUpdatedAt: Date;           // Last modified
  
  // Customer
  customer: string;              // Recipient name (ship-to)
  customerId?: string;
  
  // Shipping Address (ship-to)
  shipTo: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone?: string;
    residential: boolean;        // Inferred or override
  };
  
  // Ship-from Address
  shipFrom: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
  
  // Items
  items: OrderItem[];
  itemCount: number;
  itemNames: string[];           // Denormalized for search
  skus: string[];                // Denormalized for SKU filter
  
  // Weight & Dimensions
  weight: number;                // Total weight (oz)
  dimensions: {
    length: number;              // inches
    width: number;
    height: number;
  };
  
  // Rates & Costs (from ShipStation)
  baseRate: number;              // Raw rate from SS
  
  // Status
  status: 'awaiting_shipment' | 'shipped' | 'cancelled';
  externallyShipped?: boolean;   // Shipped outside app
  
  // Label Information (immutable after creation)
  label?: OrderLabel;            // ShipStation label data (immutable contract)
  
  // Billing
  billing?: BillingCalculation;  // Calculated cost
  
  // Metadata
  notes?: string;
  customFields?: Record<string, any>;
}

interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  weight: number;                // per unit
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

// IMMUTABLE CONTRACT (locked by DJ, Q1 pending verification)
interface OrderLabel {
  // From ShipStation V2 API
  trackingNumber: string;
  shipment_cost: number;
  carrier_code: string;
  service_code: string;
  labelUrl?: string;
  
  // From ShipStation V1 API
  shippingProviderId: number;
  carrierCode: string;
  
  // Metadata
  createdAt: Date;
  createdBy?: string;            // User who printed
  
  // State
  voided?: boolean;
  voidedAt?: Date;
}

interface BillingCalculation {
  baseRate: number;
  residentialSurcharge: number;
  carrierMarkupPercent: number;
  subtotal: number;
  totalCost: number;
  breakdown: string;             // Audit trail
  calculatedAt: Date;
  roundingMethod: 'bankers' | 'standard';
}
```

---

### Filter State

```typescript
interface FilterState {
  search: string;                // Search all fields (name, SKU, order#, etc.)
  skuId: string | null;          // Selected SKU (from dropdown)
  dateRange: DateFilter;         // Today, Last 7 days, etc.
}

type DateFilter = 
  | 'today'
  | 'yesterday'
  | 'last-7-days'
  | 'last-14-days'
  | 'last-30-days'
  | 'last-90-days'
  | { start: Date; end: Date }; // Custom range
```

---

### Selection State

```typescript
interface SelectionState {
  mode: 'checkbox' | 'row-click' | null;
  checkboxSelectedIds: Set<string>;     // Multi-select (checkbox)
  rowSelectedId: string | null;         // Single select (row click)
}

// Derived selectors (not stored, computed on-demand)
interface PanelState {
  type: 'empty' | 'shipping-panel' | 'batch-panel' | 'order-details-panel';
  selectedOrderIds: string[];
  selectedCount: number;
}
```

---

### Column Configuration

```typescript
interface ColumnConfig {
  key: string;                   // Unique identifier
  label: string;                 // Display name
  width: number;                 // px
  visible: boolean;              // Show/hide
  sortable: boolean;
  order: number;                 // Position in table
}

interface ColumnsState {
  columns: ColumnConfig[];
  columnOrder: string[];         // Column sequence
  visibleColumns: Set<string>;   // Quick lookup
}

// All 23 columns (from DJ spec)
const ALL_COLUMNS = [
  'select', 'date', 'client', 'orderNum', 'customer', 'itemname', 
  'sku', 'qty', 'weight', 'shipto', 'carrier', 'custcarrier', 
  'total', 'bestrate', 'margin', 'age', 'tracking', 'labelcreated',
  'test_carrierCode', 'test_shippingProviderID', 'test_clientID',
  'test_serviceCode', 'test_bestRate', 'test_orderLocal'
];
```

---

### Pagination State

```typescript
interface PaginationState {
  currentPage: number;           // 1-indexed
  ordersPerPage: 50 | 100 | 200; // Page size
}

// Derived (not stored)
interface PaginationMeta {
  totalOrders: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  displayRange: string;          // "1-50 of 105"
}
```

---

### Sync State

```typescript
interface SyncState {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  lastSyncError: string | null;
  syncedAt: Date[];              // History for analytics
}
```

---

## Part 2: Zustand Store Architecture

### Store Design Pattern

```typescript
// Rule 1: Store COMPLETE API response (never mutate)
// Rule 2: Derive filtered/paginated views on-demand
// Rule 3: No side effects in store (only data mutations)
// Rule 4: Services handle API calls, stores handle state
```

---

### Store: OrdersStore (CRITICAL — SSOT)

**Responsibility**: All order data + filters + selection + pagination

```typescript
interface OrdersStoreState {
  // ═══════════════════════════════════════════════════════
  // SOURCE OF TRUTH (immutable, only updated via API)
  // ═══════════════════════════════════════════════════════
  
  allOrders: Order[];            // Complete API response (never mutate)
  
  // ═══════════════════════════════════════════════════════
  // UI STATE (mutable, for current view)
  // ═══════════════════════════════════════════════════════
  
  currentStatus: 'awaiting_shipment' | 'shipped' | 'cancelled';
  filters: FilterState;
  pagination: PaginationState;
  selection: SelectionState;
  columns: ColumnsState;
  sync: SyncState;
  zoom: number;                  // 100, 115, 125
  
  // ═══════════════════════════════════════════════════════
  // ACTIONS (mutations)
  // ═══════════════════════════════════════════════════════
}

interface OrdersStoreActions {
  // Order management
  setAllOrders: (orders: Order[]) => void;  // Only via API
  updateOrder: (id: string, updates: Partial<Order>) => void;
  addLabel: (orderId: string, label: OrderLabel) => void;
  
  // Status
  setStatus: (status: 'awaiting_shipment' | 'shipped' | 'cancelled') => void;
  
  // Filters (cross-system, not affected by status)
  setSearchFilter: (search: string) => void;
  setSkuFilter: (skuId: string | null) => void;
  setDateFilter: (range: DateFilter) => void;
  clearFilters: () => void;
  
  // Selection (checkbox)
  toggleCheckbox: (orderId: string) => void;
  selectCheckbox: (orderId: string) => void;
  deselectCheckbox: (orderId: string) => void;
  clearAllCheckboxes: () => void;
  
  // Selection (row click)
  selectRow: (orderId: string) => void;
  deselectRow: () => void;
  
  // Pagination
  setCurrentPage: (page: number) => void;
  setOrdersPerPage: (count: 50 | 100 | 200) => void;
  
  // Columns
  toggleColumnVisibility: (key: string) => void;
  reorderColumns: (newOrder: string[]) => void;
  setColumnWidth: (key: string, width: number) => void;
  
  // Sync
  startSync: () => void;
  syncComplete: (time: Date, newOrders: Order[]) => void;
  syncError: (error: string) => void;
  
  // Zoom
  setZoom: (level: 100 | 115 | 125) => void;
}

interface OrdersStoreSelectors {
  // Computed (never stored, derived on-demand)
  
  // Filter: Apply search + SKU + date filters (cross-system)
  getFilteredOrders: () => Order[];
  
  // Get orders for current status + filters
  getFilteredOrdersByStatus: () => Order[];
  
  // Paginate filtered results
  getPaginatedOrders: () => Order[];
  
  // Selection state
  getPanelState: () => PanelState;
  getBannerState: () => { show: boolean; count: number };
  
  // Pagination meta
  getPaginationMeta: () => PaginationMeta;
  
  // Counts
  getTotalOrderCount: () => number;
  getFilteredOrderCount: () => number;
  getSelectedOrderCount: () => number;
}
```

---

### Zustand Store Implementation (Minimal)

```typescript
import { create } from 'zustand';

type OrdersStore = OrdersStoreState & OrdersStoreActions & OrdersStoreSelectors;

export const useOrdersStore = create<OrdersStore>((set, get) => ({
  // ═══════════════════════════════════════════════════════
  // INITIAL STATE
  // ═══════════════════════════════════════════════════════
  
  allOrders: [],
  currentStatus: 'awaiting_shipment',
  filters: {
    search: '',
    skuId: null,
    dateRange: 'today'
  },
  pagination: {
    currentPage: 1,
    ordersPerPage: 50
  },
  selection: {
    mode: null,
    checkboxSelectedIds: new Set(),
    rowSelectedId: null
  },
  columns: {
    columns: initializeColumns(),
    columnOrder: ALL_COLUMNS,
    visibleColumns: new Set(ALL_COLUMNS)
  },
  sync: {
    lastSyncTime: null,
    isSyncing: false,
    lastSyncError: null,
    syncedAt: []
  },
  zoom: 100,
  
  // ═══════════════════════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════════════════════
  
  setAllOrders: (orders) => set({ allOrders: orders }),
  
  updateOrder: (id, updates) => set((state) => ({
    allOrders: state.allOrders.map((o) =>
      o.id === id ? { ...o, ...updates, lastUpdatedAt: new Date() } : o
    )
  })),
  
  addLabel: (orderId, label) => set((state) => ({
    allOrders: state.allOrders.map((o) =>
      o.id === orderId ? { ...o, label, status: 'shipped' } : o
    )
  })),
  
  setStatus: (status) => set({ currentStatus: status }),
  
  setSearchFilter: (search) => set((state) => ({
    filters: { ...state.filters, search },
    pagination: { ...state.pagination, currentPage: 1 } // Reset to page 1
  })),
  
  setSkuFilter: (skuId) => set((state) => ({
    filters: { ...state.filters, skuId },
    pagination: { ...state.pagination, currentPage: 1 }
  })),
  
  setDateFilter: (dateRange) => set((state) => ({
    filters: { ...state.filters, dateRange },
    pagination: { ...state.pagination, currentPage: 1 }
  })),
  
  clearFilters: () => set((state) => ({
    filters: { search: '', skuId: null, dateRange: 'today' },
    pagination: { ...state.pagination, currentPage: 1 }
  })),
  
  toggleCheckbox: (orderId) => set((state) => {
    const newSelected = new Set(state.selection.checkboxSelectedIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    return {
      selection: {
        ...state.selection,
        checkboxSelectedIds: newSelected,
        mode: newSelected.size > 0 ? 'checkbox' : null
      }
    };
  }),
  
  clearAllCheckboxes: () => set((state) => ({
    selection: {
      ...state.selection,
      checkboxSelectedIds: new Set(),
      mode: null
    }
  })),
  
  selectRow: (orderId) => set((state) => ({
    selection: {
      mode: 'row-click',
      checkboxSelectedIds: new Set(),
      rowSelectedId: orderId
    }
  })),
  
  deselectRow: () => set((state) => ({
    selection: {
      mode: null,
      checkboxSelectedIds: new Set(),
      rowSelectedId: null
    }
  })),
  
  setCurrentPage: (page) => set((state) => ({
    pagination: { ...state.pagination, currentPage: page }
  })),
  
  setOrdersPerPage: (count) => set((state) => ({
    pagination: { currentPage: 1, ordersPerPage: count }
  })),
  
  toggleColumnVisibility: (key) => set((state) => {
    const newVisible = new Set(state.columns.visibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    return {
      columns: { ...state.columns, visibleColumns: newVisible }
    };
  }),
  
  reorderColumns: (newOrder) => set((state) => ({
    columns: { ...state.columns, columnOrder: newOrder }
  })),
  
  setColumnWidth: (key, width) => set((state) => ({
    columns: {
      ...state.columns,
      columns: state.columns.columns.map((c) =>
        c.key === key ? { ...c, width } : c
      )
    }
  })),
  
  startSync: () => set((state) => ({
    sync: { ...state.sync, isSyncing: true }
  })),
  
  syncComplete: (time, newOrders) => set((state) => ({
    allOrders: mergeOrders(state.allOrders, newOrders),
    sync: {
      lastSyncTime: time,
      isSyncing: false,
      lastSyncError: null,
      syncedAt: [...state.sync.syncedAt, time]
    }
  })),
  
  syncError: (error) => set((state) => ({
    sync: { ...state.sync, isSyncing: false, lastSyncError: error }
  })),
  
  setZoom: (level) => set({ zoom: level }),
  
  // ═══════════════════════════════════════════════════════
  // SELECTORS (derived, computed on-demand)
  // ═══════════════════════════════════════════════════════
  
  getFilteredOrders: () => {
    const state = get();
    return filterOrders(state.allOrders, state.filters);
  },
  
  getFilteredOrdersByStatus: () => {
    const state = get();
    const filtered = filterOrders(state.allOrders, state.filters);
    return filtered.filter((o) => o.status === state.currentStatus);
  },
  
  getPaginatedOrders: () => {
    const state = get();
    const filtered = get().getFilteredOrdersByStatus();
    const { currentPage, ordersPerPage } = state.pagination;
    const start = (currentPage - 1) * ordersPerPage;
    const end = start + ordersPerPage;
    return filtered.slice(start, end);
  },
  
  getPanelState: () => {
    const state = get();
    const { mode, checkboxSelectedIds, rowSelectedId } = state.selection;
    
    if (mode === 'checkbox') {
      const count = checkboxSelectedIds.size;
      if (count === 1) {
        return {
          type: 'shipping-panel',
          selectedOrderIds: Array.from(checkboxSelectedIds),
          selectedCount: count
        };
      }
      if (count > 1) {
        return {
          type: 'batch-panel',
          selectedOrderIds: Array.from(checkboxSelectedIds),
          selectedCount: count
        };
      }
    }
    
    if (mode === 'row-click' && rowSelectedId) {
      return {
        type: 'shipping-panel',
        selectedOrderIds: [rowSelectedId],
        selectedCount: 1
      };
    }
    
    return {
      type: 'empty',
      selectedOrderIds: [],
      selectedCount: 0
    };
  },
  
  getBannerState: () => {
    const { selection } = get();
    const count = selection.checkboxSelectedIds.size;
    return { show: count >= 2, count };
  },
  
  getPaginationMeta: () => {
    const state = get();
    const total = get().getFilteredOrderCount();
    const { currentPage, ordersPerPage } = state.pagination;
    const pages = Math.ceil(total / ordersPerPage);
    const start = (currentPage - 1) * ordersPerPage + 1;
    const end = Math.min(currentPage * ordersPerPage, total);
    
    return {
      totalOrders: total,
      totalPages: pages,
      startIndex: start,
      endIndex: end,
      displayRange: `${start}-${end} of ${total}`
    };
  },
  
  getTotalOrderCount: () => get().allOrders.length,
  
  getFilteredOrderCount: () => get().getFilteredOrdersByStatus().length,
  
  getSelectedOrderCount: () => {
    const { selection } = get();
    return selection.checkboxSelectedIds.size > 0 ? selection.checkboxSelectedIds.size : 1;
  }
}));
```

---

## Part 3: Filtering Strategy (Client-Based Cache)

### Current Implementation (Source-Based)

For now, filter directly from `allOrders`:

```typescript
function filterOrders(orders: Order[], filters: FilterState): Order[] {
  let result = [...orders];
  
  // Search filter (all fields)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    result = result.filter((o) => {
      const searchable = [
        o.customer,
        o.orderNum,
        o.itemNames.join(' '),
        o.skus.join(' '),
        o.clientId,
        o.shipTo.postalCode
      ].join(' ').toLowerCase();
      return searchable.includes(term);
    });
  }
  
  // SKU filter
  if (filters.skuId) {
    result = result.filter((o) => o.skus.includes(filters.skuId));
  }
  
  // Date filter
  if (filters.dateRange !== 'all') {
    const range = getDateRange(filters.dateRange);
    result = result.filter((o) => {
      const orderDate = new Date(o.date);
      return orderDate >= range.start && orderDate <= range.end;
    });
  }
  
  return result;
}
```

### Future: Client-Based Cache (Performance Optimization)

Albert will manually add after confirming behavior:

```typescript
// After app behavior is validated
interface OrdersStoreState {
  allOrders: Order[];                    // Source (immutable)
  ordersByClient: Record<string, Order[]>; // Cache: clientId → filtered orders
}

// When allOrders changes, update cache
const updateClientCache = (allOrders: Order[]) => {
  const cache: Record<string, Order[]> = {};
  for (const order of allOrders) {
    if (!cache[order.clientId]) {
      cache[order.clientId] = [];
    }
    cache[order.clientId].push(order);
  }
  return cache;
};
```

---

## Part 4: Implementation Roadmap

### Week 1: Store Setup + Page Layout
- [ ] Implement Zustand store (OrdersStore complete)
- [ ] Create page layout (table, right panel, filters)
- [ ] Implement pagination controls
- [ ] Implement column toggles

### Week 2: Filtering + Selection
- [ ] Implement search filter (real-time)
- [ ] Implement SKU filter (dropdown)
- [ ] Implement date filter (dropdown)
- [ ] Implement checkbox selection logic
- [ ] Implement row-click selection logic
- [ ] Implement selection banner + clear button

### Week 3: Services + APIs
- [ ] RateService (ShipStation V2)
- [ ] LabelService (V1 + V2 extraction)
- [ ] SyncService (incremental)
- [ ] BillingService (calculation)

### Week 4: Features + Testing
- [ ] Batch panel (if Q2 answered)
- [ ] SKU sort grouping (if Q3 answered)
- [ ] Print queue (if Q5 answered)
- [ ] Integration testing

---

## Part 5: Implementation Checklist (85% Confidence Gate)

Before implementing any feature, assess:

- [ ] Data structure complete? (all fields known)
- [ ] Zustand integration clear? (actions defined)
- [ ] API contract locked? (V1/V2 mapping confirmed)
- [ ] Edge cases handled? (null, undefined, empty)
- [ ] Performance acceptable? (filtering on 10k+ orders)
- [ ] Tests planned? (unit + integration)

**If <85% confident on any of above: Do NOT proceed. Log reason and escalate to Albert.**

---

## Part 6: Feature Implementation Log

| Feature | Status | Confidence | Notes |
|---------|--------|------------|-------|
| | | | |

Add entry for each feature as it's attempted. Mark success/fail + confidence score + blockers.

---

**Ready for Albert's approval before feature implementation starts.**

**Last Updated**: 2026-03-26 15:44 EDT
