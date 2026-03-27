# FINAL-REFACTOR-STRATEGY.md — Definitive Execution Plan

> **Version:** 1.0.0 — March 27, 2026  
> **Status:** FINAL — This is the execution document. Supersedes REFACTOR-BLUEPRINT.md and ARCHITECTURE.md.  
> **Source repo:** `dannyjeon/prepship-v2` (backend `apps/api/` + frontend `prepship-v3/`)  
> **Target repo:** `kaylafromsd/drprepperusa-kayla-parallel`

---

## A. Executive Summary

### What prepship-v2 Actually Is

PrepShip is a **multi-tenant 3PL order management system** built by DJ for DR Prepper Fulfillment. The backend (`apps/api/`) is a production-grade Express+SQLite application with 16 domain modules: orders, billing, clients, rates, labels, settings, shipments, packages, inventory, locations, products, manifests, analysis, queue, and init. It exposes ~60 API endpoints via a hand-rolled router in `create-app.ts`. The frontend (`prepship-v3/`) is a React 19 + Vite app with a typed `ApiClient` class that consumes these endpoints.

The target repo (`drprepperusa-kayla-parallel`) is a parallel frontend being built with Rsbuild + Zustand. It has working stores, types, services, hooks, and components but suffers from **15 DRY/SSOT violations** — 4 critical, 4 high, 6 medium, 1 low — accumulated during rapid feature development across 8 PRs.

### Target State

A clean frontend with:
- **1 type per concept** (no duplicate `BillingCalculation`, no `MarkupRule` vs `MarkupsMap`, no `RateResult` vs `Rate`)
- **1 service per domain** (billing, markup, residential, rate, label — all in `src/services/`)
- **1 API path per operation** (all through `src/api/client.ts`, no direct ShipStation calls)
- **Zero orphan stores** (orderDetailStore, labelStore, markupsStore absorbed)
- **Zero dead code** (`src/server/`, `src/utils/billingService.ts`, `src/utils/rateFetchCache.ts` deleted)

### Scope

| Metric | Count |
|--------|-------|
| Files to delete | 16 |
| Files to create | 14 |
| Files to modify | 10 |
| Test files to delete (obsoleted) | 5 |
| Net file count change | –7 |
| Violations eliminated | 15 |

### Risk Assessment

**Overall risk: MEDIUM.** The codebase has real consumers (components import from orphan stores, ordersStore imports from `markupService.ts` and `rateFetchCache.ts`). Deleting files without updating importers will break the build. The sprint plan below sequences deletions to always happen AFTER their replacement is wired up.

**Highest-risk items:**
1. **ordersStore.ts rewrite** (Sprint 3) — largest single file, most import dependencies
2. **Billing formula alignment** (Sprint 4) — must match backend; requires DJ confirmation
3. **proxyClient.ts removal** (Sprint 2) — 4 hooks import from it

---

## B. Violation Severity Matrix

| # | Violation | Severity | Sprint | Safe to delete before replacement? |
|---|-----------|----------|--------|-------------------------------------|
| V1.1 | 3 billing formula implementations (`utils/billingService.ts`, `services/billingService.ts`, backend) | CRITICAL | 4 | NO — `services/billingService.ts` is imported by `ordersStore.ts` |
| V1.2 | 2 `roundToNearestCent()` copies | HIGH | 4 | YES — `utils/billingService.ts` has no direct importers (only its type is used) |
| V1.3 | 2 `BillingCalculation` types (`types/orders.ts` vs `utils/billingService.ts`) | CRITICAL | 1 | YES — `utils/billingService.ts` type is not imported externally |
| V1.4 | 4 residential detection implementations | HIGH | 4 | NO — `utils/orders.ts:isResidential()` is used by components |
| V1.5 | 3 markup systems (`markupService.ts`, `markups.ts`, prepship-v3 context) | CRITICAL | 3 | NO — `ordersStore.ts` imports `markupService.ts` directly |
| V1.6 | 3 rate fetching layers (`rateFetchCache`, `proxyClient`, `ordersStore.enrichOrdersWithRates`) | HIGH | 2+3 | NO — `ordersStore.ts` imports `rateFetchCache.ts` |
| V1.7 | 2 markup store files (`markupsStore.ts`, `markupStore.ts`) | MEDIUM | 3 | NO — `OrdersView.tsx` imports `markupsStore` |
| V1.8 | `src/server/` directory in frontend | MEDIUM | 1 | YES — no production imports from outside `src/server/` |
| V1.9 | 3 orphan stores (`orderDetailStore`, `labelStore`, `storesStore`) | MEDIUM | 3 | NO — components import them |
| V1.10 | `RateResult` vs `Rate` type | HIGH | 2 | N/A — `RateResult` lives in prepship-v3, not target repo |
| V1.11 | `ordersStore` → `billingStore` cross-store coupling | MEDIUM | 3 | N/A — code modification, not deletion |
| V1.12 | `OrderItem` vs `OrderDTOItem` | LOW | — | KEEP — intentional DTO/domain separation |
| V1.13 | Frontend vs backend billing settings | CRITICAL | 4 | N/A — requires new API wiring, not deletion |
| V1.14 | `StoreDTO` vs `ClientDto` | MEDIUM | 1 | YES — `StoreDTO` is declared but barely used |
| V1.15 | API base URL in 3 places | MEDIUM | 2 | NO — must create unified client first |

