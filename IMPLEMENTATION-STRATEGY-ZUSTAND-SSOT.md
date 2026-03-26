---
title: Implementation Strategy — Zustand + SSOT Architecture
created: 2026-03-26 11:08 EDT
audience: Albert (confirm/refine) + Kayla (execute)
purpose: Detailed implementation approach leveraging Zustand and Single Source of Truth
---

# Implementation Strategy — Zustand + SSOT

**Core Principles**:
1. **Single Source of Truth (SSOT)**: One canonical store per domain
2. **Zustand Stores**: Pure, minimal state management (no thunks, no side effects)
3. **Hardcoded Logic**: Business rules in services, not stores
4. **Loose Coupling**: Features don't depend on each other's internals
5. **Immutable Contracts**: Once locked, data extraction never changes

---

## Architecture Overview

```
UI Components (React)
    ↓ (dispatch actions via hooks)
Zustand Stores (SSOT per domain)
    ↓ (read state)
Services (Pure business logic)
    ↓ (call APIs)
ShipStation V1/V2 APIs
    ↓
Database
```

---

## Store Structure (SSOT Pattern)

### Store 1: OrdersStore (CRITICAL — Main SSOT)

**Responsibility**: All order data across app

**State**:
```typescript
interface OrdersStoreState {
  // Orders (all statuses)
  allOrders: Order[];
  
  // Current view filter
  currentStatus: 'awaiting_shipment' | 'shipped' | 'cancelled';
  
  // Pagination
  currentPage: number;
  ordersPerPage: 50 | 100 | 200;
  
  // Filters (cross-system, not affected by status)
  activeFilters: {
    search: string;           // Search all fields
    skuId: string | null;     // Selected SKU
    dateRange: DateFilter;    // Today, Last 7 days, etc.
  };
  
  // Selection state
  selectedOrderIds: Set<string>;      // Checkboxes checked
  singleSelectedOrderId: string | null; // Row click selected
  
  // Selection mode
  selectionMode: 'checkbox' | 'row-click' | null;
  
  // Column preferences
  visibleColumns: Set<string>;
  columnOrder: string[];
  
  // Sync state
  lastSyncTime: Date | null;
  isSyncing: boolean;
  
  // ShipStation data (immutable mapping)
  orderLabels: Record<OrderId, OrderLabel>; // Locked extraction format
}

interface Order {
  id: string;
  date: Date;
  clientId: string;
  orderNum: string;
  customer: string;
  itemname: string;
  sku: string;
  qty: number;
  weight: number;
  shipto: string;
  carrier: string;
  custcarrier: string;
  total: number;
  bestrate: number;
  margin: number;
  age: number; // days
  
  // ShipStation integration (from V1/V2)
  label?: OrderLabel; // Immutable mapping
  status: 'awaiting_shipment' | 'shipped' | 'cancelled';
  externallyShipped?: boolean;
  lastSyncedAt?: Date;
}

// IMMUTABLE CONTRACT (locked by DJ)
interface OrderLabel {
  // From V2 API response
  trackingNumber: string;
  shipment_cost: number;
  carrier_code: string;
  service_code: string;
  
  // From V1 API response
  shippingProviderId: number;
  carrierCode: string;
  
  // Derived
  selectedRate: number;
  createdAt: Date;
}
```

**Actions**:
```typescript
type OrdersStoreActions = {
  // Order management
  setOrders: (orders: Order[]) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  addLabel: (orderId: string, label: OrderLabel) => void; // IMMUTABLE
  
  // View/status
  setStatus: (status: 'awaiting_shipment' | 'shipped' | 'cancelled') => void;
  
  // Pagination
  setCurrentPage: (page: number) => void;
  setOrdersPerPage: (count: 50 | 100 | 200) => void;
  
  // Filters (CROSS-SYSTEM)
  setSearchFilter: (search: string) => void;
  setSkuFilter: (skuId: string | null) => void;
  setDateFilter: (filter: DateFilter) => void;
  
  // Selection (checkbox mode)
  toggleCheckbox: (orderId: string) => void;
  clearAllCheckboxes: () => void;
  
  // Selection (row click mode)
  selectRow: (orderId: string) => void;
  deselectRow: () => void;
  
  // Columns
  toggleColumnVisibility: (columnKey: string) => void;
  reorderColumns: (newOrder: string[]) => void;
  
  // Sync
  syncOrders: () => Promise<void>; // Calls syncService
  setLastSyncTime: (time: Date) => void;
  
  // Getters (compute filtered/paginated results)
  getFilteredOrders: () => Order[];
  getPaginatedOrders: () => Order[];
  getTotalOrderCount: () => number;
};
```

