# SECTION-ARCHITECTURE.md — Sections 2–7 Deep Architecture

> **Version:** 1.0.0 — March 27, 2026  
> **Status:** PLANNING — No implementation. Architecture spec only.  
> **Reference pattern:** `OrdersView.tsx`, `ClientBadge.tsx`, `clientColor.ts`  
> **Stores SSOT:** `ordersStore.ts` (Zustand v5)  
> **Canonical types:** `src/types/orders.ts`

---

## Table of Contents

1. [Shared Components Extraction (Cross-Section)](#shared-components-extraction)
2. [Section 2: Stats Bar](#section-2-stats-bar)
3. [Section 3: Sidebar](#section-3-sidebar)
4. [Section 4: Right Panel](#section-4-right-panel)
5. [Section 5: Header/Toolbar](#section-5-headertoolbar)
6. [Section 6: Settings Page](#section-6-settings-page)
7. [Section 7: Billing Section](#section-7-billing-section)
8. [Store Changes Summary](#store-changes-summary)
9. [SCSS Token Strategy](#scss-token-strategy)
10. [DRY Violations Cross-Reference](#dry-violations-cross-reference)

---

## Shared Components Extraction

Components appearing in 2+ sections → `src/components/shared/`.

| Component | Props Interface | Used In |
|-----------|----------------|---------|
| `StatusBadge` | `{ status: OrderStatus \| BillingStatus; size?: 'sm' \| 'md' }` | Sections 4, 5, 7 |
| `CountBadge` | `{ count: number \| null; variant?: 'default' \| 'warn' \| 'accent' }` | Sections 2, 3, 5 |
| `DateRangePicker` | `{ startDate: string \| null; endDate: string \| null; onChange: (start: string \| null, end: string \| null) => void; presets?: DatePreset[] }` | Sections 2, 5, 7 |
| `SyncIndicator` | `{ syncing: boolean; lastSyncTime: Date \| null; onManualSync?: () => void }` | Sections 3, 5 |
| `ClientBadge` | `{ clientName: string }` | Sections 3, 4, 5, 7 (already built at `OrdersView/cells/ClientBadge.tsx` — **move to shared**) |
| `StatCard` | `{ label: string; value: number \| string; icon?: string; variant?: 'default' \| 'warn' \| 'success' }` | Sections 2, 7 |
| `ProgressBar` | `{ current: number; total: number; label?: string }` | Sections 2, 4 |
| `ActionDropdown` | `{ label: string; items: DropdownItem[]; disabled?: boolean }` | Sections 4, 5 |
| `TestModeToggle` | `{ enabled: boolean; onChange: (v: boolean) => void }` | Sections 4 (single + batch) |
| `ConfirmDialog` | `{ open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }` | Sections 6, 7 |
| `EmptyState` | `{ icon: string; title: string; subtitle?: string }` | Sections 4, 7 |
| `CurrencyDisplay` | `{ amount: number; size?: 'sm' \| 'md' \| 'lg' }` | Sections 4, 7 |

### Shared Type Definitions

```typescript
// src/components/shared/types.ts

export interface DropdownItem {
  key: string;
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface DatePreset {
  label: string;       // "Today", "Last 7 days", "This month"
  getRange: () => { start: string; end: string };
}
```

### Migration: ClientBadge

Currently at `src/components/OrdersView/cells/ClientBadge.tsx`. Move to `src/components/shared/ClientBadge.tsx`. Update import in `OrdersView.tsx` and all new consumers. The component itself is correct — props-only, hash-derived color, no store deps. **Reference pattern for all shared components.**

---

## Section 2: Stats Bar

### A. Component Tree

```
StatsBar (src/components/StatsBar/StatsBar.tsx)
  Props: {} (no props — reads directly from store)
  Store reads:
    { allOrders: Order[] } from ordersStore
    { dateStart: string | null, dateEnd: string | null } from ordersStore
  Actions dispatched:
    ordersStore.setDateRange(start, end)
  Local state: none
  Sub-components: [DateRangePicker, StatCard, ProgressBar]
  Own SCSS: yes (StatsBar.module.scss)
```

```
DateRangePicker (src/components/shared/DateRangePicker.tsx)
  Props: {
    startDate: string | null;
    endDate: string | null;
    onChange: (start: string | null, end: string | null) => void;
    presets?: DatePreset[];
  }
  Store reads: none (pure controlled component)
  Actions dispatched: none (parent calls onChange)
  Local state:
    dropdownOpen: boolean (UI-only, controls preset picker visibility)
  Sub-components: []
  Own SCSS: yes (DateRangePicker.module.scss)
```

```
StatCard (src/components/shared/StatCard.tsx)
  Props: {
    label: string;
    value: number | string;
    icon?: string;
    variant?: 'default' | 'warn' | 'success';
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: yes (StatCard.module.scss)
```

```
ProgressBar (src/components/shared/ProgressBar.tsx)
  Props: {
    current: number;
    total: number;
    label?: string;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: yes (ProgressBar.module.scss)
```

### B. Shared Components

| Component | Usage in Section 2 |
|-----------|-------------------|
| `DateRangePicker` | Date range selector (from/to) |
| `StatCard` | Total orders, Need to Ship, Upcoming counts |
| `ProgressBar` | "X of Y shipped" progress |

### C. Store Changes Required

**ordersStore — no new fields required.** All data derived from existing `allOrders`, `dateStart`, `dateEnd`.

New **selectors** (computed in-component via `useMemo`, not stored):

```typescript
// Derived in StatsBar.tsx via useMemo:

const totalOrders = allOrders.length;

const needToShip = allOrders.filter(
  (o) => o.status === 'awaiting_shipment'
).length;

const upcoming = allOrders.filter(
  (o) => o.status === 'awaiting_shipment' && o.orderDate > new Date()
).length;

const shipped = allOrders.filter(
  (o) => o.status === 'shipped'
).length;

// Progress: shipped / (shipped + awaiting)
const shippable = shipped + needToShip;
```

### D. DRY Violations

No violations touched. Section 2 is purely derived reads — no business logic, no services.

### E. Data Flow

**Critical interaction: User changes date range**

```
User picks dates in DateRangePicker
  → DateRangePicker.onChange(start, end)
    → StatsBar calls ordersStore.setDateRange(start, end)
      → ordersStore.set({ dateStart: start, dateEnd: end })
      → ordersStore.fetchOrders() (re-filters allOrders in-memory)
        → StatsBar re-renders (allOrders selector unchanged, but
          the date-filtered view updates OrdersView below)
```

Note: StatsBar stat counts are derived from `allOrders` (unfiltered) — the date range affects the table view only, NOT the stat counts. If DJ wants date-filtered stats, StatsBar would also filter allOrders by dateStart/dateEnd before computing counts.

### F. SCSS Strategy

```scss
// StatsBar.module.scss
.statsBar {
  display: flex;
  align-items: center;
  gap: var(--space-md);          // from tokens
  padding: var(--space-sm) var(--space-lg);
  background: var(--surface-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
```

Tokens used: `--space-sm`, `--space-md`, `--space-lg`, `--surface-secondary`, `--border-subtle`.
StatCard and ProgressBar use `--color-success`, `--color-warn`, `--color-accent` from shared token file.

---

## Section 3: Sidebar

### A. Component Tree

```
Sidebar (src/components/Sidebar/Sidebar.tsx) — REVISION of existing
  Props: {} (no props)
  Store reads:
    { currentStatus: OrderStatus, activeClient: string | null,
      allOrders: Order[], setNavFilter, setSearchQuery } from ordersStore
    { stores: StoreDTO[] } from storesStore (→ clientsStore after Sprint 3)
    { sync: SyncState } from ordersStore
    { currentView: ViewType, setView, sidebarOpen, setSidebarOpen } from uiStore
  Actions dispatched:
    ordersStore.setNavFilter(status, clientId | null)
    ordersStore.setSearchQuery(query)
    uiStore.setView(view)
    uiStore.setSidebarOpen(open)
  Local state:
    expandedSections: Set<OrderStatus> — which nav tree sections are collapsed/expanded
    searchValue: string — controlled input value (debounced before dispatching)
  Sub-components: [SidebarLogo, SidebarSearch, NavTree, NavSection, NavClientItem, SidebarTools, SidebarFooter, SyncIndicator]
  Own SCSS: yes (Sidebar.module.scss)
```

```
SidebarLogo (src/components/Sidebar/SidebarLogo.tsx)
  Props: {}
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no (uses parent Sidebar.module.scss classes)
```

```
SidebarSearch (src/components/Sidebar/SidebarSearch.tsx)
  Props: {
    value: string;
    onChange: (value: string) => void;
    onClear: () => void;
  }
  Store reads: none (controlled component)
  Actions dispatched: none (parent dispatches ordersStore.setSearchQuery)
  Local state: none
  Sub-components: []
  Own SCSS: no (uses parent Sidebar.module.scss classes)
```

```
NavTree (src/components/Sidebar/NavTree.tsx)
  Props: {
    countsByStatus: Record<OrderStatus, { total: number; byClient: Record<string, number> }>;
    currentStatus: OrderStatus;
    activeClient: string | null;
    expandedSections: Set<OrderStatus>;
    onToggleSection: (status: OrderStatus) => void;
    onNavigate: (status: OrderStatus, clientId: string | null) => void;
    clients: Array<{ clientId: string; name: string }>;
  }
  Store reads: none (data passed via props from Sidebar)
  Actions dispatched: none (delegates to Sidebar via onNavigate/onToggleSection)
  Local state: none
  Sub-components: [NavSection]
  Own SCSS: no (uses Sidebar.module.scss)
```

```
NavSection (src/components/Sidebar/NavSection.tsx)
  Props: {
    status: OrderStatus;
    label: string;
    total: number | null;
    isExpanded: boolean;
    isActive: boolean;
    clientCounts: Record<string, number>;
    activeClient: string | null;
    clients: Array<{ clientId: string; name: string }>;
    onToggle: () => void;
    onSelectParent: () => void;
    onSelectClient: (clientId: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [NavClientItem]
  Own SCSS: no
```

```
NavClientItem (src/components/Sidebar/NavClientItem.tsx)
  Props: {
    clientId: string;
    clientName: string;
    count: number;
    isSelected: boolean;
    onClick: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [ClientBadge (shared)]
  Own SCSS: no
```

```
SidebarTools (src/components/Sidebar/SidebarTools.tsx)
  Props: {
    onNavigate: (view: ViewType) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
SidebarFooter (src/components/Sidebar/SidebarFooter.tsx)
  Props: {
    syncing: boolean;
    lastSyncTime: Date | null;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [SyncIndicator (shared)]
  Own SCSS: no
```

```
SyncIndicator (src/components/shared/SyncIndicator.tsx)
  Props: {
    syncing: boolean;
    lastSyncTime: Date | null;
    onManualSync?: () => void;
  }
  Store reads: none (pure display)
  Actions dispatched: none (parent wires onManualSync)
  Local state: none
  Sub-components: []
  Own SCSS: yes (SyncIndicator.module.scss)
```

### B. Shared Components

| Component | Usage in Sidebar |
|-----------|-----------------|
| `ClientBadge` | Inline badge in NavClientItem (optional — could be text-only with color dot) |
| `SyncIndicator` | Footer sync status display |
| `CountBadge` | Status total badge + per-client count |

### C. Store Changes Required

**ordersStore — no new fields.** Existing `allOrders`, `currentStatus`, `activeClient`, `setNavFilter`, `setSearchQuery`, `sync` are sufficient.

**storesStore → clientsStore (Sprint 3 rename):**
- Rename `storesStore.ts` → `clientsStore.ts`
- Rename hook `useStoresStore` → `useClientsStore`
- Store shape stays the same: `{ stores/clients: Client[], loading, error, loadClients() }`

**uiStore — no new fields.** Existing `currentView`, `setView`, `sidebarOpen`, `setSidebarOpen` are sufficient.

### D. DRY Violations

| Violation | Fix in Sidebar |
|-----------|---------------|
| **V1.7** — 2 markup store files | Sidebar doesn't use markups, but currently imports `storesStore` (orphan). After Sprint 3: import `clientsStore` instead. |
| **V1.9** — orphan `storesStore` | Sidebar currently `import { useStoresStore }`. Replace with `import { useClientsStore } from '../stores/clientsStore'` |
| **V1.14** — `StoreDTO` vs `ClientDto` | Sidebar uses `stores.map(s => ...)` where `s` is `StoreDTO`. After Sprint 1: use `Client` from `types/clients.ts`. |

### E. Data Flow

**Critical interaction: User clicks a client under "Awaiting Shipment"**

```
User clicks NavClientItem("KF Goods" under Awaiting Shipment)
  → NavClientItem.onClick()
    → NavSection.onSelectClient("42")
      → NavTree.onNavigate('awaiting_shipment', '42')
        → Sidebar calls ordersStore.setNavFilter('awaiting_shipment', '42')
          → ordersStore.set({
              currentStatus: 'awaiting_shipment',
              activeClient: '42',
              page: 1,
              selectedOrderIds: new Set()
            })
          → ordersStore.fetchOrders()
            → in-memory filter: allOrders.filter(
                o => o.status === 'awaiting_shipment' && o.clientId === '42'
              )
            → set({ orders: [...filtered DTOs...], total, pages })
          → Sidebar re-renders: activeClient === '42' highlights NavClientItem
          → OrdersView re-renders: orders now filtered to KF Goods awaiting
```

**Critical interaction: User types in search bar**

```
User types "ORD-100" in SidebarSearch
  → SidebarSearch.onChange("ORD-100") — controlled input
    → Sidebar sets local searchValue = "ORD-100"
    → setTimeout(300ms) debounce fires
      → ordersStore.setSearchQuery("ORD-100")
        → ordersStore.set({ searchQuery: "ORD-100" })
        → NOTE: fetchOrders() does NOT currently filter by searchQuery.
          Need to add search filtering to fetchOrders() in-memory filter.
```

**Store gap identified:** `ordersStore.fetchOrders()` currently filters by `currentStatus` and `activeClient` but does NOT apply `searchQuery`. The in-memory filter needs enhancement:

```typescript
// Inside fetchOrders():
const filtered = allOrders.filter((o) =>
  o.status === currentStatus
  && (activeClient == null || o.clientId === activeClient)
  && (searchQuery === '' || matchesSearch(o, searchQuery))
);

// matchesSearch: checks orderNum, customer, skus[], shipTo fields
function matchesSearch(order: Order, query: string): boolean {
  const q = query.toLowerCase();
  return (
    order.orderNum.toLowerCase().includes(q) ||
    order.customer.toLowerCase().includes(q) ||
    order.skus.some(s => s.toLowerCase().includes(q)) ||
    order.shipTo.postalCode.includes(q) ||
    order.shipTo.city.toLowerCase().includes(q)
  );
}
```

### F. SCSS Strategy

Existing `Sidebar.module.scss` is retained. Key additions:

```scss
// Sidebar.module.scss additions
.active { background: var(--surface-active); color: var(--text-on-active); }
.selected { background: var(--surface-selected); } // child client row
.syncSpinner { animation: spin 1s linear infinite; }
.badge { /* uses CountBadge shared component — no custom SCSS */ }
```

Tokens: `--surface-active`, `--surface-selected`, `--text-on-active`, `--sidebar-width` (280px default).

---

## Section 4: Right Panel

### A. Component Tree

```
RightPanel (src/components/RightPanel/RightPanel.tsx) — REVISION of existing
  Props: {} (no props)
  Store reads:
    { orders: OrderDTO[], selectedOrderIds: Set<number> } from ordersStore
  Actions dispatched:
    ordersStore.toggleOrderSelection(orderId)
    ordersStore.clearSelection()
  Local state: none
  Sub-components: [EmptyPanel, SingleOrderPanel, BatchPanel]
  Own SCSS: yes (RightPanel.module.scss)
```

#### State 1: Empty (0 selected)

```
EmptyPanel (src/components/RightPanel/EmptyPanel.tsx)
  Props: {}
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [EmptyState (shared)]
  Own SCSS: no (uses RightPanel.module.scss)
```

#### State 2: Single (1 selected)

```
SingleOrderPanel (src/components/RightPanel/SingleOrderPanel.tsx) — DEEP REVISION
  Props: {
    order: OrderDTO;
  }
  Store reads:
    { ratesMap, selectedRates, loading } from ratesStore (via selectors)
    { markups: MarkupsMap } from markupStore
    { settings: BillingSettings } from billingStore
  Actions dispatched:
    ratesStore.fetchRates(orderId, params)
    ratesStore.selectRate(orderId, rate)
    ordersStore.markOrderAsShipped(orderId, ...)
    ordersStore.addLabel(orderId, label)
    printQueueStore.enqueue(item)
  Local state:
    testMode: boolean — "Test mode (no charges)" toggle
    weightLb: string — controlled input for pounds
    weightOz: string — controlled input for ounces
    dimensions: { l: string; w: string; h: string } — controlled dimension inputs
    selectedService: string | null — dropdown selection
    selectedPackage: string | null — dropdown selection
    showRates: boolean — whether rate browser is expanded
  Sub-components: [
    SingleOrderHeader,
    ShipFromField,
    ServiceDropdown,
    WeightInput,
    DimensionsInput,
    PackageDropdown,
    RateDisplay,
    RateList,
    ShipActionButtons,
    TestModeToggle (shared)
  ]
  Own SCSS: yes (SingleOrderPanel.module.scss)
```

```
SingleOrderHeader (src/components/RightPanel/SingleOrderHeader.tsx)
  Props: {
    orderNumber: string;
    onBatch: () => void;
    onPrint: () => void;
    onOpenSS: () => void;
    onMarkShipped: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [ActionDropdown (shared)]
  Own SCSS: no
```

```
ShipFromField (src/components/RightPanel/fields/ShipFromField.tsx)
  Props: {
    shipFrom: OrderShipFrom;
    onPin?: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
ServiceDropdown (src/components/RightPanel/fields/ServiceDropdown.tsx)
  Props: {
    value: string | null;
    onChange: (serviceCode: string) => void;
    options: Array<{ code: string; label: string }>;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    isOpen: boolean
  Sub-components: []
  Own SCSS: yes (ServiceDropdown.module.scss)
```

```
WeightInput (src/components/RightPanel/fields/WeightInput.tsx)
  Props: {
    weightLb: string;
    weightOz: string;
    onChangeLb: (v: string) => void;
    onChangeOz: (v: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
DimensionsInput (src/components/RightPanel/fields/DimensionsInput.tsx)
  Props: {
    length: string;
    width: string;
    height: string;
    onChangeLength: (v: string) => void;
    onChangeWidth: (v: string) => void;
    onChangeHeight: (v: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
PackageDropdown (src/components/RightPanel/fields/PackageDropdown.tsx)
  Props: {
    value: string | null;
    onChange: (pkg: string) => void;
    options: Array<{ code: string; label: string; dims?: { l: number; w: number; h: number } }>;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    isOpen: boolean
  Sub-components: []
  Own SCSS: yes (PackageDropdown.module.scss)
```

```
RateDisplay (src/components/RightPanel/RateDisplay.tsx)
  Props: {
    rate: Rate;
    markupsMap: MarkupsMap;
    isOrion: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [CurrencyDisplay (shared)]
  Own SCSS: yes (RateDisplay.module.scss)
```

```
RateList (src/components/RightPanel/RateList.tsx)
  Props: {
    rates: Rate[];
    markupsMap: MarkupsMap;
    selectedRate: Rate | undefined;
    onSelect: (rate: Rate) => void;
    loading: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [RateDisplay]
  Own SCSS: yes (RateList.module.scss)
```

```
ShipActionButtons (src/components/RightPanel/ShipActionButtons.tsx)
  Props: {
    onCreateAndPrint: () => void;
    onSendToQueue: () => void;
    testMode: boolean;
    disabled: boolean;
    loading: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

#### State 3: Batch (2+ selected)

```
BatchPanel (src/components/RightPanel/BatchPanel.tsx) — DEEP REVISION
  Props: {
    orders: OrderDTO[];
    onRemove: (orderId: number) => void;
    onClearAll: () => void;
  }
  Store reads:
    { markups: MarkupsMap } from markupStore
  Actions dispatched:
    printQueueStore.enqueue(item) (per order in batch)
    ordersStore.clearSelection()
  Local state:
    testMode: boolean — "Test mode (no charges)" toggle
  Sub-components: [
    BatchHeader,
    BatchWarning,
    DestinationChips,
    BatchOrderList,
    BatchOrderRow,
    BatchActionButtons,
    TestModeToggle (shared)
  ]
  Own SCSS: yes (BatchPanel.module.scss)
```

```
BatchHeader (src/components/RightPanel/batch/BatchHeader.tsx)
  Props: {
    orderCount: number;
    totalUnits: number;
    estimatedCost: number;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [CurrencyDisplay (shared)]
  Own SCSS: no
```

```
BatchWarning (src/components/RightPanel/batch/BatchWarning.tsx)
  Props: {
    hasMultiSku: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
DestinationChips (src/components/RightPanel/batch/DestinationChips.tsx)
  Props: {
    destinations: Array<{ state: string; count: number }>;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: yes (DestinationChips.module.scss)
```

```
BatchOrderList (src/components/RightPanel/batch/BatchOrderList.tsx)
  Props: {
    orders: OrderDTO[];
    onRemove: (orderId: number) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [BatchOrderRow]
  Own SCSS: no
```

```
BatchOrderRow (src/components/RightPanel/batch/BatchOrderRow.tsx)
  Props: {
    orderNumber: string;
    zip: string;
    orderId: number;
    onRemove: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
BatchActionButtons (src/components/RightPanel/batch/BatchActionButtons.tsx)
  Props: {
    onPrintLabels: () => void;
    onSendToQueue: () => void;
    testMode: boolean;
    disabled: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

### B. Shared Components

| Component | Usage in Right Panel |
|-----------|---------------------|
| `EmptyState` | EmptyPanel (clipboard icon + "No orders selected") |
| `ActionDropdown` | SingleOrderHeader (Batch ▼, Print ▼) |
| `TestModeToggle` | SingleOrderPanel, BatchPanel |
| `CurrencyDisplay` | RateDisplay, BatchHeader |
| `ProgressBar` | Potential use in batch progress |

### C. Store Changes Required

**ratesStore (new — from ARCHITECTURE.md Sprint 3):**

```typescript
interface RatesState {
  ratesMap: Map<string, { rates: Rate[]; fetchedAt: Date; fromServerCache: boolean }>;
  loading: Set<string>;          // cacheKeys
  error: Map<string, string>;
  selectedRates: Map<string, Rate>;  // orderId → selected Rate

  fetchRates: (orderId: string, params: RateFetchParams) => Promise<Rate[]>;
  selectRate: (orderId: string, rate: Rate) => void;
  clearRatesForOrder: (orderId: string) => void;
  clearAll: () => void;
}
```

**printQueueStore (new — from ARCHITECTURE.md):**

Already defined in ARCHITECTURE.md. No changes beyond what's specified.

**ordersStore — no new fields.** SingleOrderPanel reads `orders` + `selectedOrderIds` (existing). Calls existing `markOrderAsShipped`, `addLabel`, `toggleOrderSelection`, `clearSelection`.

**markupStore — no new fields.** SingleOrderPanel reads `markups: MarkupsMap` (existing).

### D. DRY Violations

| Violation | Fix in Right Panel |
|-----------|-------------------|
| **V1.5** — 3 markup systems | SingleOrderPanel uses `MarkupService.applyCarrierMarkup(rate, markupsMap)` from `services/MarkupService.ts` (Sprint 3 target), NOT `utils/markupService.ts` or `utils/markups.ts`. |
| **V1.6** — 3 rate fetching layers | SingleOrderPanel uses `ratesStore.fetchRates()` which calls `api/rates.fetch()`. No direct ShipStation calls, no `rateFetchCache`. |
| **V1.9** — orphan `orderDetailStore` | RightPanel currently imports nothing from `orderDetailStore`. SingleOrderPanel receives `order` as prop from RightPanel (which filters from ordersStore). Keep this pattern. |
| **V1.9** — orphan `labelStore` | SingleOrderPanel calls `ordersStore.addLabel()` + `printQueueStore.enqueue()` directly. No `labelStore`. |

### E. Data Flow

**Critical interaction: User selects rate and clicks "Create + Print Label"**

```
User clicks a rate in RateList
  → RateList.onSelect(rate)
    → SingleOrderPanel calls ratesStore.selectRate(orderId, rate)
      → ratesStore.set: selectedRates.set(orderId, rate)
      → RateDisplay re-renders with selected rate

User clicks "🖨 Create + Print Label"
  → ShipActionButtons.onCreateAndPrint()
    → SingleOrderPanel handler:
      1. const rate = ratesStore.getState().selectedRates.get(orderId)
      2. const request = LabelService.buildCreateRequest(order, rate, shipFrom, testMode)
      3. const validation = LabelService.validateCreateRequest(order, rate)
         → if validation !== null → show error toast, return
      4. const response = await api.labels.create(request)
      5. const label = LabelService.normalizeResponse(response)
      6. ordersStore.addLabel(orderId, label)
         → order.status → 'shipped', label attached
      7. printQueueStore.enqueue({ orderId, orderNumber, labelUrl, trackingNumber })
         → queue updated
      8. billingStore.calculateBilling({ orderId, shippingCost: label.shipmentCost, ... })
         → billing auto-created (Q7)
```

**Critical interaction: User removes order from batch**

```
User clicks "—" on BatchOrderRow
  → BatchOrderRow.onRemove()
    → BatchPanel.onRemove(orderId)
      → RightPanel calls ordersStore.toggleOrderSelection(orderId)
        → selectedOrderIds removes orderId
        → RightPanel re-renders:
          if selectedOrderIds.size === 1 → shows SingleOrderPanel
          if selectedOrderIds.size === 0 → shows EmptyPanel
```

### F. SCSS Strategy

```scss
// RightPanel.module.scss
.rightPanel {
  width: var(--panel-width);            // 380px default
  border-left: 1px solid var(--border-subtle);
  background: var(--surface-primary);
  overflow-y: auto;
  flex-shrink: 0;
}
```

Sub-component SCSS files:
- `SingleOrderPanel.module.scss` — field layout (grid), section dividers
- `BatchPanel.module.scss` — batch header, order list
- `RateList.module.scss` — rate row hover, selected state
- `RateDisplay.module.scss` — price formatting, ORION dual-line display
- `DestinationChips.module.scss` — chip pills
- `ServiceDropdown.module.scss`, `PackageDropdown.module.scss` — dropdown positioning

Tokens: `--panel-width`, `--field-gap`, `--rate-row-hover`, `--rate-row-selected`.

---

## Section 5: Header/Toolbar

### A. Component Tree

```
ControlBar (src/components/ControlBar/ControlBar.tsx) — REVISION of existing
  Props: {} (no props)
  Store reads:
    { currentStatus: OrderStatus, selectedOrderIds: Set<number>,
      total: number, dateStart, dateEnd, sync: SyncState } from ordersStore
  Actions dispatched:
    ordersStore.clearSelection()
    ordersStore.setDateRange(start, end)
  Local state:
    zoomLevel: '100%' | '115%' | '125%' — UI-only zoom toggle
  Sub-components: [
    ControlBarTitle,
    ControlBarDateRange,
    ControlBarSync,
    ControlBarToolsEmpty,
    ControlBarToolsSelected,
    ZoomSelector
  ]
  Own SCSS: yes (ControlBar.module.scss)
```

```
ControlBarTitle (src/components/ControlBar/ControlBarTitle.tsx)
  Props: {
    statusLabel: string;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
ControlBarDateRange (src/components/ControlBar/ControlBarDateRange.tsx)
  Props: {
    dateStart: string | null;
    dateEnd: string | null;
    displayLabel: string;    // "Today" or formatted range
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: no
```

```
ControlBarSync (src/components/ControlBar/ControlBarSync.tsx)
  Props: {
    syncing: boolean;
    lastSyncTime: Date | null;
    onManualSync: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [SyncIndicator (shared)]
  Own SCSS: no
```

```
ControlBarToolsEmpty (src/components/ControlBar/ControlBarToolsEmpty.tsx)
  Props: {
    onExportCSV: () => void;
    onToggleColumns: () => void;
    onLabels: () => void;
    onPrintQueue: () => void;
    onPicklist: () => void;
    zoomLevel: string;
    onZoomChange: (level: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [ZoomSelector]
  Own SCSS: no
```

```
ControlBarToolsSelected (src/components/ControlBar/ControlBarToolsSelected.tsx)
  Props: {
    selectedCount: number;
    onBatch: () => void;
    onPrint: () => void;
    onClear: () => void;
    onExportCSV: () => void;
    onToggleColumns: () => void;
    onLabels: () => void;
    onPrintQueue: () => void;
    onPicklist: () => void;
    zoomLevel: string;
    onZoomChange: (level: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: [CountBadge (shared), ActionDropdown (shared), ZoomSelector]
  Own SCSS: no
```

```
ZoomSelector (src/components/ControlBar/ZoomSelector.tsx)
  Props: {
    value: '100%' | '115%' | '125%';
    onChange: (level: '100%' | '115%' | '125%') => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: yes (ZoomSelector.module.scss)
```

### B. Shared Components

| Component | Usage in ControlBar |
|-----------|---------------------|
| `SyncIndicator` | ControlBarSync (same component as Sidebar footer) |
| `CountBadge` | "N orders selected" badge |
| `ActionDropdown` | Batch ▼, Print ▼ dropdowns |
| `DateRangePicker` | Could share with StatsBar, but ControlBar uses a display-only version |

### C. Store Changes Required

**No new store fields.** All data exists in `ordersStore`:
- `currentStatus` → title derivation
- `dateStart`, `dateEnd` → date range display
- `sync.syncing`, `sync.lastSyncTime` → sync indicator
- `selectedOrderIds.size` → 0-vs-selected toolbar mode

**uiStore addition for zoom:**

```typescript
// Add to UIState:
zoomLevel: '100%' | '115%' | '125%';
setZoomLevel: (level: '100%' | '115%' | '125%') => void;
```

Alternatively, `zoomLevel` could remain local state in ControlBar since it's purely a UI concern (affects CSS `font-size` on the table wrapper). **Decision: keep as local state** — it doesn't need to survive navigation.

### D. DRY Violations

| Violation | Fix in ControlBar |
|-----------|------------------|
| **V1.15** — API base URL in 3 places | Export CSV downloads via `api/client.ts` base URL. Not a direct fix here, but ControlBar's `onExportCSV` should construct the URL using `API_BASE` from `api/client.ts`. |

The existing `OrdersView.tsx` has a toolbar section inline. **Extract it** — the toolbar logic currently lives in `OrdersView.tsx` (status tabs, selection badge, pagination). This should be split:
- Status tabs remain in `OrdersView.tsx` (they're table-specific)
- Top-level toolbar becomes `ControlBar` (page-level)

### E. Data Flow

**Critical interaction: User clicks manual sync**

```
User clicks sync button in ControlBarSync
  → ControlBarSync.onManualSync()
    → ControlBar calls useSync().trigger()
      → ordersStore.startSync()
        → sync.syncing = true → ControlBarSync re-renders (spinner)
      → api.sync.run(lastSyncTime, storeId)
        → POST /api/sync → ShipStation fetch
      → ordersStore.syncComplete(syncedAt, allOrders)
        → sync.syncing = false, sync.lastSyncTime = syncedAt
        → ControlBarSync re-renders ("Last synced 0m ago")
        → ordersStore.fetchOrders() → table updates
```

**Critical interaction: User clears selection**

```
User clicks "✕ Clear" in ControlBarToolsSelected
  → ControlBarToolsSelected.onClear()
    → ControlBar calls ordersStore.clearSelection()
      → selectedOrderIds = new Set()
      → ControlBar re-renders: selectedOrderIds.size === 0
        → shows ControlBarToolsEmpty instead of ControlBarToolsSelected
      → RightPanel re-renders: shows EmptyPanel
```

### F. SCSS Strategy

```scss
// ControlBar.module.scss
.controlBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-lg);
  background: var(--surface-primary);
  border-bottom: 1px solid var(--border-subtle);
  min-height: 48px;
}

.toolbarBtn {
  /* shared button style — consider extracting to tokens */
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  cursor: pointer;
  &:hover { background: var(--surface-hover); }
}
```

Tokens: `--toolbar-height` (48px), `--toolbar-btn-gap`, `--surface-hover`.

---

## Section 6: Settings Page

### A. Component Tree

```
SettingsPage (src/pages/SettingsPage.tsx)
  Props: {} (route-level page)
  Store reads:
    { settings, settingsLoaded, settingsError, updateSettings } from billingStore
  Actions dispatched:
    billingStore.updateSettings(partial)
    billingStore.loadSettingsFromApi()
  Local state: none (settings are store-managed)
  Sub-components: [SettingsLayout, BillingConfigSection, ClientMarkupSection, SyncFrequencySection, ShipFromSection]
  Own SCSS: yes (SettingsPage.module.scss)
```

```
SettingsLayout (src/layouts/SettingsLayout.tsx)
  Props: {
    children: React.ReactNode;
    title: string;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none
  Sub-components: []
  Own SCSS: yes (SettingsLayout.module.scss)
```

```
BillingConfigSection (src/components/Settings/BillingConfigSection.tsx)
  Props: {
    prepCost: number;
    packageCostPerOz: number;
    autoVoidAfterDays: number | null;
    onSave: (partial: Partial<BillingSettings>) => Promise<void>;
    saving: boolean;
  }
  Store reads: none (receives data via props from SettingsPage)
  Actions dispatched: none (parent calls billingStore.updateSettings)
  Local state:
    editPrepCost: string — controlled input
    editPackageCostPerOz: string — controlled input
    editAutoVoidDays: string — controlled input
    dirty: boolean — tracks unsaved changes
  Sub-components: [ConfirmDialog (shared)]
  Own SCSS: yes (BillingConfigSection.module.scss)
```

```
ClientMarkupSection (src/components/Settings/ClientMarkupSection.tsx)
  Props: {
    markups: MarkupsMap;
    clients: Client[];
    onSave: (markups: MarkupsMap) => Promise<void>;
    saving: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    editMarkups: Record<string, { type: MarkupType; value: string }> — editing buffer
    dirty: boolean
  Sub-components: [ClientBadge (shared)]
  Own SCSS: yes (ClientMarkupSection.module.scss)
```

```
SyncFrequencySection (src/components/Settings/SyncFrequencySection.tsx)
  Props: {
    frequency: 5 | 10 | 30 | 60;
    onSave: (freq: 5 | 10 | 30 | 60) => Promise<void>;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    selectedFreq: 5 | 10 | 30 | 60
  Sub-components: []
  Own SCSS: yes (SyncFrequencySection.module.scss)
```

```
ShipFromSection (src/components/Settings/ShipFromSection.tsx)
  Props: {
    locations: ShipFromLocation[];
    onAdd: (loc: Omit<ShipFromLocation, 'id'>) => Promise<void>;
    onUpdate: (id: string, loc: Partial<ShipFromLocation>) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    editingId: string | null — which location is being edited
    newLocationForm: ShipFromFormState — form state for adding
    showDeleteConfirm: boolean
  Sub-components: [ShipFromRow, ShipFromForm, ConfirmDialog (shared)]
  Own SCSS: yes (ShipFromSection.module.scss)
```

```typescript
// src/types/settings.ts (new file)

export interface ShipFromLocation {
  id: string;
  name: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface ShipFromFormState {
  name: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}
```

### B. Shared Components

| Component | Usage in Settings |
|-----------|------------------|
| `ClientBadge` | Per-client markup rows |
| `ConfirmDialog` | Delete ship-from location, reset settings |

### C. Store Changes Required

**billingStore — no new fields for billing config.** Existing `settings`, `updateSettings`, `loadSettingsFromApi` cover the billing config section.

**markupStore — add save action:**

```typescript
// Add to markupStore:
saveMarkups: (markups: MarkupsMap) => Promise<void>;
// Calls api/settings.putMarkups(markups)
// Optimistic local update + persist
```

**New: settingsStore or shipFromStore** (for Ship From locations — NOT in billingStore):

```typescript
// src/stores/shipFromStore.ts (new)
interface ShipFromState {
  locations: ShipFromLocation[];
  loading: boolean;
  error: string | null;

  loadLocations: () => Promise<void>;
  addLocation: (loc: Omit<ShipFromLocation, 'id'>) => Promise<void>;
  updateLocation: (id: string, partial: Partial<ShipFromLocation>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
}
```

**clientsStore** — read-only in Settings. Used to display client names alongside markup config. Already exists via `storesStore` → `clientsStore` rename.

### D. DRY Violations

| Violation | Fix in Settings |
|-----------|----------------|
| **V1.5** — 3 markup systems | Settings page reads/writes markups via `markupStore` (canonical). The `MarkupsMap` type from `types/markups.ts` is the SSOT shape. No `MarkupRule[]`. |
| **V1.7** — 2 markup store files | Settings imports ONLY `markupStore` (not `markupsStore`). This is the canonical store after Sprint 3. |
| **V1.13** — Frontend vs backend billing settings | SettingsPage loads from `billingStore.loadSettingsFromApi()` which calls `GET /api/settings/billing`. Settings are persisted to DB. Frontend and backend stay in sync via API — no local-only settings. |

### E. Data Flow

**Critical interaction: User updates prep cost**

```
User changes prepCost input to "1.50" in BillingConfigSection
  → BillingConfigSection local state: editPrepCost = "1.50", dirty = true

User clicks "Save"
  → BillingConfigSection.onSave({ prepCost: 1.50 })
    → SettingsPage calls billingStore.updateSettings({ prepCost: 1.50 })
      → billingStore.set: settings.prepCost = 1.50 (optimistic)
      → PUT /api/settings/billing { prepCost: 1.50 }
        → Success: settingsError = null
        → Failure: settingsError = message, throw → SettingsPage shows error toast
    → BillingConfigSection: dirty = false (on success)
```

**Critical interaction: User adds ship-from location**

```
User fills ShipFromForm and clicks "Add"
  → ShipFromSection.onAdd({ name: "Gardena Warehouse", street1: "...", ... })
    → SettingsPage calls shipFromStore.addLocation(loc)
      → POST /api/settings/locations → { id: "loc_123", ...loc }
      → shipFromStore.set: locations = [...locations, newLoc]
      → ShipFromSection re-renders with new row
```

### F. SCSS Strategy

```scss
// SettingsPage.module.scss
.settingsPage {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-xl);
}

.section {
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
}

.sectionTitle {
  font-size: var(--text-lg);
  font-weight: 600;
  margin-bottom: var(--space-md);
}
```

Individual section components have their own `.module.scss` for form-specific layouts (label/input pairs, action buttons).

Tokens: `--input-height`, `--input-border`, `--input-focus-ring`, `--btn-primary`, `--btn-danger`.

---

## Section 7: Billing Section

### A. Component Tree

```
BillingPage (src/pages/BillingPage.tsx)
  Props: {} (route-level page)
  Store reads:
    { billings } from billingStore (for records display)
    { allOrders } from ordersStore (for order number / client name cross-reference)
  Actions dispatched:
    billingStore.voidBilling(orderId)
    billingStore.recalculateBilling(input)
  Local state: none
  Sub-components: [BillingFilters, BillingTable, BillingBulkActions]
  Own SCSS: yes (BillingPage.module.scss)
```

```
BillingFilters (src/components/Billing/BillingFilters.tsx)
  Props: {
    clients: Client[];
    selectedClientId: string | null;
    dateStart: string | null;
    dateEnd: string | null;
    showVoided: boolean;
    onClientChange: (clientId: string | null) => void;
    onDateChange: (start: string | null, end: string | null) => void;
    onVoidedChange: (show: boolean) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state: none (fully controlled by BillingPage)
  Sub-components: [DateRangePicker (shared), ClientBadge (shared)]
  Own SCSS: yes (BillingFilters.module.scss)
```

```
BillingTable (src/components/Billing/BillingTable.tsx)
  Props: {
    records: BillingTableRow[];
    onVoid: (orderId: string) => void;
    onRecalculate: (orderId: string) => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    sortField: string
    sortDir: 'asc' | 'desc'
  Sub-components: [BillingTableRow, StatusBadge (shared), CurrencyDisplay (shared), ConfirmDialog (shared)]
  Own SCSS: yes (BillingTable.module.scss)
```

```typescript
// Derived type for table display (NOT a store type — computed in BillingPage)
interface BillingTableRow {
  orderId: string;
  orderNumber: string;
  clientName: string;
  clientId: string;
  shippingCost: number;
  markupAmount: number;      // derived: totalCost - subtotal
  prepCost: number;
  packageCost: number;
  totalCost: number;
  voided: boolean;
  voidedAt?: Date;
  calculatedAt: Date;
}
```

```
BillingTableRow (src/components/Billing/BillingTableRow.tsx)
  Props: {
    row: BillingTableRow;
    onVoid: () => void;
    onRecalculate: () => void;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    showVoidConfirm: boolean
  Sub-components: [StatusBadge (shared), CurrencyDisplay (shared), ConfirmDialog (shared)]
  Own SCSS: no (uses BillingTable.module.scss row styles)
```

```
BillingBulkActions (src/components/Billing/BillingBulkActions.tsx)
  Props: {
    onBulkRecalculate: () => void;
    recordCount: number;
    loading: boolean;
  }
  Store reads: none
  Actions dispatched: none
  Local state:
    showConfirm: boolean
  Sub-components: [ConfirmDialog (shared)]
  Own SCSS: no
```

### B. Shared Components

| Component | Usage in Billing |
|-----------|-----------------|
| `DateRangePicker` | BillingFilters date filter |
| `ClientBadge` | Client column display + filter dropdown |
| `StatusBadge` | Voided / Active status per row |
| `CurrencyDisplay` | All cost columns |
| `ConfirmDialog` | Void confirmation, bulk recalculate confirmation |
| `StatCard` | Summary cards (total revenue, total voided, etc.) |
| `EmptyState` | "No billing records" placeholder |

### C. Store Changes Required

**billingStore — add list-oriented fields:**

```typescript
// Add to BillingState:
billingList: BillingCalculation[];        // full list for billing page
billingListLoading: boolean;
billingListError: string | null;
billingListTotal: number;
billingListPage: number;

// Add actions:
loadBillingList: (filter?: BillingListFilter) => Promise<void>;
bulkRecalculate: (filter?: BillingBulkFilter) => Promise<void>;
```

```typescript
// src/types/billing.ts additions:
export interface BillingListFilter {
  clientId?: string;
  dateStart?: string;
  dateEnd?: string;
  voided?: boolean;
  page?: number;
  pageSize?: number;
}

export interface BillingBulkFilter {
  clientId?: string;
  dateStart?: string;
  dateEnd?: string;
}

export type BillingStatus = 'active' | 'voided';
```

**ordersStore — no changes.** BillingPage reads `allOrders` for cross-reference (order number, client name lookup) but does not mutate.

**clientsStore — read only.** Needed for client name display in the filter dropdown and table rows.

### D. DRY Violations

| Violation | Fix in Billing |
|-----------|---------------|
| **V1.1** — 3 billing formula implementations | BillingPage uses ONLY `billingStore.billings` (calculated via `billingStore.calculateBilling` → `computeBilling` pure function). No `utils/billingService.ts`. No direct formula in components. |
| **V1.2** — 2 `roundToNearestCent()` copies | Billing math is encapsulated in `billingStore`'s `computeBilling()`. The only `roundToNearestCent` import is from `services/billingService.ts` → target: `services/BillingService.ts` (Sprint 4). Components never call it directly. |
| **V1.3** — 2 `BillingCalculation` types | BillingPage uses `BillingCalculation` from `types/orders.ts` ONLY. No import from `utils/billingService.ts`. |
| **V1.13** — Frontend vs backend billing settings | Billing records are loaded from backend via `billingStore.loadBillingList()` → `GET /api/billing`. Settings via `GET /api/settings/billing`. No frontend-only calculations for display. |

### E. Data Flow

**Critical interaction: User voids a billing record**

```
User clicks "Void" on BillingTableRow
  → BillingTableRow: showVoidConfirm = true (local state)

User confirms in ConfirmDialog
  → BillingTableRow.onVoid()
    → BillingTable.onVoid(orderId)
      → BillingPage calls billingStore.voidBilling(orderId)
        → billingStore.set: billings[orderId].voided = true, voidedAt = now
        → PUT /api/billing/:orderId/void (fire-and-forget)
        → BillingTable re-renders: row shows VoidedBadge
        → ordersStore.allOrders remains unchanged (billing on Order is separate)
```

**Critical interaction: User bulk recalculates**

```
User clicks "Bulk Recalculate" in BillingBulkActions
  → showConfirm = true

User confirms
  → BillingBulkActions.onBulkRecalculate()
    → BillingPage calls billingStore.bulkRecalculate(currentFilter)
      → POST /api/billing/recalculate-bulk { clientId?, dateStart?, dateEnd? }
        → Backend recalculates all matching records using current settings
        → Returns updated records
      → billingStore.set: merge updated records into billings map
      → billingStore.loadBillingList(currentFilter) (refresh list)
      → BillingTable re-renders with updated totals
```

**Critical interaction: User filters by client**

```
User selects "KF Goods" in BillingFilters client dropdown
  → BillingFilters.onClientChange("42")
    → BillingPage local state: selectedClientId = "42"
    → BillingPage calls billingStore.loadBillingList({ clientId: "42", ...otherFilters })
      → GET /api/billing?clientId=42&...
      → billingStore.set: billingList = response.records
      → BillingTable re-renders with filtered records
```

### F. SCSS Strategy

```scss
// BillingPage.module.scss
.billingPage {
  padding: var(--space-lg);
  max-width: 1200px;
}

.summaryRow {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}
```

```scss
// BillingTable.module.scss
.table {
  width: 100%;
  border-collapse: collapse;
}

.th {
  text-align: left;
  padding: var(--space-sm) var(--space-md);
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  border-bottom: 2px solid var(--border-default);
}

.td {
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--border-subtle);
}

.voidedRow {
  opacity: 0.6;
  text-decoration: line-through;
}
```

Tokens: `--text-secondary`, `--border-default`, table-specific tokens share with `OrdersView.module.scss`.

---

## Store Changes Summary

### Existing Stores — Modifications

| Store | New Fields | New Actions | New Selectors |
|-------|-----------|-------------|---------------|
| `ordersStore` | none | none | `matchesSearch(order, query)` helper in `fetchOrders` |
| `billingStore` | `billingList`, `billingListLoading`, `billingListError`, `billingListTotal`, `billingListPage` | `loadBillingList(filter?)`, `bulkRecalculate(filter?)` | none |
| `markupStore` | none | `saveMarkups(markups: MarkupsMap)` | none |
| `uiStore` | none | none | none |

### New Stores

| Store | File | Shape Summary |
|-------|------|---------------|
| `ratesStore` | `src/stores/ratesStore.ts` | `ratesMap`, `loading`, `error`, `selectedRates` + `fetchRates`, `selectRate`, `clearAll` |
| `clientsStore` | `src/stores/clientsStore.ts` | Renamed from `storesStore`. Same shape: `clients`, `loading`, `loadClients()` |
| `printQueueStore` | `src/stores/printQueueStore.ts` | `queue`, `printing` + `enqueue`, `dequeue`, `printAll` |
| `shipFromStore` | `src/stores/shipFromStore.ts` | `locations`, `loading` + CRUD actions |

### Stores to Delete (Sprint 3)

| Store | Absorbed Into |
|-------|--------------|
| `orderDetailStore` | `ordersStore.allOrders.find()` |
| `labelStore` | `ordersStore.addLabel()` + `printQueueStore` |
| `markupsStore` | `markupStore` (canonical) |
| `storesStore` | `clientsStore` (renamed) |

---

## SCSS Token Strategy

### Shared Token File: `src/styles/tokens.scss`

```scss
// ── Spacing ──
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}

// ── Colors ──
:root {
  --surface-primary: #ffffff;
  --surface-secondary: #f9fafb;
  --surface-hover: #f3f4f6;
  --surface-active: #e5e7eb;
  --surface-selected: #dbeafe;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-on-active: #1d4ed8;
  --border-subtle: #e5e7eb;
  --border-default: #d1d5db;
  --color-success: #059669;
  --color-warn: #d97706;
  --color-danger: #dc2626;
  --color-accent: #2563eb;
}

// ── Typography ──
:root {
  --text-xs: 11px;
  --text-sm: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
}

// ── Layout ──
:root {
  --sidebar-width: 280px;
  --panel-width: 380px;
  --toolbar-height: 48px;
  --stats-bar-height: 52px;
  --radius-sm: 4px;
  --radius-md: 8px;
}

// ── Form ──
:root {
  --input-height: 36px;
  --input-border: var(--border-default);
  --input-focus-ring: 0 0 0 2px rgba(37, 99, 235, 0.2);
  --field-gap: 12px;
}
```

### What Goes Where

| Scope | File | Contains |
|-------|------|----------|
| Global tokens | `src/styles/tokens.scss` | CSS custom properties (spacing, color, type, layout) |
| Component-specific | `Component.module.scss` | Layout, sizing, positioning specific to that component |
| Shared patterns | `src/styles/mixins.scss` | `@mixin truncate`, `@mixin badge-pill`, `@mixin table-row-hover` |

Rule: A component's `.module.scss` imports tokens via `@use '../styles/tokens'` only when needed (most tokens are CSS custom properties and don't need import). Mixins imported as `@use '../styles/mixins' as *`.

---

## DRY Violations Cross-Reference

Complete mapping of which sections address which violations from FINAL-REFACTOR-STRATEGY.md:

| Violation | Severity | Sections Involved | Resolution |
|-----------|----------|-------------------|------------|
| **V1.1** — 3 billing formulas | CRITICAL | §7 Billing | BillingPage reads from `billingStore` only. No `utils/billingService.ts` import. |
| **V1.2** — 2 `roundToNearestCent` | HIGH | §7 Billing | Only one `roundToNearestCent` in `services/billingService.ts` → `BillingService.ts`. Components never call it. |
| **V1.3** — 2 `BillingCalculation` types | CRITICAL | §7 Billing | All sections use `BillingCalculation` from `types/orders.ts`. |
| **V1.4** — 4 residential detection | HIGH | §4 Right Panel | `SingleOrderPanel` uses `ResidentialService.isResidential(order)` from `services/ResidentialService.ts`. |
| **V1.5** — 3 markup systems | CRITICAL | §4 Right Panel, §6 Settings | Both use `MarkupService` from `services/MarkupService.ts` with `MarkupsMap` from `types/markups.ts`. |
| **V1.6** — 3 rate fetching layers | HIGH | §4 Right Panel | `SingleOrderPanel` uses `ratesStore.fetchRates()` → `api/rates.fetch()`. One path. |
| **V1.7** — 2 markup stores | MEDIUM | §3 Sidebar, §6 Settings | Both import `markupStore` only. `markupsStore` deleted. |
| **V1.9** — 3 orphan stores | MEDIUM | §3 Sidebar, §4 Right Panel | `storesStore` → `clientsStore`. `orderDetailStore` → derived. `labelStore` → `printQueueStore`. |
| **V1.11** — cross-store coupling | MEDIUM | §4 Right Panel | Billing trigger moves from `ordersStore.markOrderAsShipped` → `useCreateLabel` hook (Sprint 3). |
| **V1.13** — FE vs BE billing settings | CRITICAL | §6 Settings, §7 Billing | Settings loaded from API. No local-only billing config. |
| **V1.14** — `StoreDTO` vs `ClientDto` | MEDIUM | §3 Sidebar, §6 Settings | Use `Client` from `types/clients.ts` everywhere. |
| **V1.15** — API base URL in 3 places | MEDIUM | §5 Header | CSV export uses `API_BASE` from `api/client.ts`. |

---

_End of architecture document. All sections (2–7) are fully specified. Ready for implementation sprint planning._