---

## C. Sprint Execution Plan

### Sprint 1: Type Foundation + Dead Code Removal

**Goal:** Establish canonical types and remove obviously dead code that nothing imports.

**Blocks:** None (can start immediately).

**Order of operations:**
1. Create new type files
2. Modify `types/orders.ts` to remove dead types
3. Delete dead code

**Files to create:**

| Path | Contents |
|------|----------|
| `src/types/clients.ts` | `Client` interface (mirrors backend `ClientDto`) |
| `src/types/printQueue.ts` | `PrintQueueItem` interface |
| `src/types/sync.ts` | `SyncResult`, `NormalizedOrder`, `SyncState` interfaces |

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/types/orders.ts` | Remove `StoreDTO` (line ~280), `OrderLabelLegacy` type alias. Add comment "→ Use `Client` from `types/clients.ts`". Keep all other types (they have active consumers). |
| `src/types/billing.ts` | Add `BillingRecord` + `BillingPreview` types alongside existing content (DO NOT delete existing types yet — `billingStore.ts` imports them). |

**Files to delete:**

| Path | Reason | Consumers check |
|------|--------|-----------------|
| `src/server/auth.ts` | Backend code in frontend | No imports outside `src/server/` |
| `src/server/handlers.ts` | Backend code in frontend | No imports outside `src/server/` |
| `src/server/rateLimiter.ts` | Backend code in frontend | No imports outside `src/server/` |
| `src/server/types.ts` | Backend code in frontend | No imports outside `src/server/` |
| `src/server/proxy.test.ts` | Test for deleted code | — |

**Verification:**
```bash
cd /Users/albert_mini/workspace/projects/kaylafromsd/drprepperusa-kayla-parallel
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```

**Rollback:** `git stash` or `git checkout -- .`

---

### Sprint 2: Unified API Client + Hooks Rewire

**Goal:** Single API entry point; all hooks use `src/api/client.ts` instead of `proxyClient.ts`.

**Blocks:** Sprint 1 complete (new types available).

**Order of operations:**
1. Create new API modules (`orders.ts`, `rates.ts`, `labels.ts`, `settings.ts`, `clients.ts`, `sync.ts`)
2. Modify existing hooks to import from new API modules instead of `proxyClient.ts`
3. Delete `proxyClient.ts`, `shipstationClient.ts`, `rateService.ts` (api version)

**Files to create:**

| Path | Contents |
|------|----------|
| `src/api/orders.ts` | `listOrders()`, `getOrder()`, `storeCounts()` — wraps `api/client.ts` |
| `src/api/rates.ts` | `fetchRates()`, `cacheStats()` |
| `src/api/labels.ts` | `createLabel()`, `voidLabel()`, `retrieveLabel()` |
| `src/api/settings.ts` | `getBillingSettings()`, `putBillingSettings()`, `getMarkups()`, `putMarkups()` |
| `src/api/clients.ts` | `listClients()` |
| `src/api/sync.ts` | `runSync()` |

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/api/client.ts` | Already has `ApiClient` class. Add `export const API_BASE = import.meta.env.PUBLIC_API_BASE \|\| '/api'` as the single source for base URL. Export singleton `apiClient`. |
| `src/hooks/useAutoSync.ts` | Replace `import { syncViaProxy } from '../api/proxyClient'` → `import { runSync } from '../api/sync'` |
| `src/hooks/useSync.ts` | Same rewire from `proxyClient` → `api/sync` |
| `src/hooks/useRates.ts` | Replace `import { fetchRatesFromProxy } from '../api/proxyClient'` → `import { fetchRates } from '../api/rates'` |
| `src/hooks/useCreateLabel.ts` | Replace `import { createLabelViaProxy } from '../api/proxyClient'` → `import { createLabel } from '../api/labels'` |
| `src/api/billingApi.ts` | Replace hardcoded base URL → `import { API_BASE } from './client'` |