**Selectors (Derived)**:
```typescript
// These are computed on-demand, not stored
export const selectFilteredOrders = (state) => {
  // Apply all filters (search, sku, date)
  // Return filtered list (all, regardless of page)
}

export const selectPaginatedOrders = (state) => {
  // Get filtered, then paginate
  // Return current page only
}

export const selectPanelState = (state) => {
  const checkboxCount = state.selectedOrderIds.size;
  const rowSelected = state.singleSelectedOrderId;
  
  if (checkboxCount === 0 && !rowSelected) return 'empty';
  if (checkboxCount === 1) return 'shipping-panel';
  if (checkboxCount > 1) return 'batch-panel';
  if (rowSelected) return 'shipping-panel';
}

export const selectBannerState = (state) => {
  if (state.selectedOrderIds.size >= 2) {
    return { show: true, count: state.selectedOrderIds.size };
  }
  return { show: false };
}
```

---

### Store 2: RatesStore (Rate Caching SSOT)

**Responsibility**: Best rates for each order (from ShipStation V2)

**State**:
```typescript
interface RatesStoreState {
  // Cache: orderId → { bestRate, allRates }
  ratesCache: Record<OrderId, {
    bestRate: ShipStationRate;
    allRates: ShipStationRate[];
    fetchedAt: Date;
  }>;
}
```

**Actions**: Minimal
- `setCachedRates(orderId, rates)`
- `getCachedRate(orderId): ShipStationRate | null`
- `clearCache()`

**Notes**: 
- Rates fetched on-demand (when panel opens)
- Cached 30min TTL
- Markup applied in BillingStore, not here

---

### Store 3: MarkupStore (Admin Configuration SSOT)

**Responsibility**: Carrier markup rules (per-client)

**State**:
```typescript
interface MarkupStoreState {
  rules: MarkupRule[];
}

interface MarkupRule {
  clientId: string;
  carrier: 'USPS' | 'UPS' | 'FedEx';
  markupPercent: number; // 10, 15, 20
  updatedAt: Date;
}
```

**Actions**:
- `setRules(rules)`
- `getMarkupForCarrier(clientId, carrier): number`

**Notes**: 
- Hardcoded defaults: USPS 10%, UPS 15%, FedEx 20%
- Persisted to backend
- Used by BillingStore

---

### Store 4: BillingStore (Cost Calculation SSOT)

**Responsibility**: Billing calculations (immutable formula)

**State**:
```typescript
interface BillingStoreState {
  calculations: Record<OrderId, BillingCalculation>;
}

interface BillingCalculation {
  orderId: string;
  baseRate: number;
  residentialSurcharge: number;
  carrierMarkupPercent: number;
  subtotal: number;
  totalCost: number;
  breakdown: string; // Audit trail
  calculatedAt: Date;
}
```

**Actions**:
- `calculate(orderId, baseRate, residential, markupPercent): BillingCalculation`
- `getCalculation(orderId): BillingCalculation`

**Notes**:
- **IMMUTABLE FORMULA**: `(baseRate + residential) × (1 + markup%)`
- Banker's rounding (IEEE 754)
- Called whenever order rates/markup change

---

### Store 5: SelectionStore (UI State SSOT)

**Responsibility**: Selection mode + checkboxes (derived from OrdersStore, but cleaner)

Actually: **Keep in OrdersStore** (avoid duplication). SelectionStore would be redundant.

---

### Store 6: ColumnsStore (Column Preferences SSOT)

**Responsibility**: Visible columns + order + widths

**State**:
```typescript
interface ColumnsStoreState {
  visibleColumns: Set<string>;
  columnOrder: string[];
  columnWidths: Record<string, number>;
}
```

**Actions**:
- `toggleColumnVisibility(key)`
- `reorderColumns(newOrder)`
- `setColumnWidth(key, width)`

