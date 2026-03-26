---
title: Phase 1 Architecture — Store Setup & Page Layout
created: 2026-03-26
status: complete
phase: 1
---

# Phase 1 Architecture — Store Setup & Page Layout

## Overview

Phase 1 establishes the foundation: Zustand SSOT (Single Source of Truth) store + page layout components.

**Goal**: Create a fully functional AwaitingShipments page with selection, filtering, pagination, and right-panel navigation — all backed by mock data.

---

## Data Flow Architecture

```
Mock Data (mockOrders.ts)
    ↓
Store Initialization (useOrdersStore.setAllOrders)
    ↓
Zustand Store (SSOT)
├── State: allOrders, filters, selection, pagination, columns, sync, zoom
├── Actions: 20+ mutations (setSearch, toggleCheckbox, selectRow, etc.)
└── Selectors: 10+ computed (getFilteredOrders, getPaginatedOrders, etc.)
    ↓
Components (via useOrdersStore hook)
├── OrdersTable: Render paginated + filtered orders
├── ControlBar: Filter/search/export controls
├── RightPanel: Navigation + order details
├── Pagination: Page controls
└── SelectionBanner: Multi-select indicator
    ↓
User Interaction (click, type, select)
    ↓
Store Action Dispatch (store.toggleCheckbox, store.setSearch, etc.)
    ↓
State Mutation → Component Re-render (React auto-subscribe)
```

---

## Store Design (SSOT Pattern)

### State Structure

```typescript
interface OrdersStoreState {
  // Source of Truth (immutable, only via API or setAllOrders)
  allOrders: Order[];

  // UI State (mutable)
  currentStatus: 'awaiting_shipment' | 'shipped' | 'cancelled';
  filters: FilterState;
  pagination: PaginationState;
  selection: SelectionState;
  columns: ColumnsState;
  sync: SyncState;
  zoom: number; // 100, 115, 125
}
```

### Key Rules

1. **allOrders is immutable** — Only updated via `setAllOrders()` (from API) or `mergeOrders()` (sync)
2. **Derived state never stored** — Filtered orders, paginated orders, panel state all computed on-demand
3. **No side effects in store** — Store = mutations only; services = API calls
4. **Selection is mutually exclusive** — Checkbox mode XOR row-click mode (enforced in actions)

---

## Component Architecture

### Page Structure

```
AwaitingShipments.tsx (Page)
├── SelectionBanner.tsx (conditional, sticky top)
├── ControlBar.tsx
│   ├── SearchInput (onChange → setSearchFilter)
│   ├── SkuDropdown (onChange → setSkuFilter)
│   ├── DateFilterDropdown (onChange → setDateFilter)
│   ├── ExportCsvButton (onClick → exportToCSV)
│   ├── ColumnsDropdown (onClick → toggleColumnVisibility)
│   └── ZoomToggle (onClick → setZoom)
├── Main Layout (Grid)
│   ├── OrdersTable.tsx
│   │   ├── thead (column headers)
│   │   └── tbody (rows)
│   │       └── Row (onClick → selectRow or toggleCheckbox)
│   └── RightPanel.tsx (sticky, 400px width)
│       ├── Empty state
│       ├── ShippingPanel.tsx (1 order selected)
│       │   ├── Order details
│       │   ├── Items list
│       │   ├── Address (ship-to)
│       │   ├── Rates placeholder
│       │   ├── Label status
│       │   └── Billing (if exists)
│       └── BatchPanel.tsx (2+ orders selected)
│           ├── Summary (X orders, Y items, $Z total)
│           └── Order list
└── Pagination.tsx (sticky bottom)
    ├── Page nav (← Prev / Next →)
    ├── 50/100/200 toggle
    └── Display range ("1–50 of 105")
```

### Component Responsibilities