**Files to delete:**

| Path | Reason | Safety |
|------|--------|--------|
| `src/api/proxyClient.ts` | Absorbed into per-domain API modules | ✅ After hooks rewired |
| `src/api/proxyClient.test.ts` | Test for deleted file | — |
| `src/api/shipstationClient.ts` | Direct ShipStation calls — server concern | ⚠️ `services/labelService.ts`, `services/rateService.ts`, `services/syncService.ts` import it. Delete these services' ShipStation deps in Sprint 4 when services are rewritten. **KEEP FOR NOW.** |

**CORRECTION from blueprint:** `shipstationClient.ts` CANNOT be deleted in Sprint 2. Three services import it. It gets deleted in Sprint 4 when those services are rewritten.

**Files to delete (Sprint 2 safe):**

| Path | Reason |
|------|--------|
| `src/api/proxyClient.ts` | All 4 hook consumers rewired |
| `src/api/proxyClient.test.ts` | Test for deleted file |

**Verification:**
```bash
npx tsc --noEmit
npm run build
# Manual: hooks/useAutoSync.ts, useSync.ts, useRates.ts, useCreateLabel.ts all compile
grep -r "proxyClient" src/ --include="*.ts" --include="*.tsx" | grep -v ".test." | grep -v "node_modules"
# Should return 0 results
```

**Rollback:** `git checkout -- src/hooks/ src/api/`

---

### Sprint 3: Store Consolidation + Markup Unification

**Goal:** Eliminate orphan stores and the wrong markup system; `ordersStore.ts` cleaned of cross-store coupling and direct ShipStation calls.

**Blocks:** Sprint 2 complete (API modules available for rate/label calls).

**Order of operations:**
1. Create `MarkupService.ts` (from `utils/markups.ts`)
2. Create `ratesStore.ts`, `clientsStore.ts`, `printQueueStore.ts`
3. Modify `ordersStore.ts` to remove `applyMarkupToOrders`, `enrichOrdersWithRates`, cross-store billing call
4. Modify components to use new stores instead of orphan stores
5. Delete orphan stores and `utils/markupService.ts`

**Files to create:**

