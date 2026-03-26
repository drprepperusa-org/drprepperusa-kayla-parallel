# Phase 2 Architecture — Service Layer + Zustand Store Integration

**Status:** Complete  
**Date:** 2026-03-26  
**Confidence:** 93% (flagged items: Q1 provider ID mapping, Q6 external detection)

---

## Overview

Phase 2 delivers the service layer that powers real ShipStation API integration.
All services are **stateless pure functions** — no side effects, no store access.
Hooks bridge services to React components and the Zustand store.

```
React Components (ShippingPanel, ControlBar)
        ↓
    Hooks (useRates, useCreateLabel, useSync)
        ↓
  Services (rateService, labelService, syncService, billingService)
        ↓
  API Client (shipstationClient — V1 + V2)
        ↓
  ShipStation API (live or mock)
        ↓
  Zustand Store (OrdersStore) ← hooks dispatch results here
```

---

## File Index

| File | Role | API |
|------|------|-----|
| `src/api/shipstationClient.ts` | HTTP client, auth, retry | V1 + V2 |
| `src/services/rateService.ts` | Fetch rates, cache | V2 POST /rates |
| `src/services/labelService.ts` | Create labels, two-call flow | V2 POST /labels + V1 GET /shipments/{id} |
| `src/services/syncService.ts` | Incremental order sync | V1 GET /orders |
| `src/services/billingService.ts` | Billing formula, banker's rounding | Pure calculation |
| `src/hooks/useRates.ts` | Rate hook → ShippingPanel | — |
| `src/hooks/useCreateLabel.ts` | Label hook → ShippingPanel | — |
| `src/hooks/useSync.ts` | Sync hook → ControlBar | — |
| `.env.example` | Environment config | — |

---

## Service Layer Design

### Principles

1. **Pure functions** — no side effects, no store imports, no global state
2. **Result types** — all services return `{ ok: true, ... } | { ok: false, error }` — never throw
3. **Typed errors** — every error has a `code` string for programmatic handling
4. **Stateless** — services accept all needed state as parameters
5. **Mock-first** — mock responses in place until real API credentials are wired
6. **Immutable contracts** — OrderLabel shape and billing formula are locked

### Error Hierarchy

```
ShipStationError (from client)
  └── RateServiceError (from rateService)
  └── LabelServiceError (from labelService)
  └── SyncServiceError (from syncService)
  └── BillingServiceError (from billingService)
```

---

## API Contracts

### ShipStation V1

- **Base URL:** `https://ssapi.shipstation.com`
- **Auth:** Basic Auth — `Authorization: Basic base64(apiKey:apiSecret)`
- **Endpoints used:**
  - `GET /orders` — order sync (with `modifyDateStart` for incremental)
  - `GET /shipments/{shipmentId}` — V1 enrichment for label creation

### ShipStation V2

- **Base URL:** `https://api.shipstation.com/v2`
- **Auth:** API key header — `API-Key: {key}`
- **Endpoints used:**
  - `POST /rates` — fetch rates for a shipment
  - `POST /labels` — create a shipping label

### Two-Call Label Flow (IMMUTABLE — locked by DJ)

```
1. V2 POST /labels
   → trackingNumber, shipment_cost, carrier_code, service_code, label_download

2. V1 GET /shipments/{shipment_id from step 1}
   → providerAccountId (→ v1ShippingProviderId)
   → carrierCode (→ v1CarrierCode)

3. Merge into OrderLabel (immutable contract — types/orders.ts)
```

**Q1 PENDING:** Field path for `v1ShippingProviderId` in V1 response.
Current mapping: `response.providerAccountId ?? response.providerAccount?.providerAccountId`
If Q1 resolves differently, update `extractV1ShippingProviderId()` in `labelService.ts` only.

---

## Error Handling Strategy

### Client Layer (shipstationClient.ts)

| HTTP Status | Behavior |
|-------------|----------|
| 401 | Throw `ShipStationError(AUTH_ERROR)` — no retry |
| 400 | Throw `ShipStationError(BAD_REQUEST)` — no retry |
| 404 | Throw `ShipStationError(NOT_FOUND)` — no retry |
| 429 | Retry with exponential backoff (max 3 retries) |
| 5xx | Retry with exponential backoff (max 3 retries) |
| Timeout | `ShipStationError(TIMEOUT)` — no retry |
| Network | `ShipStationError(NETWORK_ERROR)` — retry |

### Service Layer

All services catch `ShipStationError` and re-wrap into typed service errors:

```ts
// rateService.ts returns:
type RateResult =
  | { ok: true; rates: ShipStationRate[]; cachedAt: Date; fromCache: boolean }
  | { ok: false; error: RateServiceError }

// labelService.ts returns:
type LabelResult =
  | { ok: true; label: OrderLabel }
  | { ok: false; error: LabelServiceError }

// syncService.ts returns:
type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; error: SyncServiceError }  // includes partialOrders on PARTIAL_FAILURE

// billingService.ts returns:
type BillingResult =
  | { ok: true; calculation: BillingCalculation }
  | { ok: false; error: BillingServiceError }
```

### Hook Layer

Hooks surface errors via `error` state field. Components show error UI.
Sync partial failures still update the store (progressive data).