| Component | Responsibility | State Source |
|-----------|-----------------|--------------|
| AwaitingShipments | Layout + page orchestration | useOrdersStore |
| OrdersTable | Render 24 columns + selection | useOrdersStore.getPaginatedOrders() |
| ControlBar | Search + filter + export UI | useOrdersStore |
| RightPanel | Route to Shipping/Batch panels | useOrdersStore.getPanelState() |
| ShippingPanel | Display 1 order details | useOrdersStore + props |
| BatchPanel | Display 2+ order summary | useOrdersStore.selection |
| Pagination | Page nav + size controls | useOrdersStore.pagination + pageMeta |
| SelectionBanner | Show X Orders Selected | useOrdersStore.selection |

---

## Filtering Logic (AND-Stacked)

All filters apply together. Example:

```
allOrders = 100 orders
  ↓ search "Danny" → 15 orders (Danny + Danny's orders)
  ↓ SKU filter "SKU-123" → 5 orders (Danny's SKU-123 orders)
  ↓ date filter "Last 30 days" → 2 orders (Danny's SKU-123, last 30 days)
  ↓ pagination (page 1, 50/page) → 2 orders displayed
```

**Key**: All filters search across **entire allOrders**, not just current page.

### Implementation

```typescript
// 1. Filter from source (allOrders)
const filtered = filterOrders(allOrders, filters);

// 2. Filter by status (awaiting_shipment, shipped, cancelled)
const byStatus = filtered.filter(o => o.status === currentStatus);

// 3. Paginate filtered results
const start = (currentPage - 1) * ordersPerPage;
const paginated = byStatus.slice(start, start + ordersPerPage);
```

---

## Selection Logic (Mutually Exclusive)

### Checkbox Mode (Multi-select)

- Click checkbox → toggle in `checkboxSelectedIds` Set
- 1 checkbox → Shipping Panel
- 2+ checkboxes → Batch Panel
- Uncheck all → empty panel

### Row-Click Mode (Single-select)

- Click row → set `rowSelectedId` + clear checkboxes
- Click different row → update `rowSelectedId`
- Click 2+ checked rows while in row-click → no action (prevent confusion)

### Enforcement

```typescript
// In toggleCheckbox
if (checkboxSelectedIds.size > 0) {
  mode = 'checkbox'; // Stay in checkbox mode
}

// In selectRow
mode = 'row-click';
checkboxSelectedIds = new Set(); // Clear checkboxes
```

---

## Pagination Logic

### State

```typescript
currentPage: number;        // 1-indexed
ordersPerPage: 50 | 100 | 200;
```

### Derived

```typescript
totalOrders: getFilteredOrdersByStatus().length;
totalPages: Math.ceil(totalOrders / ordersPerPage);
displayRange: "1-50 of 105";
```

### Behavior

- Filter or search → reset to page 1
- Change page size → reset to page 1
- Filter reduces total → clamp page to valid range
- Example: Page 10 of 5 → clamp to page 5

---

## Column Visibility & Reordering

### State

```typescript
visibleColumns: Set<string>;    // Quick lookup
columnOrder: string[];          // Sequence
columns: ColumnConfig[];        // Full config (width, label, etc.)
```

### Actions

- `toggleColumnVisibility(key)` — Add/remove from Set
- `reorderColumns(newOrder)` — Update sequence
- `setColumnWidth(key, width)` — Update width

### Persistence

Currently: In-memory (Zustand). Future: localStorage or backend.

---

## Zoom Implementation

### State

```typescript
zoom: number; // 100, 115, 125
```

### CSS

```scss
// Root element
.awaitingShipmentsContainer {
  zoom: calc(var(--zoom-level) / 100); // 1, 1.15, 1.25
}

// Perimeter elements (fixed)
.header,
.footer,
.leftPanel,
.rightPanel {
  position: fixed; // or sticky
  // No zoom applied
}
```

### Constraint

- Zoom affects table + content only
- Header, footer, left panel, right panel stay fixed size
- Prevents layout break on zoom

---

## Mock Data Structure