| Path | Contents |
|------|----------|
| `src/services/MarkupService.ts` | Static class: `getCarrierMarkup()`, `applyCarrierMarkup()`, `pickBestRate()`, `isOrionRate()`, `priceDisplay()`, `formatOrionRateDisplay()`, `isBlockedRate()` — ported from `utils/markups.ts` |
| `src/stores/ratesStore.ts` | `ratesMap`, `loading`, `error`, `selectedRates`, `fetchRates()`, `selectRate()`, `clearAll()` |
| `src/stores/clientsStore.ts` | `clients`, `loading`, `loadClients()` — renamed from `storesStore.ts` concept |
| `src/stores/printQueueStore.ts` | `queue`, `printing`, `enqueue()`, `dequeue()`, `printAll()` |

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/stores/ordersStore.ts` | (1) Remove `import { getMarkupRuleForCarrier, applyMarkup } from '../utils/markupService'` (2) Remove `import { getCachedOrFetchedRate } from '../utils/rateFetchCache'` (3) Remove `import { buildRateFetchRequest } from '../api/rateService'` (4) Remove `applyMarkupToOrders` method (5) Remove `enrichOrdersWithRates` method (6) In `markOrderAsShipped`: remove `useBillingStore.getState().calculateBilling()` call — billing trigger moves to `useCreateLabel` hook (7) Remove `import { useBillingStore }` |
| `src/stores/markupStore.ts` | Add `MarkupsMap`-based `loadMarkups()` action that calls `api/settings.getMarkups()`. Keep existing `MarkupRule[]` state temporarily for backward compat with any consumers. |
| `src/components/OrdersView/OrdersView.tsx` | Replace `import { useMarkupsStore }` → `import { useMarkupStore }`. Replace `import { useOrderDetailStore }` → derive from `ordersStore.allOrders`. Replace `import { useStoresStore }` → `import { useClientsStore }` from `clientsStore`. |
| `src/components/Sidebar/Sidebar.tsx` | Replace `import { useStoresStore }` → `import { useClientsStore }` |
| `src/components/OrderDetail/OrderDetail.tsx` | Replace `import { useOrderDetailStore }` → derive from `ordersStore.allOrders.find()` |
| `src/components/PrintLabelButton/PrintLabelButton.tsx` | Replace `import { useLabelStore }` → use `printQueueStore.enqueue()` + `ordersStore.addLabel()` |
| `src/components/Billing/BillingSection.tsx` | Replace `import { useStoresStore }` → `import { useClientsStore }` |

**Files to delete:**

| Path | Reason | Safety |
|------|--------|--------|
| `src/stores/markupsStore.ts` | Duplicate of `markupStore.ts` | ✅ After `OrdersView.tsx` rewired |
| `src/stores/orderDetailStore.ts` | Absorbed into `ordersStore.allOrders.find()` | ✅ After components rewired |
| `src/stores/labelStore.ts` | Absorbed into `ordersStore.addLabel()` + `printQueueStore` | ✅ After `PrintLabelButton` rewired |
| `src/stores/storesStore.ts` | Renamed to `clientsStore.ts` | ✅ After components rewired |
| `src/utils/markupService.ts` | Wrong model (MarkupRule[]) | ✅ After ordersStore rewired |
| `src/utils/markupService.test.ts` | Test for deleted file | — |

**Verification:**
```bash
npx tsc --noEmit
npm run build
grep -r "markupsStore\|orderDetailStore\|labelStore\|storesStore" src/ --include="*.ts" --include="*.tsx" | grep -v ".test."
# Should return 0 results
grep -r "rateFetchCache\|markupService" src/stores/ --include="*.ts"
# Should return 0 results
```

**Rollback:** `git checkout -- src/stores/ src/components/`

---

### Sprint 4: Service Layer + Billing Alignment

**Goal:** All business logic in `src/services/`, billing formula aligned with backend, dead utils deleted.

**Blocks:** Sprint 3 complete. **DJ confirmation of billing model required** before implementing `BillingService.preview()`.

**Order of operations:**
1. Create service classes
2. Rewire services that import `shipstationClient.ts`
3. Delete dead utils and `shipstationClient.ts`

**Files to create:**

| Path | Contents |
|------|----------|
| `src/services/ResidentialService.ts` | Class wrapping `inferResidential()` from `utils/residentialService.ts`. Add `isResidential(order)` that checks explicit flag first, then delegates. |
| `src/services/OrderService.ts` | Static methods: `applyFilter()`, `sortByAge()`, `groupByRateKey()`, `normalizeItem()`. Delegates residential check to `ResidentialService`. |
| `src/services/RateService.ts` | Static methods: `buildFetchParams()`, `normalizeRate()`, `sortByPrice()`. NO cache key generation (server concern). |
| `src/services/LabelService.ts` | Static methods: `validateCreateRequest()`, `buildCreateRequest()`, `normalizeResponse()`. No ShipStation dependency. |
| `src/services/BillingService.ts` | REWRITE of `services/billingService.ts`. Implements `preview()` returning `BillingPreview` (simplified estimate). Implements `roundToNearestCent()`. Removes `calculateBilling()`, `calculateBillingOrThrow()`, `quickBillingTotal()`. |

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/services/billingService.ts` | REPLACED by `BillingService.ts` (capital B). The old file is deleted after the new one is created and all consumers updated. |
| `src/stores/ordersStore.ts` | `calculateOrderCosts` method: change `import { calculateBilling }` → `import { BillingService }` and call `BillingService.preview()` |
| `src/utils/orders.ts` | Remove `isResidential()` function. Keep all display utilities. |
| `src/hooks/useCreateLabel.ts` | (1) Remove `import { createLabelViaProxy }` (already done Sprint 2) (2) Add billing trigger: after `ordersStore.addLabel()`, call `billingStore.calculateBilling()`. This is where cross-store billing trigger now lives. |

