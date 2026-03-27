# PrepShip — Fullstack Architecture Document

> **Version:** 1.0.0 — March 2026  
> **Stack:** React 18 + TypeScript strict + Rsbuild + Zustand v5 + SCSS Modules / Express + SQLite (Knex)  
> **Hosting:** Cloudflare Pages (frontend) + Express (local, Cloudflare Worker later)  
> **Single-user, no auth. DJ manages shipping for KF Goods, Tran Agency, etc.**

---

## Table of Contents

1. [Frontend Directory Structure](#1-frontend-directory-structure)
2. [Store Design](#2-store-design)
3. [Data Flow](#3-data-flow)
4. [Service Layer](#4-service-layer)
5. [API Client Design](#5-api-client-design)
6. [Backend Integration Map](#6-backend-integration-map)
7. [Migration Phases](#7-migration-phases)

---

## 1. Frontend Directory Structure

### Canonical file list

```
src/
├── index.tsx                          ← App entry point (Rsbuild)
├── App.tsx                            ← Root router + layout shell

├── types/
│   ├── orders.ts                      ← OrderDTO, Order, Rate, RateGroup, OrderLabel, OrderStatus, BillingCalculation, ColumnConfig
│   ├── markups.ts                     ← Markup, MarkupType, MarkupsMap, RbMarkupsResponse
│   ├── billing.ts                     ← BillingRecord, BillingSettings, BillingFilter
│   └── sync.ts                        ← SyncResult, NormalizedOrder, SyncState

├── stores/
│   ├── ordersStore.ts                 ← All orders state: pagination, selection, allOrders, sync state machine
│   ├── printQueueStore.ts             ← Print queue: queued order IDs, print actions, batch state
│   ├── settingsStore.ts               ← Billing settings: prepCost, packageCostPerOz, syncFrequencyMin
│   ├── billingStore.ts                ← Per-order billing records, calc state, persist to API
│   ├── ratesStore.ts                  ← Per-order rate cache (ratesMap), loading state, selected rate
│   ├── markupStore.ts                 ← Carrier markups (MarkupsMap), load/save actions
│   └── uiStore.ts                     ← Right panel mode, selected order IDs for panel, active page

├── services/
│   ├── OrderService.ts                ← Domain logic: filter, sort, group by SKU, residential detection
│   ├── MarkupService.ts               ← Markup lookup, apply to rate, ORION display logic
│   ├── RateService.ts                 ← Rate request building, cache key, best-rate selection
│   ├── LabelService.ts                ← Label creation orchestration (calls API, updates store)
│   └── BillingService.ts             ← Billing formula: baseRate + residentialSurcharge + markup + prep + pkg

├── hooks/
│   ├── useAutoSync.ts                 ← Sets up polling interval; drives ordersStore.startSync/syncComplete
│   ├── useSync.ts                     ← Manual sync trigger; returns { syncing, lastSyncTime, trigger }
│   ├── useRates.ts                    ← Fetch rates for selected order; writes to ratesStore
│   ├── useCreateLabel.ts              ← Create label for order; calls LabelService; updates ordersStore
│   ├── useOrders.ts                   ← Subscribe to ordersStore (paginated view slice)
│   ├── useOrderDetail.ts              ← Single order from allOrders by ID
│   ├── useBilling.ts                  ← Subscribe to billingStore for a given orderId
│   └── useSettings.ts                ← Load/save settings via settingsStore

├── api/
│   ├── client.ts                      ← Base HTTP client: request(), error contract, base URL
│   ├── orders.ts                      ← orders.list(), orders.get(), orders.storeCounts()
│   ├── sync.ts                        ← sync.run(lastSyncTime, storeId)
│   ├── rates.ts                       ← rates.fetch(orderId, params)
│   ├── labels.ts                      ← labels.create(body)
│   ├── billing.ts                     ← billing.list(), billing.create(), billing.recalc(), billing.void()
│   └── settings.ts                    ← settings.getBilling(), settings.putBilling()

├── components/
│   ├── Layout/
│   │   ├── Layout.tsx                 ← App shell: sidebar + main content + right panel
│   │   └── Layout.module.scss
│   ├── Sidebar/
│   │   ├── Sidebar.tsx                ← Navigation: status tabs, client filter, sync indicator
│   │   └── Sidebar.module.scss
│   ├── OrdersView/
│   │   ├── OrdersView.tsx             ← Virtualized order table with filter bar + pagination
│   │   ├── OrderRow.tsx               ← Single order row (age badge, SKU, weight, rate, status)
│   │   ├── FilterBar.tsx              ← Search, date range, status filter controls
│   │   └── OrdersView.module.scss
│   ├── RightPanel/
│   │   ├── RightPanel.tsx             ← Panel router: empty / single / batch
│   │   ├── EmptyPanel.tsx             ← Placeholder when no selection
│   │   ├── SingleOrderPanel.tsx       ← Rates, label creation, billing for 1 order
│   │   ├── BatchPanel.tsx             ← Batch rate selection, queue to print
│   │   └── RightPanel.module.scss
│   ├── OrderDetail/
│   │   ├── OrderDetail.tsx            ← Expanded order fields: address, items, weight, dims
│   │   └── OrderDetail.module.scss
│   ├── Shipment/
│   │   ├── ShippingPanel.tsx          ← Rate list, rate selection, create label button
│   │   └── ShippingPanel.module.scss
│   ├── Billing/
│   │   ├── BillingSection.tsx         ← Billing breakdown display for a shipped order
│   │   ├── VoidedBadge.tsx            ← Voided billing indicator
│   │   └── Billing.module.scss
│   ├── PrintLabelButton/
│   │   ├── PrintLabelButton.tsx       ← Queue to print / print now action
│   │   └── index.ts
│   └── Tables/
│       └── columnDefs.ts              ← ColumnConfig[] definitions for the orders table

├── layouts/
│   ├── AppLayout.tsx                  ← Top-level layout wrapper (sidebar + main + panel)
│   └── SettingsLayout.tsx             ← Settings page shell (full-width, no panel)

├── pages/
│   ├── OrdersPage.tsx                 ← Default page: OrdersView + RightPanel wired to stores
│   ├── SettingsPage.tsx               ← Billing settings form + markup editor
│   └── PlaceholderPage.tsx            ← Stub for future routes (billing history, reports)

└── utils/
    ├── orders.ts                      ← ageHours, ageColor, ageDisplay, getPrimarySku, getTotalQty, getExpedited, fmtDate, fmtWeight, getOrderDimensions, getOrderWeight, getOrderZip
    ├── markups.ts                     ← getCarrierMarkup, applyCarrierMarkup, pickBestRate, priceDisplay, formatOrionRateDisplay, isOrionRate, isBlockedRate
    └── format.ts                      ← formatCurrency, formatAddress, formatTrackingUrl
```

---

### Directory purposes

| Directory | Rule |
|-----------|------|
| `types/` | Pure TypeScript interfaces/types. Zero imports from React or stores. Single source of truth — no duplicates elsewhere. |
| `stores/` | Zustand v5 stores only. One file = one domain. No business logic — delegates to services. |
| `services/` | Pure classes with no React deps. All business logic lives here. Testable in isolation. |
| `hooks/` | React integration layer. Connects stores + services + API. No logic that belongs in a service. |
| `api/` | HTTP only. No state, no side effects beyond the fetch. Returns typed responses or throws `ApiError`. |
| `components/` | UI rendering. Reads from hooks/stores via hooks. No direct API calls. |
| `layouts/` | Page shells with zero business logic. Only structural composition. |
| `pages/` | Route-level components that wire together layouts + components. One per route. |
| `utils/` | Pure functions with no side effects. Deterministic input → output. Fully testable. |

---

## 2. Store Design

### 2.1 `ordersStore`

**State shape:**
```typescript
interface OrdersState {
  // Paginated view (OrderDTO, displayed in table)
  orders: OrderDTO[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pages: number;
  pageSize: number;                        // default: 50
  currentStatus: OrderStatus;             // 'awaiting_shipment' | 'shipped' | 'cancelled'
  activeClient: string | null;            // clientId filter, null = all
  searchQuery: string;
  dateStart: string | null;               // ISO date string
  dateEnd: string | null;
  selectedOrderIds: Set<number>;

  // Canonical full list (Order domain type, populated by sync)
  allOrders: Order[];

  // Sync state machine
  sync: {
    syncing: boolean;
    lastSyncTime: Date | null;
    lastSyncError: string | null;
  };
}
```

**Actions:**
```typescript
setStatus(status: OrderStatus): void
setNavFilter(status: OrderStatus, client: string | null): void
setPage(page: number): void
setSearchQuery(query: string): void
setDateRange(start: string | null, end: string | null): void
toggleOrderSelection(orderId: number): void
selectAllOrders(): void
clearSelection(): void
fetchOrders(): Promise<void>            // filters allOrders in-memory; falls back to mock pre-sync
startSync(): void                       // sync.syncing = true
syncComplete(syncedAt: Date, allOrders: Order[]): void  // merges allOrders, refreshes paginated view
syncError(errorMessage: string): void
markExternallyShipped(orderId: OrderId, detectedAt: Date): void
addLabel(orderId: OrderId, label: OrderLabel): void  // status → shipped
markOrderAsShipped(orderId, tracking, labelUrl, carrierCode): void  // also triggers billing
calculateOrderCosts(orderId, baseRate, residential, markupPercent): BillingCalculation | null
handleLabelError(orderId, error): void
```

**Selectors:**
```typescript
// Derived in-component (not in store) — use useMemo:
pendingCount: allOrders.filter(o => o.status === 'awaiting_shipment').length
shippedCount: allOrders.filter(o => o.status === 'shipped').length
selectedOrders: orders.filter(o => selectedOrderIds.has(o.orderId))
syncAge: lastSyncTime ? (Date.now() - lastSyncTime.getTime()) / 60000 : null  // minutes
```

**Sync triggers:**
- `useAutoSync` fires `startSync()` + `syncComplete()` on interval (driven by `settingsStore.syncFrequencyMin`)
- `useSync.trigger()` fires on manual button press
- `setStatus()` and `setNavFilter()` call `fetchOrders()` (in-memory, no API call)

---

### 2.2 `printQueueStore`

**State shape:**
```typescript
interface PrintQueueState {
  queue: PrintQueueItem[];              // ordered list, FIFO
  printing: boolean;
  lastPrintedAt: Date | null;
  error: string | null;
}

interface PrintQueueItem {
  orderId: string;
  orderNumber: string;
  labelUrl: string | null;
  trackingNumber: string | null;
  queuedAt: Date;
  status: 'queued' | 'printing' | 'done' | 'error';
  error?: string;
}
```

**Actions:**
```typescript
enqueue(item: Omit<PrintQueueItem, 'queuedAt' | 'status'>): void
dequeue(orderId: string): void
clearQueue(): void
printAll(): void            // console.log each item; future: POST /api/print-queue
markPrinted(orderId: string): void
markError(orderId: string, error: string): void
```

**Selectors:**
```typescript
queueCount: queue.length
pendingItems: queue.filter(i => i.status === 'queued')
hasItems: queue.length > 0
```

**Sync triggers:** None. Populated by user action only (PrintLabelButton → enqueue).

---

### 2.3 `settingsStore`

**State shape:**
```typescript
interface SettingsState {
  prepCost: number;                     // USD per order
  packageCostPerOz: number;             // USD per oz
  syncFrequencyMin: 5 | 10 | 30 | 60;  // polling interval
  autoVoidAfterDays: number | null;     // null = never
  loading: boolean;
  saving: boolean;
  error: string | null;
  loaded: boolean;                      // true after first successful GET
}
```

**Actions:**
```typescript
loadSettings(): Promise<void>           // GET /api/settings/billing
saveSettings(partial: Partial<BillingSettings>): Promise<void>  // PUT /api/settings/billing
setPrepCost(v: number): void            // optimistic local update
setPackageCostPerOz(v: number): void
setSyncFrequency(v: 5 | 10 | 30 | 60): void
```

**Selectors:** None — all values read directly.

**Sync triggers:** `loadSettings()` called once on app boot (in `App.tsx` via `useSettings`).

---

### 2.4 `billingStore`

**State shape:**
```typescript
interface BillingState {
  records: Map<string, BillingRecord>;  // keyed by orderId
  loading: Set<string>;                 // orderIds currently loading
  error: Map<string, string>;           // per-order errors
  listLoading: boolean;
  listError: string | null;
  list: BillingRecord[];                // full list for billing history view
  listTotal: number;
  listPage: number;
}
```

**Actions:**
```typescript
calculateBilling(input: BillingCalcInput): void          // create/update local record
persistBilling(orderId: string): Promise<void>           // POST /api/billing/:orderId
recalcBilling(orderId: string): Promise<void>            // PUT /api/billing/:orderId
voidBilling(orderId: string): Promise<void>              // PUT /api/billing/:orderId/void
loadBillingList(filter?: BillingFilter): Promise<void>   // GET /api/billing
loadOrderBilling(orderId: string): Promise<void>         // load single from API
setBillingRecord(orderId: string, record: BillingRecord): void
```

**Selectors:**
```typescript
getBillingForOrder(orderId: string): BillingRecord | undefined
totalRevenue: list.reduce((s, r) => s + r.totalCost, 0)
```

**Sync triggers:**
- `persistBilling()` called by `ordersStore.markOrderAsShipped()` (Q7 auto-billing rule)
- `loadBillingList()` called on BillingHistoryPage mount (future)

---

### 2.5 `ratesStore`

**State shape:**
```typescript
interface RatesState {
  ratesMap: Map<string, CachedRates>;   // cacheKey → { rates, fetchedAt }
  loading: Set<string>;                 // cacheKeys currently fetching
  error: Map<string, string>;           // per-cacheKey errors
  selectedRates: Map<string, Rate>;     // orderId → selected Rate
}

interface CachedRates {
  rates: Rate[];
  fetchedAt: Date;
  fromServerCache: boolean;
}
```

**Actions:**
```typescript
fetchRates(orderId: string, params: RateFetchParams): Promise<Rate[]>
selectRate(orderId: string, rate: Rate): void
clearRatesForOrder(orderId: string): void
clearAll(): void
setRates(cacheKey: string, rates: Rate[], fromServerCache: boolean): void
```

**Selectors:**
```typescript
getRatesForOrder(orderId: string): Rate[]
getSelectedRate(orderId: string): Rate | undefined
isLoadingForOrder(orderId: string): boolean
getBestRate(orderId: string, markupsMap: MarkupsMap): Rate | null  // delegates to MarkupService
```

**Sync triggers:** `fetchRates()` called by `useRates` when an order is selected in the panel.

---

## 3. Data Flow

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         PrepShip Data Flow                              ║
╚══════════════════════════════════════════════════════════════════════════╝

── SYNC FLOW ──────────────────────────────────────────────────────────────

useAutoSync (interval: settingsStore.syncFrequencyMin)
  │
  ├─ ordersStore.startSync()
  │
  ├─ api/sync.run(lastSyncTime, storeId)
  │     └─ POST /api/sync
  │           └─ ShipStation V1 /orders (paginated)
  │
  ├─ syncService.merge(existing: Order[], synced: NormalizedOrder[]) → Order[]
  │     └─ dedup by orderId, preserve local label/billing state
  │
  └─ ordersStore.syncComplete(syncedAt, mergedOrders)
        └─ ordersStore.fetchOrders() ← refreshes paginated view in-memory


── RATE FETCH FLOW ────────────────────────────────────────────────────────

User clicks order row
  │
  ├─ uiStore.setSelectedOrder(orderId)
  │
  ├─ RightPanel renders SingleOrderPanel
  │
  └─ useRates(orderId) fires
        │
        ├─ RateService.buildCacheKey(order) → cacheKey
        │
        ├─ ratesStore.fetchRates(orderId, params)
        │     └─ api/rates.fetch(orderId, {fromZip, toZip, weightOz, dims, residential})
        │           └─ GET /api/rates/:orderId?fromZip=...
        │                 └─ ShipStation V2 /rates/estimate (server-side 30min cache)
        │
        └─ ratesStore.setRates(cacheKey, rates)
              └─ MarkupService.applyCarrierMarkup(rate, markupsMap) ← display with markup


── LABEL CREATION FLOW ────────────────────────────────────────────────────

User selects rate → clicks "Create Label"
  │
  ├─ ratesStore.selectRate(orderId, rate)
  │
  ├─ useCreateLabel.create(orderId, selectedRate)
  │     │
  │     ├─ LabelService.buildCreateRequest(order, rate, settings)
  │     │
  │     ├─ api/labels.create(body)
  │     │     └─ POST /api/labels
  │     │           └─ ShipStation V2 /labels
  │     │
  │     ├─ ordersStore.addLabel(orderId, label)
  │     │     └─ order.status → 'shipped'
  │     │
  │     └─ ordersStore.markOrderAsShipped(orderId, tracking, labelUrl, carrierCode)
  │           └─ billingStore.calculateBilling({orderId, shippingCost, weightOz, ...}) ← Q7


── PRINT QUEUE FLOW ───────────────────────────────────────────────────────

User clicks "Queue for Print" (post-label creation)
  │
  ├─ printQueueStore.enqueue({ orderId, orderNumber, labelUrl, trackingNumber })
  │
  └─ printQueueStore.printAll()
        │
        ├─ console.log('[PrintQueue] printing', item)    ← current implementation
        │
        └─ [future] POST /api/print-queue → external print server


── BILLING PERSIST FLOW ───────────────────────────────────────────────────

ordersStore.markOrderAsShipped() → billingStore.calculateBilling()
  │
  ├─ BillingService.calculate(input) → BillingRecord (local)
  │     formula: round((baseRate + residentialSurcharge) × (1 + markup%) + prepCost + pkgCost)
  │
  ├─ billingStore.setBillingRecord(orderId, record)
  │
  └─ billingStore.persistBilling(orderId)
        └─ api/billing.create({ shippingCost, weightOz, carrierMarkupPercent, clientId })
              └─ POST /api/billing/:orderId → SQLite order_billing table


── SETTINGS FLOW ──────────────────────────────────────────────────────────

App.tsx mount
  │
  └─ useSettings() → settingsStore.loadSettings()
        └─ GET /api/settings/billing → { prepCost, packageCostPerOz, syncFrequencyMin }

User edits settings
  │
  └─ settingsStore.saveSettings(partial)
        └─ PUT /api/settings/billing → server invalidates rates cache
```

---

## 4. Service Layer

### 4.1 `OrderService`

```typescript
class OrderService {
  // Residential detection: explicit flag > sourceResidential > !company presence
  static isResidential(order: OrderDTO): boolean

  // Primary SKU: highest-qty non-adjustment item
  static getPrimarySku(order: OrderDTO): string

  // Total qty across all non-adjustment items
  static getTotalQty(order: OrderDTO): number

  // Group orders by (weight, zip, dims, residential, storeId) for bulk rate caching
  static groupByRateKey(orders: OrderDTO[]): RateGroup[]

  // Expedited detection from serviceCode string
  static getExpedited(serviceCode?: string): '1-day' | '2-day' | null

  // Get effective dimensions (prefers _enrichedDims)
  static getOrderDimensions(order: OrderDTO): OrderDimensions | null

  // Get effective weight in oz (prefers _enrichedWeight)
  static getOrderWeight(order: OrderDTO): number

  // Get 5-digit destination zip
  static getOrderZip(order: OrderDTO): string

  // Sort orders by createdAt descending
  static sortByAge(orders: OrderDTO[]): OrderDTO[]

  // Filter orders matching given params (used by ordersStore.fetchOrders)
  static applyFilter(orders: Order[], filter: OrdersFilterOptions): Order[]
}
```

**Dependencies:** `types/orders`, `utils/orders`

---

### 4.2 `MarkupService`

```typescript
class MarkupService {
  // Priority: shippingProviderId → carrierCode → default {flat, 0}
  static getCarrierMarkup(
    carrierCode: string | undefined,
    shippingProviderId: number | undefined,
    markupsMap: MarkupsMap
  ): Markup

  // Apply markup to rate; returns final charged price
  static applyCarrierMarkup(rate: Rate, markupsMap: MarkupsMap): number

  // Pick cheapest rate after markup; respects store-specific blocking
  static pickBestRate(rates: Rate[], markupsMap: MarkupsMap, storeId?: number): Rate | null

  // Block check (store-level rate blocking — future implementation)
  static isBlockedRate(rate: Rate, storeId?: number): boolean

  // ORION detection: shippingProviderId === 596001 OR nickname contains 'ORI'
  static isOrionRate(rate: Rate): boolean

  // Full price breakdown: basePrice, markupAmount, total, display string
  static priceDisplay(rate: Rate, markupsMap: MarkupsMap): PriceDisplayResult

  // HTML display for ORION rates (marked price + base cost)
  static formatOrionRateDisplay(rate: Rate, markupsMap: MarkupsMap, opts?: DisplayOpts): string
}
```

**Dependencies:** `types/orders`, `types/markups`

---

### 4.3 `RateService`

```typescript
class RateService {
  // Build the cache key string for a rate request
  static buildCacheKey(
    orderId: string,
    fromZip: string,
    toZip: string,
    weightOz: number,
    dims?: OrderDimensions,
    residential?: boolean
  ): string

  // Build the full GET params object from an OrderDTO + origin config
  static buildFetchParams(
    order: OrderDTO,
    originZip: string
  ): RateFetchParams | null     // null if missing required fields (weight, zip)

  // Normalize raw API rate response (ProxyRate) → internal Rate type
  static normalizeRate(raw: ProxyRate): Rate

  // Sort rates by effective price (after markup applied)
  static sortByPrice(rates: Rate[], markupsMap: MarkupsMap): Rate[]
}
```

**Dependencies:** `types/orders`, `types/markups`, `MarkupService`

---

### 4.4 `LabelService`

```typescript
class LabelService {
  // Build the POST /api/labels request body from order + selected rate + settings
  static buildCreateRequest(
    order: Order,
    rate: Rate,
    shipFrom: LabelAddress,
    testLabel?: boolean
  ): CreateLabelBody

  // Validate that required fields are present before creating label
  // Returns null if valid, error string if invalid
  static validateCreateRequest(order: Order, rate: Rate): string | null

  // Normalize /api/labels response → OrderLabel domain type
  static normalizeResponse(raw: LabelApiResponse): OrderLabel
}
```

**Dependencies:** `types/orders`, `api/labels`

---

### 4.5 `BillingService`

```typescript
class BillingService {
  // Core billing formula (LOCKED — must match server/routes/billing.ts):
  // baseRate = shippingCost + residentialSurcharge
  // markupAmount = baseRate × (markupPercent / 100)
  // totalCost = round(baseRate + markupAmount + prepCost + pkgCost, banker's)
  static calculate(input: BillingCalcInput): BillingCalcResult

  // Banker's rounding (round-half-to-even) — must match server implementation
  static roundToNearestCent(amount: number): number

  // Validate inputs before calculation
  static validateInput(input: BillingCalcInput): string | null

  // Format billing record for display
  static formatBreakdown(record: BillingRecord): string
}

interface BillingCalcInput {
  shippingCost: number;
  residentialSurcharge: number;     // 4.40 for residential, 0 for commercial
  carrierMarkupPercent: number;
  prepCost: number;                 // from settingsStore
  packageCostPerOz: number;         // from settingsStore
  weightOz: number;
}
```

**Dependencies:** `types/billing`

> ⚠️ **Critical constraint:** `BillingService.roundToNearestCent()` must produce identical output to `server/routes/billing.ts` `roundToNearestCent()`. These two implementations are contract-locked. Any change to either requires changing both.

---

## 5. API Client Design

### Base client (`src/api/client.ts`)

```typescript
// Base URL: import.meta.env.PUBLIC_API_BASE || '/api'
// No auth headers — single-user, no auth required

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,        // e.g. 'VALIDATION_ERROR', 'UPSTREAM_ERROR'
    message: string,
    public readonly retryAfterSecs?: number
  ) { super(message); }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options?: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
  }
): Promise<T>

// Error handling:
// - Non-2xx: parse { error, code, retryAfterSecs? } from body → throw ApiError
// - Network failure: throw ApiError(0, 'NETWORK_ERROR', ...)
// - 429: throw ApiError(429, 'RATE_LIMITED', ..., retryAfterSecs)
// - 401: throw ApiError(401, 'AUTH_ERROR', ...)
// - 500/502: throw ApiError(status, 'UPSTREAM_ERROR' | 'INTERNAL_ERROR', ...)
```

### Per-domain API functions

**`src/api/orders.ts`**
```typescript
orders.list(params: OrdersQueryParams): Promise<ListOrdersResponse>
  // GET /api/orders?page&pageSize&orderStatus&storeId&clientId&dateStart&dateEnd

orders.get(orderId: number): Promise<OrderDTO>
  // GET /api/orders/:orderId

orders.storeCounts(status: string): Promise<Record<number, number>>
  // GET /api/orders/store-counts?orderStatus=...
```

**`src/api/sync.ts`**
```typescript
sync.run(lastSyncTime: Date | null, storeId?: number): Promise<SyncResult>
  // POST /api/sync { lastSyncTime: ISO | null, storeId? }
```

**`src/api/rates.ts`**
```typescript
rates.fetch(orderId: string, params: RateFetchParams): Promise<RatesResponse>
  // GET /api/rates/:orderId?fromZip&toZip&weightOz&lengthIn&widthIn&heightIn&residential

rates.cacheStats(): Promise<CacheStatsResponse>
  // GET /api/rates/cache/stats
```

**`src/api/labels.ts`**
```typescript
labels.create(body: CreateLabelBody): Promise<{ label: LabelApiResponse }>
  // POST /api/labels
```

**`src/api/billing.ts`**
```typescript
billing.list(filter?: BillingFilter): Promise<BillingListResponse>
  // GET /api/billing?clientId&dateStart&dateEnd&voided&page&pageSize

billing.create(orderId: string, body: BillingCreateBody): Promise<BillingRecord>
  // POST /api/billing/:orderId

billing.recalculate(orderId: string, body: BillingRecalcBody): Promise<BillingRecord>
  // PUT /api/billing/:orderId

billing.void(orderId: string): Promise<BillingRecord>
  // PUT /api/billing/:orderId/void { voided: true }

billing.recalculateBulk(filter?: BillingBulkFilter): Promise<BulkRecalcResult>
  // POST /api/billing/recalculate-bulk
```

**`src/api/settings.ts`**
```typescript
settings.getBilling(): Promise<BillingSettings>
  // GET /api/settings/billing

settings.putBilling(partial: Partial<BillingSettings>): Promise<BillingSettings>
  // PUT /api/settings/billing
```

### Error handling contract

All API functions propagate `ApiError`. Callers (hooks) catch and route:

```typescript
try {
  await api.labels.create(body);
} catch (err) {
  if (err instanceof ApiError) {
    if (err.code === 'RATE_LIMITED') scheduleRetry(err.retryAfterSecs);
    else if (err.code === 'AUTH_ERROR') showAuthError();
    else showGenericError(err.message);
  }
}
```

Hooks never swallow errors silently. Every catch block either surfaces to a store error field or re-throws.

---

## 6. Backend Integration Map

The backend lives in `server/routes/` with 5 route files. Below is the full endpoint manifest mapped to frontend consumers.

| # | Module | Endpoints | Frontend Consumer | Priority |
|---|--------|-----------|-------------------|----------|
| 1 | `sync` | `POST /api/sync` | `ordersStore` via `useAutoSync` / `useSync` | P1 |
| 2 | `rates` | `GET /api/rates/:orderId` | `ratesStore` via `useRates` | P1 |
| 3 | `rates` | `GET /api/rates/cache/stats` | DevTools only (DJ debugging) | P3 |
| 4 | `labels` | `POST /api/labels` | `ordersStore` via `useCreateLabel` + `LabelService` | P1 |
| 5 | `billing` | `POST /api/billing/:orderId` | `billingStore.persistBilling()` | P1 |
| 6 | `billing` | `PUT /api/billing/:orderId` | `billingStore.recalcBilling()` | P2 |
| 7 | `billing` | `PUT /api/billing/:orderId/void` | `billingStore.voidBilling()` | P2 |
| 8 | `billing` | `GET /api/billing` | `billingStore.loadBillingList()` | P2 |
| 9 | `billing` | `POST /api/billing/recalculate-bulk` | `SettingsPage` admin action | P3 |
| 10 | `settings` | `GET /api/settings/billing` | `settingsStore.loadSettings()` | P1 |
| 11 | `settings` | `PUT /api/settings/billing` | `settingsStore.saveSettings()` | P1 |

> **Note:** The frontend `src/api/client.ts` also references `/api/orders`, `/api/clients`, and `/api/settings/rbMarkups`. These endpoints are not yet implemented in `server/routes/`. They are P1 blockers — required for the full paginated order view and markup system.

| # | Missing Module | Endpoint | Frontend Consumer | Priority |
|---|---------------|----------|-------------------|----------|
| 12 | `orders` (missing) | `GET /api/orders` | `api/orders.ts` → `ordersStore.fetchOrders()` | P1 |
| 13 | `orders` (missing) | `GET /api/orders/:orderId` | `api/orders.ts` → `useOrderDetail` | P1 |
| 14 | `clients` (missing) | `GET /api/clients` | `api/orders.ts` → `Sidebar` client list | P1 |

> These three are the highest-priority backend gaps. Until they exist, `ordersStore.fetchOrders()` falls back to mock data.

---

## 7. Migration Phases

### Phase 1 — Types + Layout Shell

**Goal:** Clean type foundation and working skeleton UI with no business logic.

**Files created:**
```
src/types/orders.ts      ← Port from prepship-v3/src/types/orders.ts (verbatim — already clean)
src/types/markups.ts     ← Port from prepship-v3/src/types/markups.ts (verbatim)
src/types/billing.ts     ← New: BillingRecord, BillingSettings, BillingCalcInput, BillingFilter
src/types/sync.ts        ← New: SyncResult, NormalizedOrder (from server/routes/sync.ts types)
src/layouts/AppLayout.tsx
src/layouts/SettingsLayout.tsx
src/components/Layout/Layout.tsx
src/components/Sidebar/Sidebar.tsx
src/pages/OrdersPage.tsx  ← Stub: hardcoded empty state
src/pages/SettingsPage.tsx  ← Stub
src/pages/PlaceholderPage.tsx
```

**Files deleted/consolidated:**
- Remove duplicate type definitions from `src/utils/markupService.ts` — types belong in `src/types/` only
- Remove `src/server/` directory — backend code does not belong in `src/`

**Verification:**
```bash
npx tsc --noEmit          # zero type errors
npm run build             # Rsbuild produces dist/ with no errors
# App renders sidebar + empty orders list
```

---

### Phase 2 — Stores + Data Model

**Goal:** All five stores wired with correct state shapes and actions. No API calls yet — stores use mock data or empty state.

**Files created:**
```
src/stores/ordersStore.ts      ← Consolidate from existing + add missing actions
src/stores/printQueueStore.ts  ← New: queue state + enqueue/dequeue/printAll
src/stores/settingsStore.ts    ← New: billing settings state
src/stores/billingStore.ts     ← Expand existing: add list, loading map, error map
src/stores/ratesStore.ts       ← New: ratesMap + selectedRates + loading/error per key
src/stores/markupStore.ts      ← Keep existing, add load/save actions
src/stores/uiStore.ts          ← Keep: panel mode + selectedOrderId
```

**Files deleted:**
- `src/stores/markupsStore.ts` — duplicate of `markupStore.ts`; consolidate into one
- `src/stores/orderDetailStore.ts` — absorbed into `ordersStore.allOrders` + `uiStore.selectedOrderId`
- `src/stores/labelStore.ts` — label state belongs in `ordersStore.addLabel()` and `printQueueStore`

**Verification:**
```bash
npx tsc --noEmit
# In browser console: window.__stores (expose stores for inspection)
# ordersStore.getState().allOrders === []
# printQueueStore.getState().queue === []
# settingsStore.getState().syncFrequencyMin === 5
```

---

### Phase 3 — API Client + Sync

**Goal:** Working ShipStation sync. Orders appear after first poll. Settings load from DB.

**Files created:**
```
src/api/client.ts        ← Base request() function + ApiError class
src/api/orders.ts        ← orders.list(), orders.get(), orders.storeCounts()
src/api/sync.ts          ← sync.run()
src/api/rates.ts         ← rates.fetch(), rates.cacheStats()
src/api/labels.ts        ← labels.create()
src/api/billing.ts       ← billing.list/create/recalc/void/recalculateBulk
src/api/settings.ts      ← settings.getBilling(), settings.putBilling()
src/hooks/useAutoSync.ts ← Port + upgrade: uses settingsStore.syncFrequencyMin
src/hooks/useSync.ts     ← Manual sync trigger
src/hooks/useSettings.ts ← Load on mount, save on change
```

**Files deleted:**
- `src/api/shipstationClient.ts` — direct ShipStation calls belong on the server, not the frontend
- `src/api/proxyClient.ts` — absorbed into `src/api/client.ts`
- `src/api/rateService.ts` → move to `src/services/RateService.ts`

**Verification:**
```bash
# Start backend: node server/server.ts
# Start frontend: npm run dev
# useAutoSync fires every 5 minutes
# ordersStore.allOrders.length > 0 after first sync
# settingsStore.loaded === true on mount
# Network tab shows POST /api/sync 200
```

---

### Phase 4 — Service Layer

**Goal:** All business logic moved from utils/ and inline hook code into typed service classes. Pure functions, fully testable.

**Files created:**
```
src/services/OrderService.ts    ← Consolidate order utils into static class methods
src/services/MarkupService.ts   ← Port prepship-v3/src/utils/markups.ts as class
src/services/RateService.ts     ← Upgrade from src/api/rateService.ts
src/services/LabelService.ts    ← Extract from useCreateLabel.ts
src/services/BillingService.ts  ← Upgrade from src/utils/billingService.ts
```

**Files deleted:**
- `src/utils/markupService.ts` → replaced by `src/services/MarkupService.ts`
- `src/utils/labelService.ts` → replaced by `src/services/LabelService.ts`
- `src/utils/billingService.ts` → replaced by `src/services/BillingService.ts`
- `src/utils/rateFetchCache.ts` → logic absorbed into `RateService` + `ratesStore`
- `src/utils/rateCache.ts` → same
- `src/utils/residentialService.ts` → absorbed into `OrderService.isResidential()`

**Files kept/consolidated in utils/:**
- `src/utils/orders.ts` ← keep pure display utils only (ageHours, fmtDate, fmtWeight, etc.)
- `src/utils/markups.ts` ← keep as thin re-export layer for backward compat during transition
- `src/utils/format.ts` ← new: formatCurrency, formatAddress, formatTrackingUrl

**Verification:**
```bash
npm run test               # all unit tests pass
# vitest: services/BillingService.test.ts — roundToNearestCent matches server output
# vitest: services/MarkupService.test.ts — applyCarrierMarkup returns correct values
```

---

### Phase 5 — Feature Parity

**Goal:** All features working end-to-end: sync → view → rate → label → queue → billing.

**Files created/completed:**
```
src/hooks/useRates.ts          ← Calls ratesStore.fetchRates(); handles loading/error
src/hooks/useCreateLabel.ts    ← LabelService.buildCreateRequest → api/labels.create → ordersStore.addLabel
src/hooks/useOrders.ts         ← Subscribe to ordersStore paginated slice
src/hooks/useOrderDetail.ts    ← Find single order in allOrders by ID
src/hooks/useBilling.ts        ← Subscribe to billingStore.records.get(orderId)
src/components/OrdersView/OrdersView.tsx      ← Full table with pagination, filter
src/components/OrdersView/OrderRow.tsx        ← Age badge, SKU, weight, rate display
src/components/OrdersView/FilterBar.tsx       ← Search + date range + status toggle
src/components/RightPanel/SingleOrderPanel.tsx ← Rates list + LabelService integration
src/components/RightPanel/BatchPanel.tsx       ← Multi-select rate + queue to print
src/components/PrintLabelButton/PrintLabelButton.tsx ← Queue or direct print
src/components/Billing/BillingSection.tsx     ← Billing breakdown after ship
src/utils/format.ts                           ← formatCurrency, formatAddress
```

**Verification (feature acceptance tests):**
```
□ App loads → settings loads from DB → sync fires within 5min
□ Orders list populates after sync
□ Search/filter works client-side (no extra API call)
□ Click order → right panel → rates appear (server-cached or live)
□ Markup correctly applied to rate display
□ ORION rates show base cost + marked price
□ Click "Create Label" → label URL appears → status → 'shipped'
□ Billing record auto-created on ship (Q7)
□ Click "Queue for Print" → console.log fires with label URL
□ Settings page: update prepCost → billing formula updates on next ship
□ Void billing → BillingSection shows VoidedBadge
```

---

## Appendix: Locked Rules

These decisions are final and must not be changed without a documented reason.

| Rule | Rationale |
|------|-----------|
| `BillingService.roundToNearestCent()` must match `server/routes/billing.ts` exactly | Billing is financial — drift = incorrect invoices |
| Sync uses polling (5min), not WebSocket | Operational simplicity; DJ's use case is not real-time |
| Print queue is Zustand-only (console.log) | External print server not yet contracted |
| No auth | Single-user app; DJ operates alone |
| `OrderStatus` union: `'pending' \| 'awaiting_shipment' \| 'shipped' \| 'cancelled'` | Maps 1:1 to ShipStation statuses after normalization |
| `allOrders: Order[]` is the canonical list; `orders: OrderDTO[]` is the paginated view | Two shapes exist for historical reasons; do not merge until OrderDTO is removed |
| ORION = `shippingProviderId === 596001` OR nickname contains `'ORI'` | Hard-coded business rule from DJ — do not generalize |
| Residential surcharge = `$4.40` | Standard USPS/UPS residential fee — update only if carrier changes |
| `activeClient: string | null` uses string (clientId) not number | clientId is a string in `Order.clientId`; DTO uses number. Use string in stores to avoid coercion bugs |

---

## React Query Integration

TanStack Query v5 is the server state layer. Zustand remains for client/interaction state.

### State Ownership

| State | Owner | Why |
|-------|-------|-----|
| Rates per order | React Query | Server-fetched, 30min cache, deduplicated |
| Orders list | React Query | Paginated server data |
| Billing records | React Query | Filtered server data |
| Clients list | React Query | Rarely changes, long stale time |
| Selection, filters, zoom | Zustand | Client interaction state |
| Print queue | Zustand | Client-only, no server |
| Sync state machine | Zustand | Complex state machine logic |

### Query Key Conventions
- `['rates', orderId]` — rates for a specific order
- `['orders', { status, clientId, page }]` — paginated orders
- `['billing', { clientId, dateStart, dateEnd }]` — billing records
- `['clients']` — client list
- `['settings', 'billing']` — billing settings

### Mutation Patterns
All mutations follow this pattern:
1. `useMutation` calls API
2. On success: `queryClient.invalidateQueries` to refetch affected data
3. Optimistic updates for UI-critical mutations (label creation)