**Notes**:
- Persisted to localStorage + backend
- All 23 columns defined in constants

---

### Store 7: SyncStore (Sync State SSOT)

**Responsibility**: Last sync time + incremental fetch tracking

**State**:
```typescript
interface SyncStoreState {
  lastSyncTime: Date | null;
  isSyncing: boolean;
  lastSyncError: string | null;
}
```

**Actions**:
- `startSync()`
- `syncComplete(time)`
- `syncError(error)`

**Notes**:
- Minimal — mostly triggers OrdersStore.syncOrders()

---

## Service Layer (Business Logic)

### Service 1: RateService (ShipStation V2)

```typescript
export class RateService {
  // Hardcoded defaults
  private readonly CARRIER_DEFAULTS = {
    USPS: 10,
    UPS: 15,
    FedEx: 20
  };

  // Fetch from ShipStation V2 API
  async fetchRates(orderId, clientId, order): Promise<ShipStationRate[]> {
    // Call V2 /shipments/getrates
    // Return all 3 carrier options
  }

  // Select best (lowest cost)
  selectBestRate(rates): ShipStationRate {
    // Hardcoded: find minimum rate
  }
}
```

**Contract**: 
- Input: order data
- Output: ShipStationRate[] (all 3 carriers)
- Never changes (immutable after MVP)

---

### Service 2: BillingService (Calculation)

```typescript
export class BillingService {
  // IMMUTABLE FORMULA
  private readonly FORMULA = '(baseRate + residential) × (1 + markup%)';

  calculate(baseRate, residential, markupPercent): BillingCalculation {
    const subtotal = baseRate + residential;
    const markup = subtotal * (markupPercent / 100);
    const total = this.roundBankersRounding(subtotal + markup);
    
    return {
      baseRate,
      residential,
      markupPercent,
      subtotal,
      total,
      breakdown: `(${baseRate} + ${residential}) × ${1 + markupPercent/100} = ${total}`
    };
  }

  private roundBankersRounding(amount): number {
    // IEEE 754: round 0.5 to nearest even
  }
}
```

**Contract**:
- Input: (baseRate, residential, markupPercent)
- Output: BillingCalculation
- **NEVER CHANGES** (locked by DJ)

---

### Service 3: SyncService (Incremental)

```typescript
export class SyncService {
  async syncOrders(clientId, lastSyncTime): Promise<{newOrders, updated, external}> {
    // Fetch from ShipStation (date > lastSyncTime)
    const newOrders = await this.fetchNewOrders(clientId, lastSyncTime);
    
    // Check for externally shipped (has tracking in SS, not in our DB)
    const externallyShipped = await this.detectExternallyShipped(clientId);
    
    return {
      newOrders,
      externallyShipped,
      external: externallyShipped
    };
  }
}
```

**Contract**:
- Input: (clientId, lastSyncTime)
- Output: Delta (new orders, updated, external)
- Reduces API calls (incremental only)

---

### Service 4: LabelService (ShipStation V1 + V2)

```typescript
export class LabelService {
  // IMMUTABLE MAPPING (locked by DJ, Q1 pending)
  private readonly V1_V2_MAPPING = {
    V2: ['tracking_number', 'shipment_cost', 'carrier_code', 'service_code'],
    V1: ['shippingProviderId', 'carrierCode', 'advancedOptions']
  };

  async createLabel(orderId, order): Promise<OrderLabel> {
    // Call V2 POST /labels
    const v2Response = await this.shipstationV2.createLabel(order);
    
    // Call V1 GET /shipments/{id}
    const v1Response = await this.shipstationV1.getShipment(v2Response.shipmentId);
    
    // Extract via IMMUTABLE mapping
    return {
      trackingNumber: v2Response.tracking_number,
      shipment_cost: v2Response.shipment_cost,
      carrier_code: v2Response.carrier_code,
      service_code: v2Response.service_code,
      shippingProviderId: v1Response.advancedOptions.billToMyOtherAccount,
      carrierCode: v1Response.carrierCode,
      createdAt: new Date()
    };
  }

  // IMMUTABLE: Once set, never changes
  getOrderLabel(orderId): OrderLabel | null {
    return this.ordersStore.orderLabels[orderId];
  }
}
```