**Files to delete:**

| Path | Reason | Safety |
|------|--------|--------|
| `src/utils/billingService.ts` | Duplicate formula, own `BillingCalculation` type | ✅ No external importers (verified via grep) |
| `src/utils/billingService.test.ts` | Test for deleted file | — |
| `src/utils/rateFetchCache.ts` | Direct ShipStation calls, client-side cache | ✅ After ordersStore import removed (Sprint 3) |
| `src/utils/rateFetchCache.test.ts` | Test for deleted file | — |
| `src/utils/rateCache.ts` | Cache key generation (server concern) | ✅ Only imported by `rateFetchCache.ts` |
| `src/utils/rateCache.test.ts` | Test for deleted file | — |
| `src/utils/residentialService.ts` | Moved to `services/ResidentialService.ts` | ✅ After service created |
| `src/utils/residentialService.test.ts` | Test for deleted file (rewrite tests for service) | — |
| `src/api/rateService.ts` | ShipStation-direct rate fetch | ✅ After ordersStore import removed (Sprint 3) |
| `src/api/rateService.test.ts` | Test for deleted file | — |
| `src/api/shipstationClient.ts` | Direct ShipStation V1/V2 calls | ✅ After `services/labelService.ts`, `services/rateService.ts`, `services/syncService.ts` rewritten to use API modules |
| `src/services/billingService.ts` | Replaced by `BillingService.ts` | ✅ After consumers updated |

**CORRECTION from blueprint:** The old `services/billingService.ts` (lowercase) is the one `ordersStore.ts` imports. It must NOT be deleted until `BillingService.ts` (capital B) exists and `ordersStore` is rewired. Sprint 4 handles this correctly by creating first, then deleting.

**Also:** `services/labelService.ts`, `services/rateService.ts`, and `services/syncService.ts` import `shipstationClient.ts`. These three services need their ShipStation dependencies removed — they should call the API modules from Sprint 2 instead.

**Verification:**
```bash
npx tsc --noEmit
npm run build
grep -r "utils/billingService\|utils/rateFetchCache\|utils/rateCache\|utils/residentialService\|shipstationClient" src/ --include="*.ts" --include="*.tsx" | grep -v ".test."
# Should return 0 results
```

**Rollback:** `git checkout -- src/services/ src/utils/ src/stores/ordersStore.ts`

---

### Sprint 5: Feature Parity + Component Wiring

**Goal:** All components wired to the clean service/store/API architecture. Full end-to-end flow works.

**Blocks:** Sprint 4 complete.

**Files to create:**

| Path | Contents |
|------|----------|
| `src/hooks/useOrders.ts` | Subscribe to `ordersStore` paginated slice. Convenience hook. |
| `src/hooks/useOrderDetail.ts` | `allOrders.find(o => o.id === id)` — replaces `orderDetailStore` usage. |
| `src/hooks/useBilling.ts` | Subscribe to `billingStore.records.get(orderId)`. |
| `src/hooks/useSettings.ts` | Load/save settings via `settingsStore`. |
| `src/utils/format.ts` | `formatCurrency()`, `formatAddress()`, `formatTrackingUrl()` |

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/components/RightPanel/SingleOrderPanel.tsx` | Wire to `ratesStore` + `MarkupService` for rate display |
| `src/components/RightPanel/BatchPanel.tsx` | Wire to `ratesStore` + `printQueueStore` for batch operations |
| `src/components/Shipment/ShippingPanel.tsx` | Use `MarkupService.applyCarrierMarkup()` for display, `MarkupService.priceDisplay()` for breakdown |

**Files to delete:**

| Path | Reason |
|------|--------|
| `src/utils/markups.ts` | Logic fully ported to `services/MarkupService.ts` in Sprint 3 |

**CORRECTION from blueprint:** `utils/markups.ts` is NOT deleted in Sprint 3. Components may still import it during Sprint 3/4. It's deleted here in Sprint 5 after `MarkupService.ts` is fully wired into all components.

**Verification:**
```bash
npx tsc --noEmit
npm run build
# Manual acceptance tests:
# □ App loads → settings load → sync fires
# □ Orders list populates after sync
# □ Click order → rates appear in right panel
# □ Markups correctly applied to rate display
# □ ORION rates show base cost + marked price
# □ Create Label → status → 'shipped', billing record auto-created
# □ Queue for Print → console.log fires
# □ Settings page: update values → billing formula updates
```

**Rollback:** `git checkout -- src/hooks/ src/components/ src/utils/`

---

### Sprint 6: Cleanup + Validation

**Goal:** Zero dead code, zero duplicate types, all tests passing.

**Blocks:** Sprint 5 complete.

**Files to modify:**

| Path | Changes |
|------|---------|
| `src/types/orders.ts` | Remove all deprecated fields/comments: `baseRate` alias on `BillingCalculation`, `residentialSurcharge` alias, `enrichedRate`/`ratesFetched`/`rateError` from `OrderDTO`, `calculatedCost`/`billingCalculation` from `OrderDTO`, inline `label` type from `OrderDTO`. Remove `SelectedRate` interface (replaced by `Rate`). Remove `OrderLabelLegacy` alias. Remove `ColumnDef` if unused. |
| `src/types/billing.ts` | Remove old `BillingSettings` simplified type if superseded by backend config type. |
| `src/api/mock-data.ts` | Keep for dev-mode fallback but add `// TODO: remove when full sync is live` comment. |

