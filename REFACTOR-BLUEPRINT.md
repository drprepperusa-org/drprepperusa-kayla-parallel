# REFACTOR-BLUEPRINT.md — DRY/SSOT Audit & Refactoring Specification

> **Version:** 1.0.0 — March 27, 2026  
> **Source repo:** `dannyjeon/prepship-v2`  
> **Target repo:** `kaylafromsd/drprepperusa-kayla-parallel`  
> **Status:** Definitive. Every future PR must reference this document.

---

## Table of Contents

1. [DRY/SSOT Violation Audit](#1-dryssot-violation-audit)
2. [Canonical Type System](#2-canonical-type-system)
3. [Canonical Data Flows](#3-canonical-data-flows)
4. [Service Boundary Decisions](#4-service-boundary-decisions)
5. [Backend Gap Plan](#5-backend-gap-plan)
6. [File Kill List](#6-file-kill-list)

---

## 1. DRY/SSOT Violation Audit

### 1.1 Duplicate: Billing Formula (3 implementations)

| # | Location | Formula | Rounding | Severity |
|---|----------|---------|----------|----------|
| V1 | `src/utils/billingService.ts:calculateBillingCost()` L70-88 | `(base + res) × (1 + markup%)` | Banker's | CRITICAL |
| V2 | `src/services/billingService.ts:calculateBilling()` L134-153 | `(base + res) × (1 + markup%)` | Banker's | CRITICAL |
| V3 | Backend `apps/api/src/modules/billing/application/billing-services.ts` | Pick-pack + additional unit + package + shipping markup (entirely different model) | N/A | CRITICAL |

**Violation type:** Duplicate logic / implicit contract  
**Details:** The frontend has TWO implementations of the same billing formula (`utils/billingService.ts` and `services/billingService.ts`). Worse, the backend billing system uses a completely different model — it has `pickPackFee`, `additionalUnitFee`, `packageCostMarkup`, `shippingMarkupPct`, and `storageFeePerCuFt`. The frontend formula `(base + residential) × (1 + markup%)` does not exist anywhere on the backend.

**Impact:** The `BillingCalculation` type in `types/orders.ts` has fields for `prepCost` and `packageCost` that are always set to `0` by the only caller (`services/billingService.ts` L155-156). The declared formula in the type comment (`total = (shippingCost + prepCost + packageCost) × (1 + carrierMarkupPercent / 100)`) does not match the actual implementation (`total = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)`).

**Fix:** 
1. Delete `src/utils/billingService.ts` entirely — it's the older copy
2. `src/services/billingService.ts` is the canonical frontend billing service — keep it
3. Align the formula with the backend. The backend billing model is richer (pick-pack, additional unit fee, storage). The frontend formula should be a **display-only estimate** until the backend computes the real invoice. The frontend `BillingCalculation` type should match what the backend actually returns, not a made-up formula
4. Contract-lock: frontend calls `POST /api/billing/:orderId` and trusts the backend result. Frontend `calculateBilling()` becomes a **preview function** only

---

### 1.2 Duplicate: `roundToNearestCent()` (2 identical implementations)

| # | Location | Lines |
|---|----------|-------|
| 1 | `src/utils/billingService.ts:roundToNearestCent()` | L40-55 |
| 2 | `src/services/billingService.ts:roundToNearestCent()` | L67-82 |

**Violation type:** Duplicate logic  
**Severity:** HIGH — if one changes and the other doesn't, billing diverges  
**Fix:** Delete from `utils/billingService.ts`. Single source: `services/billingService.ts`.

---

### 1.3 Duplicate: `BillingCalculation` type (2 incompatible definitions)

| # | Location | Shape |
|---|----------|-------|
| 1 | `src/types/orders.ts` L13-70 | Has `shippingCost`, `prepCost`, `packageCost`, `voided`, `voidedAt`, `baseRate` (deprecated), `residentialSurcharge` (deprecated) |
| 2 | `src/utils/billingService.ts` L8-20 | Has `baseRate`, `residentialSurcharge`, `markupAmount`, `precision: 'bankers_rounding'` — completely different shape |

**Violation type:** Duplicate type with divergent fields  
**Severity:** CRITICAL — callers don't know which `BillingCalculation` they're getting  
**Fix:** Delete the type from `utils/billingService.ts`. The canonical type lives in `types/orders.ts` (or better: `types/billing.ts`). The `services/billingService.ts` already imports from `types/orders.ts` — that's correct.

---

### 1.4 Duplicate: Residential Detection (4 implementations)

| # | Location | Logic |
|---|----------|-------|
| 1 | `src/utils/orders.ts:isResidential()` L16-19 | `explicit > sourceResidential > !company` |
| 2 | `src/utils/residentialService.ts:inferResidential()` L73-128 | Same core logic + ZIP heuristic + audit trail |
| 3 | `prepship-v3/src/utils/orders.ts:isResidential()` L26-29 | Identical to #1 |
| 4 | Backend: `apps/api/modules/orders/data/shipstation-residential-gateway.ts` | ShipStation API-based residential lookup |

**Violation type:** Duplicate logic  
**Severity:** HIGH — residential flag determines surcharge, affects billing  
**Fix:**
- `src/utils/orders.ts:isResidential()` — DELETE. It's the dumb version
- `src/utils/residentialService.ts` — KEEP as the canonical implementation. Rename to `src/services/ResidentialService.ts`
- The backend has its own residential resolution (ShipStation API). Frontend should trust `order.residential` from the API response and only use `inferResidential()` as a fallback when the field is null/undefined

---

### 1.5 Duplicate: Markup Application (3 systems)

| # | Location | Model | Lookup Key |
|---|----------|-------|------------|
| 1 | `src/utils/markups.ts` (ported from prepship-v3) | `MarkupsMap` keyed by `shippingProviderId \| carrierCode`, supports `pct` and `flat` types | shippingProviderId → carrierCode → default |
| 2 | `src/utils/markupService.ts` | `MarkupRule[]` keyed by `carrier` string + `clientId`, supports `pct` only (via `markupPercent`) | carrier + clientId → 0 |
| 3 | `prepship-v3/src/contexts/MarkupsContext.tsx` | Uses `MarkupsMap` (same as #1) loaded from `/api/settings/rbMarkups` | shippingProviderId → carrierCode |

**Violation type:** Duplicate logic with incompatible data models  
**Severity:** CRITICAL — two completely different markup systems exist. One uses `{ type: 'pct' | 'flat', value: number }` keyed by providerId; the other uses `{ carrier: string, markupPercent: number }` keyed by carrier+client. They cannot coexist.

**Fix:**
- The prepship-v3 markup model (`MarkupsMap` with `pct`/`flat` types, keyed by `shippingProviderId`) is the correct one — it matches the backend's data model and handles ORION accounts
- DELETE `src/utils/markupService.ts` entirely — wrong model
- KEEP `src/utils/markups.ts` — correct model, but move to `src/services/MarkupService.ts` as a class
- `ordersStore.ts` currently imports from `markupService.ts` (the wrong one). Rewire to use the `MarkupsMap`-based system

---

### 1.6 Duplicate: Rate Fetching (3 layers)

| # | Location | Mechanism |
|---|----------|-----------|
| 1 | `src/utils/rateFetchCache.ts` | In-memory Map, calls `fetchRatesFromShipStation()` directly |
| 2 | `src/api/proxyClient.ts:fetchRatesFromProxy()` | Calls `GET /api/rates/:orderId` via server proxy |
| 3 | `ordersStore.ts:enrichOrdersWithRates()` | Uses #1 (direct ShipStation) — VIOLATES proxy architecture |

**Violation type:** Split state / leaky abstraction  
**Severity:** HIGH — `rateFetchCache.ts` and `ordersStore.enrichOrdersWithRates()` call ShipStation directly from the frontend, bypassing the server proxy. This means ShipStation credentials would need to be in the frontend bundle.

**Fix:**
- DELETE `src/utils/rateFetchCache.ts` — it calls ShipStation directly
- DELETE `ordersStore.enrichOrdersWithRates()` — it uses the wrong path
- All rate fetching goes through `src/api/rates.ts → GET /api/rates/:orderId → server proxy → ShipStation`
- Server-side rate cache (30min TTL) is the only cache. No client-side rate cache needed

---

### 1.7 Duplicate: `markupsStore` vs `markupStore` (two store files)

| # | Location |
|---|----------|
| 1 | `src/stores/markupsStore.ts` |
| 2 | `src/stores/markupStore.ts` |

**Violation type:** Duplicate state  
**Severity:** MEDIUM — confusing, one may be stale  
**Fix:** Merge into `src/stores/markupStore.ts`. Delete `markupsStore.ts`.

---

### 1.8 Dead Code: `src/server/` directory

| Location | Issue |
|----------|-------|
| `src/server/rateLimiter.ts` | Backend code in frontend src/ |
| `src/server/types.ts` | Backend types in frontend src/ |
| `src/server/handlers.ts` | Backend handlers in frontend src/ |
| `src/server/auth.ts` | Backend auth in frontend src/ |

**Violation type:** Dead code / wrong location  
**Severity:** MEDIUM  
**Fix:** DELETE `src/server/` entirely. Backend code belongs in `apps/api/`.

---

### 1.9 Orphan Stores (should be absorbed)

| Store | Issue | Fix |
|-------|-------|-----|
| `src/stores/orderDetailStore.ts` | Single-order detail should be derived from `ordersStore.allOrders` | DELETE — use `allOrders.find(o => o.id === id)` |
| `src/stores/labelStore.ts` | Label state is part of order lifecycle | DELETE — label creation result goes to `ordersStore.addLabel()` |
| `src/stores/storesStore.ts` | Client/store list | KEEP but rename to `clientsStore.ts` |

---

### 1.10 Duplicate: `useRates` hook in prepship-v3

| # | Location | Issue |
|---|----------|-------|
| 1 | `prepship-v3/src/hooks/useRates.ts` | Defines its own `RateResult` type that duplicates and diverges from `types/orders.ts:Rate` |
| 2 | Target `src/hooks/useRates.ts` | Should use canonical `Rate` type |

**Violation type:** Duplicate type  
**Severity:** HIGH — `RateResult` has `price`, `carrier`, `service` (flattened names) vs `Rate` has `amount`, `carrierCode`, `serviceCode`  
**Fix:** Do not port `RateResult`. The canonical `Rate` type from `types/orders.ts` is the only rate shape. The hook normalizes API responses into `Rate` objects.

---

### 1.11 Implicit Contract: `ordersStore` billing coupling

| Location | Issue |
|----------|-------|
| `ordersStore.ts:markOrderAsShipped()` L168-195 | Directly calls `useBillingStore.getState().calculateBilling()` — cross-store coupling |

**Violation type:** Leaky abstraction  
**Severity:** MEDIUM — store-to-store coupling makes testing difficult  
**Fix:** Move the billing trigger to `useCreateLabel` hook (the orchestrator). The hook calls `ordersStore.addLabel()` then `billingStore.calculateBilling()` — stores never call each other.

---

### 1.12 Duplicate: `OrderItem` type (2 shapes)

| # | Location | Shape |
|---|----------|-------|
| 1 | `types/orders.ts:OrderItem` L99-104 | `{ id, sku, name, quantity, weightOz }` — canonical Order domain |
| 2 | `types/orders.ts:OrderDTOItem` L151-158 | `{ sku, quantity, name?, price?, imageUrl?, adjustment? }` — legacy DTO |

**Violation type:** Duplicate type (acceptable — they represent different layers)  
**Severity:** LOW — this is intentional DTO/domain separation  
**Fix:** Keep both. `OrderItem` is the domain type; `OrderDTOItem` is the wire format. Add a `normalizeItem(dto: OrderDTOItem): OrderItem` function in `OrderService`.

---

### 1.13 Split State: `BillingSettings` vs `BillingConfigDto`

| # | Location | Shape |
|---|----------|-------|
| 1 | Frontend `src/types/billing.ts` (referenced by billingApi.ts) | `prepCost`, `packageCostPerOz`, `syncFrequencyMin`, `autoVoidAfterDays` |
| 2 | Backend `billing-services.ts:DEFAULT_BILLING_CONFIG` | `pickPackFee`, `additionalUnitFee`, `packageCostMarkup`, `shippingMarkupPct`, `shippingMarkupFlat`, `billing_mode`, `storageFeePerCuFt` |

**Violation type:** Implicit contract — completely different settings models  
**Severity:** CRITICAL — frontend settings and backend settings are incompatible  
**Fix:** The backend billing config is the source of truth. Frontend `settingsStore` should load billing config per-client from `GET /api/billing/config`. The current frontend settings (`prepCost`, `packageCostPerOz`) are a simplified approximation that will need to be replaced with the real backend config model.

---

### 1.14 Duplicate: `StoreDTO` vs `ClientDto`

| # | Location | Shape |
|---|----------|-------|
| 1 | `src/types/orders.ts:StoreDTO` L226-231 | `{ clientId, name, storeIds[], platform? }` |
| 2 | Backend contracts `clients/contracts.ts:ClientDto` | `{ clientId, name, storeIds[], contactName, email, phone, active, hasOwnAccount, rateSourceClientId, rateSourceName }` |

**Violation type:** Duplicate type / incomplete mirror  
**Severity:** MEDIUM  
**Fix:** Delete `StoreDTO`. Use `Client` type (defined below in canonical types) that mirrors the backend `ClientDto`.

---

### 1.15 Duplicate: API base URL resolution (3 places)

| # | Location |
|---|----------|
| 1 | `src/api/billingApi.ts` L22 | 
| 2 | `src/api/proxyClient.ts` L21 |
| 3 | `prepship-v3/src/contexts/MarkupsContext.tsx` L9 |

**Violation type:** Duplicate logic  
**Severity:** MEDIUM  
**Fix:** Single `API_BASE` constant exported from `src/api/client.ts`. All API modules import from there.

---

## 2. Canonical Type System

Every type below lives in `src/types/`. No other file may define these shapes. Duplicates are eliminated.

### 2.1 `Order` — Domain Object (what the store holds)

```typescript
// src/types/orders.ts — CANONICAL

export type OrderId = string;
export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';

export interface Order {
  id: OrderId;                          // String(orderId)
  orderId: number;                      // ShipStation numeric ID
  orderNum: string;                     // Display order number
  clientId: string;                     // Multi-tenant client ID
  storeId?: number;                     // Raw ShipStation store ID

  orderDate: Date;
  createdAt: Date;
  lastUpdatedAt: Date;

  customer: string;
  shipTo: OrderShipToAddress;
  shipFrom: OrderShipFrom;

  items: OrderItem[];
  itemCount: number;
  skus: string[];

  weightOz: number;
  dimensions: OrderDimensionsIn;

  status: OrderStatus;
  externallyShipped: boolean;
  externallyShippedAt?: Date;

  label?: OrderLabel;
  billing?: BillingRecord;             // Changed from BillingCalculation

  notes?: string;
}

export interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  weightOz: number;
}

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

export interface OrderDimensionsIn {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}
```

**Eliminates:** `OrderDTOItem` stays as a separate DTO type. `OrderDimensions` (no unit suffix) stays for DTO compat only.

---

### 2.2 `OrderDTO` — API Response Shape (what the server sends)

```typescript
// src/types/orders.ts — kept for backward compat with ShipStation V1 shape

export interface OrderDTO {
  orderId: number;
  orderNumber: string;
  createdAt: string;                    // ISO string
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
  orderTotal?: number;
  status: 'pending' | 'awaiting_shipment' | 'shipped' | 'cancelled';
  labelCreated?: string;
  trackingNumber?: string;
  bestRate?: Rate;
}
```

**REMOVED from OrderDTO:**
- `enrichedRate`, `ratesFetched`, `rateError` — rate enrichment state belongs in `ratesStore`, not on the DTO
- `calculatedCost`, `billingCalculation` — billing state belongs in `billingStore`
- `label` (inline type) — use `OrderLabel` if needed, but label state belongs in the Order domain object
- `billingProviderId`, `printCount`, `_enrichedWeight`, `_enrichedDims` — dead fields, never used

---

### 2.3 `Rate` — A Shipping Rate

```typescript
// src/types/orders.ts — CANONICAL (already correct, keep as-is)

export interface Rate {
  shipmentId?: string;
  shippingProviderId: number;
  carrierCode: string;
  serviceCode: string;
  serviceName: string;
  amount: number;                       // Total price (shipmentCost + otherCost)
  shipmentCost?: number;                // Base cost
  otherCost?: number;                   // Insurance/surcharges
  carrierNickname?: string | null;
  deliveryDays?: number | null;
  estimatedDelivery?: string | null;
  estimatedDeliveryDays?: number;
  surcharges?: Array<{ name: string; amount: number }>;
}
```

**Eliminates:** `RateResult` from prepship-v3 `useRates.ts`, `ShipStationRate` from `rateService.ts` — all normalized to `Rate`.

---

### 2.4 `Markup` — A Carrier Markup Rule

```typescript
// src/types/markups.ts — CANONICAL (from prepship-v3, already correct)

export type MarkupType = 'pct' | 'flat';

export interface Markup {
  type: MarkupType;
  value: number;                        // % for pct, $ for flat
}

/**
 * Keyed by shippingProviderId (number) or carrierCode (string).
 * Priority: shippingProviderId → carrierCode → default {flat, 0}
 */
export type MarkupsMap = Record<number | string, Markup>;
```

**Eliminates:** `MarkupRule` from `markupService.ts` — wrong model, uses carrier string + clientId instead of shippingProviderId.

---

### 2.5 `BillingRecord` — A Computed Billing Record

```typescript
// src/types/billing.ts — CANONICAL (new, replaces BillingCalculation)

export type RoundingMethod = 'bankers' | 'standard';

/**
 * BillingRecord: what the backend stores per order.
 * 
 * The backend billing model uses per-client config:
 *   pickPackFee, additionalUnitFee, packageCostMarkup,
 *   shippingMarkupPct, shippingMarkupFlat, storageFee
 * 
 * The frontend can compute a PREVIEW using the simplified formula:
 *   total ≈ (shippingCost + residentialSurcharge) × (1 + markup%)
 * 
 * But the authoritative record comes from the backend.
 */
export interface BillingRecord {
  orderId: string;
  clientId: number;

  // Line items (from backend computation)
  shippingCost: number;                 // Label cost (shipmentCost + otherCost)
  pickPackTotal: number;                // pickPackFee × baseQty
  additionalTotal: number;              // additionalUnitFee × additionalQty
  packageTotal: number;                 // Package material cost
  shippingMarkupTotal: number;          // Markup applied to shipping
  storageTotal: number;                 // Storage fees if applicable

  // Totals
  subtotal: number;                     // Sum of all line items before tax
  totalCost: number;                    // Final total

  // Audit
  breakdown: string;                    // Human-readable formula string
  calculatedAt: Date;
  roundingMethod: RoundingMethod;

  // State
  voided: boolean;
  voidedAt?: Date;
}

/**
 * Simplified billing preview (frontend-only, for display before backend confirms).
 * Used by BillingService.preview() — NOT the authoritative record.
 */
export interface BillingPreview {
  shippingCost: number;
  residentialSurcharge: number;
  markupPercent: number;
  estimatedTotal: number;
  breakdown: string;
}

// Settings types (for settings page)
export interface BillingSettings {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}

// API request/response shapes for billing endpoints
export interface CreateBillingBody {
  shippingCost: number;
  weightOz: number;
  carrierMarkupPercent: number;
  clientId: number;
}

export interface BillingRecordResponse extends BillingRecord {}

export interface ListBillingsQuery {
  clientId?: number;
  dateStart?: string;
  dateEnd?: string;
  voided?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListBillingsResponse {
  records: BillingRecord[];
  total: number;
  page: number;
  pages: number;
}
```

**Eliminates:**
- `BillingCalculation` from `types/orders.ts` — replaced by `BillingRecord` + `BillingPreview`
- `BillingCalculation` from `utils/billingService.ts` — deleted entirely

---

### 2.6 `OrderLabel` — A Created Shipping Label

```typescript
// src/types/orders.ts — CANONICAL (keep existing, minor cleanup)

export interface OrderLabel {
  trackingNumber: string;
  shipmentCost: number;
  v2CarrierCode: string;
  serviceCode: string;
  labelUrl: string | undefined;
  v1ShippingProviderId: number;
  v1CarrierCode: string;
  createdAt: Date;
  createdBy?: string;
  voided: boolean;
}
```

No changes needed. Already canonical.

---

### 2.7 `PrintQueueItem` — An Item Queued for Printing

```typescript
// src/types/printQueue.ts — NEW

export interface PrintQueueItem {
  orderId: string;
  orderNumber: string;
  labelUrl: string | null;
  trackingNumber: string | null;
  queuedAt: Date;
  status: 'queued' | 'printing' | 'done' | 'error';
  error?: string;
}
```

---

### 2.8 `Client` — A Customer

```typescript
// src/types/clients.ts — NEW (mirrors backend ClientDto)

export interface Client {
  clientId: number;
  name: string;
  storeIds: number[];
  contactName: string;
  email: string;
  phone: string;
  active: boolean;
  hasOwnAccount: boolean;
  rateSourceClientId: number | null;
  rateSourceName: string;
}
```

**Eliminates:** `StoreDTO` from `types/orders.ts`.

---

## 3. Canonical Data Flows

### 3.1 App Boot

```
App.tsx mount
  │
  ├─ settingsStore.loadSettings()
  │     └─ api/settings.getBilling()
  │           └─ GET /api/settings/billing → settingsStore state
  │
  ├─ markupStore.loadMarkups()
  │     └─ api/settings.getMarkups()
  │           └─ GET /api/settings/rbMarkups → markupStore.markups
  │
  ├─ clientsStore.loadClients()
  │     └─ api/clients.list()
  │           └─ GET /api/clients → clientsStore.clients
  │
  └─ useAutoSync.start()
        └─ ordersStore.startSync()
        └─ api/sync.run(null)
              └─ POST /api/sync { lastSyncTime: null }
        └─ ordersStore.syncComplete(syncedAt, mergedOrders)
              └─ ordersStore.fetchOrders() ← in-memory filter/paginate
```

**Function chain:**
1. `App.tsx` → `useEffect(() => { settingsStore.getState().loadSettings(); markupStore.getState().loadMarkups(); clientsStore.getState().loadClients(); }, [])`
2. `App.tsx` → renders `<AutoSyncProvider>` → `useAutoSync()` hook starts interval
3. `useAutoSync()` → calls `syncViaProxy(lastSyncTime)` → on success: `ordersStore.getState().syncComplete(syncedAt, normalized)`
4. `syncComplete()` sets `allOrders`, then calls `fetchOrders()` which filters in-memory

---

### 3.2 Nav Filter Click (Sidebar)

```
User clicks "Shipped" tab in Sidebar
  │
  └─ ordersStore.setNavFilter('shipped', null)
        ├─ set({ currentStatus: 'shipped', activeClient: null, page: 1 })
        └─ ordersStore.fetchOrders()
              └─ allOrders.filter(o => o.status === 'shipped')
              └─ paginate → set({ orders: [...], total, pages })
```

**Function chain:**
1. `Sidebar.tsx` → `onClick={() => ordersStore.getState().setNavFilter('shipped', null)}`
2. `ordersStore.setNavFilter()` → resets page to 1 → calls `fetchOrders()`
3. `fetchOrders()` → filters `allOrders` by `currentStatus` + `activeClient` → paginates → sets `orders` (OrderDTO[])

---

### 3.3 Order Row Click → Right Panel → Rates Fetch

```
User clicks order row
  │
  ├─ uiStore.setSelectedOrder(orderId)
  │     └─ set({ panelMode: 'single', selectedOrderId: orderId })
  │
  ├─ RightPanel renders SingleOrderPanel(orderId)
  │
  └─ useRates(orderId) fires
        │
        ├─ const order = ordersStore.allOrders.find(o => o.id === orderId)
        │
        ├─ ratesStore.fetchRates(orderId, order)
        │     └─ api/rates.fetch(orderId, { toZip, weightOz, dims, residential })
        │           └─ GET /api/rates/:orderId?toZip=...&weightOz=...
        │                 └─ Server: ShipStation V2 /rates/estimate (30min cache)
        │
        └─ ratesStore.setRates(orderId, rates)
              └─ SingleOrderPanel reads ratesStore.getRatesForOrder(orderId)
              └─ Display: MarkupService.applyCarrierMarkup(rate, markupsMap) per rate
```

**Function chain:**
1. `OrderRow.tsx` → `onClick={() => uiStore.getState().setSelectedOrder(orderId)}`
2. `RightPanel.tsx` → reads `uiStore.panelMode` → renders `<SingleOrderPanel orderId={id} />`
3. `SingleOrderPanel.tsx` → calls `useRates(orderId)` hook
4. `useRates()` → reads order from `ordersStore` → calls `ratesStore.getState().fetchRates(orderId, params)`
5. `ratesStore.fetchRates()` → `api/rates.fetch()` → `GET /api/rates/:orderId` → sets `ratesMap[orderId]`
6. Component re-renders with rates, applies `MarkupService.applyCarrierMarkup()` for display

---

### 3.4 Checkbox Select → Selection State → Batch Panel

```
User checks checkbox on order row
  │
  ├─ ordersStore.toggleOrderSelection(orderId)
  │     └─ selectedOrderIds.add(orderId) or .delete(orderId)
  │
  ├─ if selectedOrderIds.size >= 2:
  │     uiStore.setPanelMode('batch')
  │
  └─ RightPanel renders BatchPanel(selectedOrderIds)
```

**Function chain:**
1. `OrderRow.tsx` → `onChange={() => ordersStore.getState().toggleOrderSelection(orderId)}`
2. Component reads `selectedOrderIds.size` → if ≥ 2, calls `uiStore.getState().setPanelMode('batch')`
3. `RightPanel.tsx` → reads `uiStore.panelMode === 'batch'` → renders `<BatchPanel />`
4. `BatchPanel.tsx` → reads `ordersStore.selectedOrderIds` → displays batch operations

---

### 3.5 Browse Rates Click → Rate Fetch → Rate Display with Markup

```
User clicks "Browse Rates" in SingleOrderPanel
  │
  ├─ useRates(orderId).fetchRates() fires (if not already cached)
  │     └─ ratesStore.fetchRates(orderId, params)
  │           └─ GET /api/rates/:orderId
  │
  └─ ShippingPanel receives rates
        │
        ├─ For each rate in rates:
        │     ├─ MarkupService.getCarrierMarkup(rate.carrierCode, rate.shippingProviderId, markupsMap)
        │     ├─ MarkupService.applyCarrierMarkup(rate, markupsMap) → displayPrice
        │     ├─ MarkupService.isOrionRate(rate) → special display
        │     └─ MarkupService.priceDisplay(rate, markupsMap) → { basePrice, markupAmount, total, display }
        │
        └─ Sort by MarkupService.applyCarrierMarkup(rate, markupsMap) ascending
```

---

### 3.6 Create Label → Validate → API Call → Store Update → Billing

```
User selects rate → clicks "Create Label"
  │
  ├─ ratesStore.selectRate(orderId, rate)
  │
  ├─ useCreateLabel.create(orderId)
  │     │
  │     ├─ 1. Validate: LabelService.validateCreateRequest(order, rate)
  │     │     └─ Returns null (valid) or error string
  │     │
  │     ├─ 2. Build request: LabelService.buildCreateRequest(order, rate, shipFrom)
  │     │
  │     ├─ 3. API call: api/labels.create(body)
  │     │     └─ POST /api/labels → server → ShipStation V2 /labels
  │     │     └─ Returns { shipmentId, trackingNumber, labelUrl, cost }
  │     │
  │     ├─ 4. Normalize: LabelService.normalizeResponse(apiResponse) → OrderLabel
  │     │
  │     ├─ 5. Update order store: ordersStore.addLabel(orderId, label)
  │     │     └─ order.status → 'shipped', order.label = label
  │     │
  │     └─ 6. Trigger billing: billingStore.calculateBilling({
  │           orderId, shippingCost: label.shipmentCost, ...
  │           })
  │           └─ BillingService.preview(input) → BillingPreview (local)
  │           └─ billingStore.persistBilling(orderId)
  │                 └─ POST /api/billing/:orderId → backend computes BillingRecord
  │                 └─ billingStore.setBillingRecord(orderId, serverRecord)
```

**CRITICAL:** Billing auto-calculation is triggered by the `useCreateLabel` hook, NOT by `ordersStore.markOrderAsShipped()`. This eliminates the cross-store coupling violation (V1.11).

---

### 3.7 Send to Queue → printQueueStore.enqueue

```
User clicks "Queue for Print" on shipped order
  │
  └─ printQueueStore.enqueue({
        orderId: order.id,
        orderNumber: order.orderNum,
        labelUrl: order.label?.labelUrl ?? null,
        trackingNumber: order.label?.trackingNumber ?? null,
     })
     └─ queue.push({ ...item, queuedAt: new Date(), status: 'queued' })
     └─ console.log('[PrintQueue] enqueued', item)
```

---

### 3.8 Batch Print → printQueueStore.printAll

```
User clicks "Print All" button
  │
  └─ printQueueStore.printAll()
        │
        ├─ set({ printing: true })
        │
        ├─ for each item in queue where status === 'queued':
        │     ├─ set item.status = 'printing'
        │     ├─ console.log('[PrintQueue] printing', item.labelUrl)
        │     ├─ set item.status = 'done'
        │     └─ (future: POST /api/print-queue → external print server)
        │
        └─ set({ printing: false, lastPrintedAt: new Date() })
```

---

## 4. Service Boundary Decisions

### 4.1 Residential Detection

| Decision | Value |
|----------|-------|
| **WHERE** | `src/services/ResidentialService.ts` (moved from `utils/residentialService.ts`) |
| **WHY** | Contains business logic (ZIP heuristics, tristate resolution) — not a pure format utility |
| **HOW** | Direct import: `import { inferResidential } from '@/services/ResidentialService'` |
| **Called by** | `OrderService.isResidential(order)` (which delegates to `inferResidential`) |

**Eliminates:** `utils/orders.ts:isResidential()` (3-line dumb version). The service has the full tristate logic with audit trail.

**Rule:** Frontend trusts `order.residential` from the API when non-null. Only calls `inferResidential()` when `order.residential === null || order.residential === undefined`.

---

### 4.2 Rate Cache Key Generation

| Decision | Value |
|----------|-------|
| **WHERE** | Server-side only (in `apps/api/src/modules/rates/`) |
| **WHY** | Rate caching is a server concern. The frontend doesn't need cache keys — it calls `GET /api/rates/:orderId` and the server handles caching |
| **HOW** | Not exposed to frontend |

**Eliminates:** `utils/rateCache.ts:buildRateCacheKey()` and `utils/rateFetchCache.ts` — both deleted. The server's 30-minute rate cache is the only cache.

---

### 4.3 Markup Application

| Decision | Value |
|----------|-------|
| **WHERE** | `src/services/MarkupService.ts` (class with static methods) |
| **WHY** | Business logic (carrier markup rules, ORION detection, best-rate selection) |
| **HOW** | Direct import: `import { MarkupService } from '@/services/MarkupService'` |
| **State** | Markups data lives in `markupStore.ts`. `MarkupService` is stateless — it receives `MarkupsMap` as a parameter |

**Functions in MarkupService:**

| Function | Source | Notes |
|----------|--------|-------|
| `getCarrierMarkup(carrierCode, shippingProviderId, markupsMap)` | `utils/markups.ts` | Keep as-is |
| `applyCarrierMarkup(rate, markupsMap)` | `utils/markups.ts` | Keep — returns final price |
| `pickBestRate(rates, markupsMap, storeId?)` | `utils/markups.ts` | Add storeId param for future blocking |
| `isOrionRate(rate)` | `utils/markups.ts` | Keep — hardcoded business rule |
| `priceDisplay(rate, markupsMap)` | `utils/markups.ts` | Keep — returns display breakdown |
| `formatOrionRateDisplay(rate, markupsMap, opts?)` | `utils/markups.ts` | Keep — HTML display for ORION rates |
| `isBlockedRate(rate, storeId?)` | `utils/markups.ts` | Keep stub — future implementation |

**Eliminates:**
- `utils/markupService.ts` — wrong model (`MarkupRule[]` with carrier string), delete entirely
- `utils/markups.ts` — logic moves to `services/MarkupService.ts`, file deleted
- `contexts/MarkupsContext.tsx` — replaced by `markupStore.ts` (Zustand, no React Context)

---

### 4.4 Billing Formula

| Decision | Value |
|----------|-------|
| **WHERE (preview)** | `src/services/BillingService.ts` — `BillingService.preview()` for frontend estimates |
| **WHERE (authoritative)** | Backend `apps/api/src/modules/billing/` — the real billing computation |
| **WHY** | The backend has the full billing model (pick-pack, additional unit, storage). The frontend preview is a simplified approximation for instant UI feedback |
| **HOW** | `useCreateLabel` hook: first calls `BillingService.preview()` for instant display, then calls `POST /api/billing/:orderId` for the real record |

**Frontend `BillingService.ts` keeps:**
- `preview(input): BillingPreview` — simplified estimate
- `roundToNearestCent(amount)` — banker's rounding (shared utility)
- `validateInput(input)` — input validation

**Frontend `BillingService.ts` loses:**
- `calculateBilling()` that returns a full `BillingCalculation` — replaced by `preview()`
- `calculateBillingOrThrow()` — deleted
- `quickBillingTotal()` — replaced by `preview().estimatedTotal`

**Contract:** Frontend `BillingService.roundToNearestCent()` must produce identical output to the backend's rounding. This is tested via contract tests.

---

### 4.5 Carrier Identification (ORION detection, carrier code resolution)

| Decision | Value |
|----------|-------|
| **WHERE** | `src/services/MarkupService.ts:isOrionRate()` |
| **WHY** | ORION is a carrier-level business rule, not a utility |
| **HOW** | Direct import |

**Rule (LOCKED):** ORION = `shippingProviderId === 596001` OR `carrierNickname.toUpperCase().includes('ORI')`.

Backend also has `carrier-resolver.ts:resolveCarrierNickname()` — that stays server-side. Frontend never resolves carrier nicknames; it reads them from the API response.

---

## 5. Backend Gap Plan

### 5.1 `GET /api/orders` — Paginated Order List

The backend already has this endpoint. It's implemented in:
- Handler: `apps/api/src/modules/orders/api/orders-handler.ts:handleList()`
- Service: `apps/api/src/modules/orders/application/list-orders.ts:ListOrdersService.execute()`
- Repository: `apps/api/src/modules/orders/data/sqlite-order-repository.ts:list()`

**Query params (already supported):**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | number | 1 | 1-indexed |
| `pageSize` | number | 50 | max 500 |
| `orderStatus` | string | — | `'awaiting_shipment'` \| `'shipped'` \| `'cancelled'` |
| `storeId` | number | — | Filter by ShipStation store |
| `clientId` | number | — | Filter by client |
| `dateStart` | string | — | ISO date `YYYY-MM-DD` |
| `dateEnd` | string | — | ISO date `YYYY-MM-DD` |

**Response shape (from `ListOrdersService.execute()`):**

```typescript
interface ListOrdersResponse {
  orders: OrderSummaryDto[];    // Array of orders with label/rate data
  page: number;
  pages: number;
  total: number;
}
```

**Frontend integration:**

```typescript
// src/api/orders.ts
export async function listOrders(params: OrdersQueryParams): Promise<ListOrdersResponse> {
  return request<ListOrdersResponse>('GET', '/orders', {
    query: {
      page: params.page,
      pageSize: params.pageSize,
      orderStatus: params.status,
      storeId: params.storeId,
      clientId: params.clientId,
      dateStart: params.dateStart,
      dateEnd: params.dateEnd,
    },
  });
}
```

**Status:** ✅ Endpoint exists in `apps/api/`. Frontend just needs to wire `src/api/orders.ts` to call it. The `ordersStore.fetchOrders()` should use this endpoint for the paginated view instead of filtering `allOrders` in-memory. However, for the initial migration, in-memory filtering of `allOrders` is acceptable as a simpler path (the sync already loads all orders).

---

### 5.2 `GET /api/orders/:orderId` — Single Order Detail

The backend already has this endpoint:
- Handler: `orders-handler.ts:handleGetById(orderId)`
- Service: `order-details.ts:OrderDetailsService.execute(orderId)`

**Response shape:** Same `OrderSummaryDto` as the list endpoint, but for a single order.

**Frontend integration:**

```typescript
// src/api/orders.ts
export async function getOrder(orderId: number): Promise<OrderSummaryDto> {
  return request<OrderSummaryDto>('GET', `/orders/${orderId}`);
}
```

**Status:** ✅ Endpoint exists. Wire it up.

---

### 5.3 `GET /api/clients` — Client List

The backend already has this endpoint:
- Handler: `clients-handler.ts:handleList()`
- Service: `client-services.ts:ClientServices.list()`
- Repository: `sqlite-client-repository.ts:listActive()`

**Query:** No params. Returns all active clients.

**Response shape:**

```typescript
// Array of ClientDto
[
  {
    clientId: 10,
    name: "KF Goods",
    storeIds: [123456, 789012],
    contactName: "...",
    email: "...",
    phone: "...",
    active: true,
    hasOwnAccount: true,
    rateSourceClientId: null,
    rateSourceName: "DR PREPPER"
  },
  // ...
]
```

**Frontend integration:**

```typescript
// src/api/clients.ts
export async function listClients(): Promise<Client[]> {
  return request<Client[]>('GET', '/clients');
}
```

**Status:** ✅ Endpoint exists. Wire it up.

---

### 5.4 Summary: No Backend Gaps

All three "missing" P1 endpoints already exist in the `apps/api/` backend. They were built by DJ in the existing codebase. The frontend simply needs to call them via the API client. No new Express routes or SQLite queries needed.

The only actual backend work needed is ensuring the Express server routes are wired up and the client's `API_BASE` points to the correct host.

---

## 6. File Kill List

### Files to DELETE

| File | Reason | Replacement |
|------|--------|-------------|
| `src/utils/billingService.ts` | Duplicate of `services/billingService.ts` | `src/services/BillingService.ts` |
| `src/utils/markupService.ts` | Wrong data model (MarkupRule[]) | `src/services/MarkupService.ts` |
| `src/utils/rateFetchCache.ts` | Direct ShipStation calls (bypasses proxy) | Server-side rate cache |
| `src/utils/rateCache.ts` | Cache key generation (server concern) | Server-side |
| `src/utils/residentialService.ts` | Moves to services/ | `src/services/ResidentialService.ts` |
| `src/utils/markups.ts` | Logic moves to MarkupService | `src/services/MarkupService.ts` |
| `src/stores/orderDetailStore.ts` | Absorbed into ordersStore.allOrders | `ordersStore.allOrders.find()` |
| `src/stores/labelStore.ts` | Absorbed into ordersStore.addLabel() | `ordersStore` + `useCreateLabel` hook |
| `src/stores/markupsStore.ts` | Duplicate of markupStore.ts | `src/stores/markupStore.ts` |
| `src/server/*` | Backend code in frontend src/ | `apps/api/` |
| `src/api/proxyClient.ts` | Absorbed into `src/api/client.ts` | `src/api/client.ts` (unified base) |

### Files to KEEP (with modifications)

| File | Modification |
|------|-------------|
| `src/types/orders.ts` | Remove `BillingCalculation`, `StoreDTO`, `OrderLabelLegacy`, DTO bloat fields. Add `OrderLabel` cleanup |
| `src/types/billing.ts` | Rewrite to canonical `BillingRecord` + `BillingPreview` |
| `src/stores/ordersStore.ts` | Remove `applyMarkupToOrders()`, `enrichOrdersWithRates()`, billing cross-store call in `markOrderAsShipped()` |
| `src/services/billingService.ts` | Rename `calculateBilling` to `preview`, return `BillingPreview` not `BillingCalculation` |
| `src/api/billingApi.ts` | Keep — properly structured. Rename `apiRequest` base URL to import from `client.ts` |
| `src/utils/orders.ts` | Remove `isResidential()` (use ResidentialService). Keep display utils: `ageHours`, `ageColor`, `ageDisplay`, `getPrimarySku`, `getTotalQty`, `getOrderWeight`, `getOrderDimensions`, `getOrderZip`, `fmtWeight`, `fmtDate`, `fmtCurrency` |
| `src/stores/markupStore.ts` | Keep as canonical markup state |

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/services/MarkupService.ts` | Static methods for markup application (from utils/markups.ts) |
| `src/services/ResidentialService.ts` | Tristate residential inference (from utils/residentialService.ts) |
| `src/services/OrderService.ts` | Domain logic: filter, sort, group, normalize |
| `src/services/RateService.ts` | Rate request building, normalization |
| `src/services/LabelService.ts` | Label creation orchestration |
| `src/api/client.ts` | Unified API base client (absorb proxyClient.ts) |
| `src/api/orders.ts` | `listOrders()`, `getOrder()` |
| `src/api/clients.ts` | `listClients()` |
| `src/api/rates.ts` | `fetchRates()` |
| `src/api/labels.ts` | `createLabel()` |
| `src/api/settings.ts` | `getBillingSettings()`, `putBillingSettings()`, `getMarkups()`, `putMarkups()` |
| `src/types/clients.ts` | `Client` interface |
| `src/types/printQueue.ts` | `PrintQueueItem` interface |
| `src/stores/clientsStore.ts` | Renamed from storesStore.ts |
| `src/stores/printQueueStore.ts` | New — print queue state |
| `src/stores/ratesStore.ts` | New — rate cache + selection state |

---

## Appendix A: Violation Summary Table

| # | Violation | Severity | Status |
|---|-----------|----------|--------|
| 1.1 | 3 billing formula implementations | CRITICAL | Fix: delete utils version, align services version with backend |
| 1.2 | 2 roundToNearestCent() copies | HIGH | Fix: delete utils version |
| 1.3 | 2 BillingCalculation types | CRITICAL | Fix: delete utils version, rewrite types/billing.ts |
| 1.4 | 4 residential detection implementations | HIGH | Fix: single ResidentialService |
| 1.5 | 3 markup systems | CRITICAL | Fix: single MarkupService with MarkupsMap model |
| 1.6 | 3 rate fetching layers | HIGH | Fix: single path through server proxy |
| 1.7 | 2 markup store files | MEDIUM | Fix: merge into markupStore |
| 1.8 | server/ directory in frontend | MEDIUM | Fix: delete |
| 1.9 | 3 orphan stores | MEDIUM | Fix: absorb into parent stores |
| 1.10 | RateResult vs Rate type | HIGH | Fix: use canonical Rate only |
| 1.11 | ordersStore→billingStore coupling | MEDIUM | Fix: move trigger to useCreateLabel hook |
| 1.12 | OrderItem vs OrderDTOItem | LOW | Keep: intentional DTO/domain separation |
| 1.13 | Frontend vs backend billing settings | CRITICAL | Fix: align with backend model |
| 1.14 | StoreDTO vs ClientDto | MEDIUM | Fix: delete StoreDTO, use Client |
| 1.15 | API_BASE in 3 places | MEDIUM | Fix: single export from api/client.ts |

**CRITICAL violations: 4** — must fix before any feature work  
**HIGH violations: 4** — fix in Phase 4 (service layer)  
**MEDIUM violations: 5** — fix opportunistically  
**LOW violations: 1** — keep as-is  

---

## Appendix B: Rounding Contract Test

Both frontend and backend must pass this test vector:

```typescript
// Contract test: roundToNearestCent()
const testCases: [number, number][] = [
  [118.445, 118.44],   // half → round to even (4)
  [118.455, 118.46],   // half → round to even (6)
  [0.5, 0.00],         // half → round to even (0)
  [1.5, 2.00],         // half → round to even (2)
  [2.5, 2.00],         // half → round to even (2)
  [3.5, 4.00],         // half → round to even (4)
  [0.015, 0.02],       // normal rounding up
  [0.014, 0.01],       // normal rounding down
  [100.00, 100.00],    // exact
  [0.00, 0.00],        // zero
];
```

This is non-negotiable. If backend and frontend disagree on any of these, billing is broken.

---

_End of blueprint. This document is the engineering specification for the drprepperusa-kayla-parallel refactoring. No future PR may contradict it without first updating this document._

---

## DECISION LOG

### Billing Formula Decision — 2026-03-27

**Decision:** Use Option B (backend billing model) as canonical.

**Backend billing model (canonical):**
```typescript
// Per-client billing config from GET /api/billing/config
{
  pickPackFee: number;          // flat fee per order
  additionalUnitFee: number;    // per unit beyond first
  packageCostMarkup: number;    // % markup on package cost
  shippingMarkupPct: number;    // % markup on shipping cost
  shippingMarkupFlat: number;   // flat markup on shipping cost
  storageFeePerCuFt: number;    // storage fee
}

// Billing calculation:
// total = pickPackFee
//       + (qty - 1) × additionalUnitFee
//       + shippingCost × (1 + shippingMarkupPct/100) + shippingMarkupFlat
//       + packageCost × (1 + packageCostMarkup/100)
//       + storageFee
```

**Action items:**
- [ ] **TODO (DJ required):** Confirm this is the correct billing model before implementing
- [ ] Delete `src/utils/billingService.ts` (simplified approximation)
- [ ] Replace `src/services/billingService.ts` formula with backend model
- [ ] Add `GET /api/billing/config` frontend wiring to `settingsStore`
- [ ] Frontend shows billing as "estimate" until backend computes real invoice

**Status:** LOCKED AS OPTION B pending DJ confirmation