---

## Caching Strategy

### Rate Cache (rateService.ts)

- **Type:** In-memory `Map<string, CacheEntry>` (module-level singleton)
- **TTL:** 30 minutes (configurable via `CACHE_TTL` env var)
- **Key format:** `originZip|destinationZip|weightOz|LxWxH|residential|carriers`
- **Scope:** Per browser session (cleared on page reload)
- **Invalidation:** `clearRateServiceCache()` — called by `useRates.refresh()`
- **Cache hit:** Returns `{ fromCache: true, cachedAt }` — no API call

### No Cache on Labels or Sync

- Labels are idempotent via the store (order.label field)
- Sync always fetches fresh — incremental window via `lastSyncTime`

---

## Immutable Contracts

Two contracts are locked and must not change without DJ approval:

### 1. OrderLabel (types/orders.ts)

```ts
interface OrderLabel {
  trackingNumber: string;    // V2: tracking_number
  shipmentCost: number;      // V2: shipment_cost.amount
  v2CarrierCode: string;     // V2: carrier_code
  serviceCode: string;       // V2: service_code
  labelUrl?: string;         // V2: label_download.pdf
  v1ShippingProviderId: number; // V1: providerAccountId (Q1 pending)
  v1CarrierCode: string;     // V1: carrierCode
  createdAt: Date;
  createdBy?: string;
  voided: boolean;
  voidedAt?: Date;
}
```

### 2. Billing Formula (billingService.ts)

```
cost = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)
```

Rounding: Banker's rounding (IEEE 754 round-half-to-even) to nearest $0.01

---

## Integration with OrdersStore

Services are stateless. Hooks bridge the gap:

### useRates → ShippingPanel

```
useRates(orderId)
  → reads order from store
  → calls rateService.fetchRates()
  → returns { rates, loading, error, fromCache }
  → does NOT write to store (rates are display-only)
```

### useCreateLabel → ShippingPanel

```
useCreateLabel(orderId)
  → reads order from store
  → calls labelService.createLabel()
  → on success: calls store.addLabel(orderId, label)
    → store transitions order to 'shipped'
  → returns { loading, error, label }
```

### useSync → ControlBar

```
useSync()
  → reads lastSyncTime + allOrders from store
  → calls store.startSync()
  → calls syncService.syncOrders()
  → on success: calls store.syncComplete(syncedAt, allOrders)
    → store merges incoming orders + updates sync state
  → on error: calls store.syncError(message)
  → returns { loading, error, lastSyncTime, lastSyncStats }
```

---

## Pending Questions

### Q1 (labelService.ts — HIGH priority)

**Question:** What is the exact JSON field path for `providerAccountId` in the V1 
`GET /shipments/{id}` response?

**Impact:** `v1ShippingProviderId` field in `OrderLabel`. Currently mapped via:
```ts
response.providerAccountId ?? response.providerAccount?.providerAccountId
```

**Action required:** DJ to verify field path against real V1 response.
**Location to fix:** `extractV1ShippingProviderId()` in `src/services/labelService.ts`

---

### Q6 (syncService.ts — MEDIUM priority)

**Question:** What defines an "externally shipped" or "externally cancelled" order?

**Impact:** `externallyShipped` detection in `syncService.ts`.

**Current heuristic:**
- Status === 'shipped' AND no label in the app's store

**Potential additions (pending Q6):**
- `shipDate` before app-launch cutoff
- Tracking number prefix pattern
- External source field in ShipStation

**Location to fix:** `detectExternallyShipped()` in `src/services/syncService.ts`

---

## Testing Approach

### Unit Tests (services — pure functions)

All services are pure functions — fully unit-testable without mocking React:

```ts
// billingService.test.ts
import { calculateBilling } from '../services/billingService';

test('applies 15% markup correctly', () => {
  const result = calculateBilling({ baseRate: 7.50, residentialSurcharge: 4.40, carrierMarkupPercent: 15 });
  expect(result.ok).toBe(true);
  expect(result.calculation.totalCost).toBe(13.68);
});
```

### Integration Tests (shipstationClient.ts)

Use `__setFetchFn` pattern (already in labelService.ts) to inject mock fetch:

```ts
import { __setFetchFn, __resetFetchFn } from '../utils/labelService';

beforeEach(() => __setFetchFn(mockFetch));
afterEach(() => __resetFetchFn());
```

### Hook Tests

Use `renderHook` from `@testing-library/react`:

```ts
const { result } = renderHook(() => useRates('order-123'), { wrapper: StoreProvider });
await waitFor(() => expect(result.current.loading).toBe(false));
expect(result.current.rates.length).toBeGreaterThan(0);
```

### Mock Mode

All services generate realistic mock responses when API credentials are absent.
This enables full UI testing without a real ShipStation account.

---

## Migration from Phase 1

Phase 1 components can integrate Phase 2 by:

1. **ShippingPanel** — replace hardcoded rate display with `useRates(orderId)`
2. **ShippingPanel** — replace label button with `useCreateLabel(orderId)` 
3. **ControlBar** — add Sync button wired to `useSync()`

No changes required to OrdersStore, types, or existing utilities.