**Files to delete:**

| Path | Reason |
|------|--------|
| `src/utils/orderFilters.ts` | Functionality moved to `OrderService.applyFilter()` |

**Verification:**
```bash
npx tsc --noEmit
npm run build
# Verify no dead imports:
grep -r "from.*markupService\|from.*rateFetchCache\|from.*rateCache\|from.*billingService.*utils\|from.*proxyClient\|from.*shipstationClient\|from.*orderDetailStore\|from.*labelStore\|from.*markupsStore\|from.*storesStore\|from.*residentialService.*utils" src/ --include="*.ts" --include="*.tsx" | grep -v ".test." | grep -v "node_modules"
# Should return 0 results
find src/ -name "*.ts" -o -name "*.tsx" | xargs grep -l "TODO\|FIXME\|HACK" | head -20
```

**Rollback:** `git checkout -- src/types/`

---

## D. Canonical Type Definitions

### `src/types/orders.ts`

```typescript
export type OrderId = string;
export type OrderStatus = 'awaiting_shipment' | 'shipped' | 'cancelled';

export interface Order {
  id: OrderId;
  orderId: number;
  orderNum: string;
  clientId: string;
  storeId?: number;

  orderDate: Date;
  createdAt: Date;
  lastUpdatedAt: Date;

  customer: string;
  customerId?: string;
  shipTo: OrderShipToAddress;
  shipFrom: OrderShipFrom;

  items: OrderItem[];
  itemCount: number;
  itemNames: string[];
  skus: string[];

  weightOz: number;
  dimensions: OrderDimensionsIn;

  status: OrderStatus;
  externallyShipped: boolean;
  externallyShippedAt?: Date;

  label?: OrderLabel;
  billing?: BillingRecord;

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

// ── Legacy OrderDTO (kept for paginated view backward compat) ──

export interface OrderDTOItem {
  sku: string;
  quantity: number;
  name?: string;
  price?: number;
  imageUrl?: string;
  adjustment?: boolean;
}

export interface OrderDimensions {
  length: number;
  width: number;
  height: number;
}

export interface OrderWeight {
  value: number;
  units: 'ounces' | 'grams';
}

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

export interface ListOrdersResponse {
  orders: OrderDTO[];
  total: number;
  pages: number;
  currentPage: number;
  pageSize: number;
}
```

### `src/types/markups.ts`

```typescript
export type MarkupType = 'pct' | 'flat';

export interface Markup {
  type: MarkupType;
  value: number;
}

export type MarkupsMap = Record<number | string, Markup>;

export type RbMarkupsResponse = MarkupsMap;
```

### `src/types/billing.ts`