**Contract**:
- Input: order data
- Output: OrderLabel (immutable format, locked by DJ)
- Once locked, extraction never changes

---

## Component Architecture

### Main Page Component

```typescript
function AwaitingShipmentsPage() {
  // Read SSOT from OrdersStore
  const { 
    getPaginatedOrders,
    filters,
    currentPage,
    ordersPerPage,
    selectRow,
    toggleCheckbox,
    clearAllCheckboxes,
    selectedOrderIds,
    singleSelectedOrderId
  } = useOrdersStore();

  // Derived state (selectors)
  const panelState = useOrdersStore(selectPanelState);
  const bannerState = useOrdersStore(selectBannerState);
  const filteredCount = useOrdersStore(state => selectFilteredOrders(state).length);

  const orders = getPaginatedOrders();

  return (
    <Layout>
      {/* Top controls */}
      <ControlBar
        onSearch={(text) => setSearchFilter(text)}
        onSkuSelect={(sku) => setSkuFilter(sku)}
        onDateFilter={(range) => setDateFilter(range)}
        onExport={() => exportCurrentPage(orders)}
        onColumnsClick={() => showColumnsDropdown()}
        onZoom={(level) => setZoom(level)}
      />

      {/* Selection banner */}
      {bannerState.show && (
        <SelectionBanner
          count={bannerState.count}
          onClear={() => clearAllCheckboxes()}
        />
      )}

      {/* Table */}
      <OrdersTable
        orders={orders}
        onRowClick={(order) => selectRow(order.id)}
        onCheckboxToggle={(order) => toggleCheckbox(order.id)}
        selectedOrderIds={selectedOrderIds}
        singleSelectedOrderId={singleSelectedOrderId}
      />

      {/* Right panel */}
      <RightPanel state={panelState} />

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        ordersPerPage={ordersPerPage}
        total={filteredCount}
      />
    </Layout>
  );
}
```

---

## Data Flow Example: User Prints Label

1. **User clicks "Print Label"** in Shipping Panel
2. **Component calls** `labelStore.createLabel(orderId)`
3. **Service runs**:
   - Calls ShipStation V2 POST /labels
   - Calls ShipStation V1 GET /shipments/{id}
   - Extracts via IMMUTABLE mapping
   - Returns OrderLabel
4. **Store updates**:
   - `ordersStore.addLabel(orderId, label)` (immutable)
   - `ordersStore.updateOrder(orderId, { status: 'shipped' })`
5. **UI re-renders**:
   - Panel shows tracking number
   - Table row updates carrier + tracking
   - Shipped section can now see order

---

## SSOT Benefits

| Pain Point (V2) | SSOT Solution |
|-----------------|---------------|
| Too many dependencies | Single store per domain, services don't depend on stores |
| Breaking changes | Immutable contracts (V1/V2 mapping never changes) |
| Hard to find state | All state in one Zustand store per domain |
| Cascading updates | Derived selectors, no duplicate state |
| Complex logic | Services are pure, no side effects in stores |

---

## Implementation Order

1. **Phase 1 (Week 1)**: Stores + UI layout
   - OrdersStore, RatesStore, MarkupStore, BillingStore
   - UI: table, right panel, filters, pagination

2. **Phase 2 (Week 2)**: Services + APIs
   - RateService, BillingService, LabelService, SyncService
   - Connect to ShipStation V1/V2

3. **Phase 3 (Week 3)**: Features
   - Selection logic (checkboxes, row clicks)
   - Batch panel
   - SKU sort grouping
   - Print queue

4. **Phase 4 (Week 4)**: Testing + refinement
   - Integration tests
   - Edge cases
   - Performance optimization

---

## Remaining Decisions (Waiting on DJ)

These 6 pending questions will be incorporated into services/stores once answered:

1. **Q1: ShipStation field mapping** → LabelService extraction
2. **Q2: Batch panel details** → Batch panel component design
3. **Q3: SKU sort logic** → SelectionStore (if needed) + sorting service
4. **Q4: Labels button** → LabelService actions
5. **Q5: Print queue workflow** → PrintQueueStore + PrintQueueService
6. **Q6: External sync detection** → SyncService logic

---

**Status**: Ready for Albert to review and confirm strategy. Once confirmed, Kayla executes.

**Last Updated**: 2026-03-26 11:08 EDT