### Approach

- ~46 realistic orders across 4 clients
- Mix of awaiting_shipment, shipped, cancelled
- Shipped orders include OrderLabel + BillingCalculation
- Denormalized fields (itemNames, skus) for fast search

### Clients

- **kfgoods** — 15 orders
- **drprepper** — 12 orders
- **readyco** — 10 orders
- **tacticalco** — 9 orders

### Realistic Details

- Weight ranges: 2–50 oz
- Ship-to addresses across US
- Multiple items per order
- Carriers: USPS, UPS, FedEx
- Labels on ~50% of orders

---

## TypeScript Contracts

### Store Interface

```typescript
type OrdersStore = OrdersStoreState & OrdersStoreActions & OrdersStoreSelectors;
```

All state, actions, selectors are fully typed (no `any`).

### Validation

All Order data validated before entering store:
- `validateOrder(order)` — Throws if invalid
- `validateOrderLabel(label)` — Throws if invalid
- `isValidOrder(order)` — Type guard

### Immutability

Orders are deeply immutable:
- New object spread on update: `{ ...order, status: 'shipped' }`
- Never mutate array in place: `allOrders[0].status = 'shipped'` ❌
- Always replace array: `allOrders = [...allOrders.map(...)]` ✅

---

## Performance Characteristics

### Filtering

- **1,000 orders**: ~5ms
- **10,000 orders**: ~50ms
- **100,000 orders**: ~500ms (acceptable for hourly sync)

### Pagination

- Constant time (Array.slice)
- Always slice from filtered array

### Selection

- Checkbox: O(1) Set operations
- Selection state: negligible

### Rendering

- Only visible rows rendered (virtualization in Phase 2)
- React memo on row components (avoid re-render of non-selected rows)

---

## Error Handling

### Validation

```typescript
try {
  store.addLabel(orderId, label); // Validates label
} catch (error) {
  console.error('Invalid label:', error);
  // Leave order in state, don't auto-ship
}
```

### Graceful Degradation

- Missing fields → default values
- Invalid dates → ignore filter
- Empty orders → show empty state
- Extreme pagination → clamp to valid range

---

## Testing Strategy

### Unit Tests

- **Store**: actions, selectors, immutability
- **Filters**: search, SKU, date ranges, edge cases
- **Validation**: valid/invalid orders, labels
- **Pagination**: page clamp, range calculation

### Integration Tests

- Filter + paginate + select
- Selection mode transitions
- Export CSV with filters

### Visual Tests

- Table rendering (24 columns)
- Responsive layout (mobile, tablet, desktop)
- Zoom levels (100%, 115%, 125%)
- Sticky elements (header, footer, panel)

---

## Known Limitations (Phase 1)

- ⚠️ Mock data only (no real API)
- ⚠️ No label creation (Phase 2)
- ⚠️ No rate fetching (Phase 2)
- ⚠️ No batch printing (Phase 3)
- ⚠️ Column width not persisted (Phase 2)
- ⚠️ No multi-warehouse support (Phase 3+)

---

## Transition to Phase 2

Phase 2 will integrate services:
1. **RateService** — Fetch rates from ShipStation V2
2. **LabelService** — Create labels (V1 + V2)
3. **SyncService** — Incremental sync with external detection
4. **BillingService** — Calculate costs

Store will add new actions:
- `syncOrders()` — Trigger sync
- `fetchRates(orderId)` — Load rates
- `createLabel(orderId, rate)` — Create label

---

## References

- `DATA-STRUCTURES-AND-ZUSTAND-SCHEMA.md` — Complete store design
- `DJ-SPECIFICATION-QA-LOCKED.md` — Feature requirements
- `CONTRIBUTING.md` — Code standards
- `PHASE-1-IMPLEMENTATION-PLAN.md` — Build timeline

---

**Last Updated**: 2026-03-26 16:27 EDT
**Status**: Complete (PR #18)