```typescript
import type { BillingRecord } from './billing';

export type RoundingMethod = 'bankers' | 'standard';

export interface BillingRecord {
  orderId: string;
  clientId: number;
  shippingCost: number;
  pickPackTotal: number;
  additionalTotal: number;
  packageTotal: number;
  shippingMarkupTotal: number;
  storageTotal: number;
  subtotal: number;
  totalCost: number;
  breakdown: string;
  calculatedAt: Date;
  roundingMethod: RoundingMethod;
  voided: boolean;
  voidedAt?: Date;
}

export interface BillingPreview {
  shippingCost: number;
  residentialSurcharge: number;
  markupPercent: number;
  estimatedTotal: number;
  breakdown: string;
}

export interface BillingClientConfig {
  clientId: number;
  clientName: string;
  pickPackFee: number;
  additionalUnitFee: number;
  packageCostMarkup: number;
  shippingMarkupPct: number;
  shippingMarkupFlat: number;
  billing_mode: string;
  storageFeePerCuFt: number;
  storageFeeMode: string;
  palletPricingPerMonth: number;
  palletCuFt: number;
}

export interface BillingSettings {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}

export interface CreateBillingBody {
  shippingCost: number;
  weightOz: number;
  carrierMarkupPercent: number;
  clientId: number;
}
```

### `src/types/clients.ts`

```typescript
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

### `src/types/printQueue.ts`

```typescript
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

### `src/types/sync.ts`

```typescript
export interface SyncResult {
  orders: NormalizedOrder[];
  syncedAt: Date;
  storeId?: number;
}

export interface NormalizedOrder {
  orderId: number;
  orderNumber: string;
  clientId: string;
  storeId: number;
  status: string;
  raw: Record<string, unknown>;
}

export interface SyncState {
  syncing: boolean;
  lastSyncTime: Date | null;
  lastSyncError: string | null;
}
```

---

## E. Service API Contracts

### `src/services/MarkupService.ts`

```typescript
import type { Rate } from '../types/orders';
import type { Markup, MarkupsMap } from '../types/markups';

export class MarkupService {
  static getCarrierMarkup(
    carrierCode: string | undefined,
    shippingProviderId: number | undefined,
    markupsMap: MarkupsMap,
  ): Markup;

  static applyCarrierMarkup(rate: Rate, markupsMap: MarkupsMap): number;

  static pickBestRate(
    rates: Rate[] | null,
    markupsMap: MarkupsMap,
    storeId?: number,
  ): Rate | null;

  static isBlockedRate(rate: Rate, storeId?: number): boolean;

  static isOrionRate(rate: Rate): boolean;

  static priceDisplay(
    rate: Rate,
    markupsMap: MarkupsMap,
  ): { display: string; basePrice: number; markupAmount: number; total: number };

  static formatOrionRateDisplay(
    rate: Rate,
    markupsMap: MarkupsMap,
    opts?: { mainSize?: string; subSize?: string; mainColor?: string },
  ): string;
}
```

### `src/services/BillingService.ts`

```typescript
import type { BillingPreview } from '../types/billing';

export interface BillingPreviewInput {
  shippingCost: number;
  residentialSurcharge: number;
  markupPercent: number;
}

export class BillingService {
  static preview(input: BillingPreviewInput): BillingPreview;

  static roundToNearestCent(amount: number): number;

  static validateInput(input: BillingPreviewInput): string | null;
}
```

### `src/services/ResidentialService.ts`

```typescript
import type { OrderDTO } from '../types/orders';

export type ResidentialTristate = boolean | null;

export interface ResidentialInferenceResult {
  isResidential: boolean;
  source: 'explicit' | 'source_flag' | 'company_name' | 'zip_commercial' | 'zip_residential' | 'default_fallback';
  zip?: string;
  reason: string;
}

export class ResidentialService {
  static inferResidential(
    residential: boolean | null | undefined,
    shipTo?: OrderDTO['shipTo'],
  ): ResidentialInferenceResult;

  static isResidential(order: OrderDTO): boolean;
}
```

### `src/services/OrderService.ts`

```typescript
import type { Order, OrderDTO, OrderDimensions } from '../types/orders';

export interface OrdersFilterOptions {
  search?: string;
  status?: string;
  clientId?: string;
  dateStart?: string;
  dateEnd?: string;
}

export class OrderService {
  static applyFilter(orders: Order[], filter: OrdersFilterOptions): Order[];

  static sortByAge(orders: OrderDTO[]): OrderDTO[];

  static getPrimarySku(order: OrderDTO): string;

  static getTotalQty(order: OrderDTO): number;

  static getExpedited(serviceCode?: string): '1-day' | '2-day' | null;

  static getOrderDimensions(order: OrderDTO): OrderDimensions | null;

  static getOrderWeight(order: OrderDTO): number;

  static getOrderZip(order: OrderDTO): string;

  static normalizeItem(dto: { sku: string; quantity: number; name?: string }): {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    weightOz: number;
  };
}
```

### `src/services/RateService.ts`

```typescript
import type { Rate, OrderDTO, OrderDimensions } from '../types/orders';
import type { MarkupsMap } from '../types/markups';

export interface RateFetchParams {
  fromZip: string;
  toZip: string;
  weightOz: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  residential: boolean;
  storeId?: number;
}

export class RateService {
  static buildFetchParams(
    order: OrderDTO,
    originZip: string,
  ): RateFetchParams | null;

  static normalizeRate(raw: Record<string, unknown>): Rate;

  static sortByPrice(rates: Rate[], markupsMap: MarkupsMap): Rate[];
}
```

### `src/services/LabelService.ts`

```typescript
import type { Order, OrderLabel, Rate } from '../types/orders';

export interface CreateLabelBody {
  orderId: number;
  serviceCode: string;
  carrierCode?: string;
  shippingProviderId: number;
  packageCode?: string;
  weightOz?: number;
  length?: number;
  width?: number;
  height?: number;
  confirmation?: string;
  testLabel?: boolean;
  shipTo?: Record<string, string>;
  shipFrom?: Record<string, string>;
}

export interface LabelApiResponse {
  shipmentId: number;
  trackingNumber: string;
  labelUrl: string | null;
  cost: number;
  voided: boolean;
  orderStatus: string;
  apiVersion: string;
}

export class LabelService {
  static buildCreateRequest(
    order: Order,
    rate: Rate,
    shipFrom: { name: string; street1: string; city: string; state: string; postalCode: string; country: string },
    testLabel?: boolean,
  ): CreateLabelBody;

  static validateCreateRequest(order: Order, rate: Rate): string | null;

  static normalizeResponse(raw: LabelApiResponse): OrderLabel;
}
```

---

## F. Open Questions (Require DJ Input)

Ranked by blocking impact:

| # | Question | Blocking? | Impact |
|---|----------|-----------|--------|
| 1 | **Is the billing formula `pickPackFee + additionalUnitFee + shippingMarkup + packageCostMarkup + storageFee` correct?** The backend `billing-services.ts` uses this model with `DEFAULT_BILLING_CONFIG = { pickPackFee: 3, additionalUnitFee: 0.75, ... }`. The frontend currently uses `(baseRate + residential) × (1 + markup%)`. Which is canonical? | YES — blocks Sprint 4 | Without confirmation, we can't rewrite `BillingService.ts`. Current plan: use backend model, frontend shows "estimate" until backend confirms. |
| 2 | **Should the frontend call `GET /api/billing/config` to get per-client billing config?** Backend already exposes this endpoint. If yes, `settingsStore` needs a `billingConfig: BillingClientConfig[]` field. | YES — blocks Sprint 4 | Determines whether frontend billing preview uses per-client config or simplified global settings. |
| 3 | **What are the ORION blocking rules?** `isBlockedRate()` is currently a stub returning `false`. The backend has `isBlockedRate()` in `prepship-config.ts`. Should the frontend mirror these rules, or should the backend filter blocked rates before sending? | NO — can ship with stub | Affects rate display accuracy. Backend filtering is cleaner but requires API change. |
| 4 | **Should `clientId` be `string` or `number` in the frontend?** Currently `Order.clientId` is `string` but `OrderDTO.clientId` is `number`. Backend `ClientRecord.clientId` is `number`. The store uses `activeClient: string | null`. | NO — can normalize later | Coercion bugs are possible. Recommend `number` everywhere, matching backend. |
| 5 | **Is `GET /api/settings/rbMarkups` the correct endpoint for loading `MarkupsMap`?** The prepship-v3 `MarkupsContext.tsx` fetches from this path. Need to confirm it exists and returns `Record<number\|string, { type: 'pct'\|'flat', value: number }>`. | NO — blocks markup loading but can fall back to empty map | If endpoint doesn't exist, markup display shows base prices only (acceptable degraded state). |

---

_End of document. This is the definitive execution plan for the drprepperusa-kayla-parallel refactoring. No PR may contradict it without first updating this document._
