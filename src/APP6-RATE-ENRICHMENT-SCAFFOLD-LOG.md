# APP6 — Rate Enrichment Pipeline Scaffold Log

**Feature**: Feature 6 — Rate Enrichment Pipeline  
**Status**: SCAFFOLD (not yet functional — integration points documented below)  
**Branch**: `feature/rate-enrichment-scaffold`  
**Date**: 2026-03-25  
**Author**: Kayla (agent)

---

## What Was Built

### Files Added

| File | Purpose |
|------|---------|
| `src/api/rateService.ts` | ShipStation rate fetching service + rate selection + request builder |
| `src/utils/rateFetchCache.ts` | In-memory rate cache layer (Tier 1 cache key format) |
| `src/hooks/useRates.ts` | React Query hooks: `useOrderRates`, `useRefreshRates`, `useEnrichOrdersWithRates` |
| `src/api/rateService.test.ts` | 25 unit tests (validation, stub, selectBestRate, buildRateFetchRequest) |
| `src/utils/rateFetchCache.test.ts` | 16 unit tests (cache hit, miss, null, invalidation, invalid params) |

### Files Modified

| File | Change |
|------|--------|
| `src/types/orders.ts` | Added `SelectedRate` interface, `enrichedRate`, `ratesFetched`, `rateError` to `OrderDTO` |
| `src/stores/ordersStore.ts` | Added `enrichOrdersWithRates` action (interface + implementation) |
| `package.json` | Added `@tanstack/react-query` v5, `vitest` |

---

## Architecture Decisions

### 1. Separation of Concerns: rateService vs rateFetchCache

`rateService.ts` owns the ShipStation API contract (types, validation, best rate selection).  
`rateFetchCache.ts` owns the cache layer (Tier 1 key format, in-memory Map, null-not-cached policy).

This separation makes it easy to swap the cache (e.g. Redis, localStorage) without touching the API logic.

### 2. Cache Key Format (Tier 1 — Locked)

Using the canonical format from `rateCache.ts`:
```
${carrier}-${service}-${weight}-${dimensions}-${origin}-${destination}-${residential}
```

`rateFetchCache.ts` calls `buildRateCacheKey()` from Tier 1. The key is the single source of truth.

### 3. Best Rate Selection — Cache One, Not All

We cache the **best rate** (lowest cost, pre-markup) rather than the full rate array. Rationale:
- Memory footprint stays minimal
- Most consumers only care about the best rate
- Post-markup selection happens at the `applyMarkupToOrders` phase anyway

### 4. Null Not Cached

When ShipStation returns no rates, we do NOT cache `null`. This allows automatic retry on the next render cycle (via React Query staleTime) or manual refresh.

### 5. React Query Configuration

- `staleTime: 30 minutes` — rates don't change frequently mid-session
- `retry: 3` — handles transient ShipStation downtime gracefully
- `enabled: orderId > 0 && clientId > 0` — prevents queries on invalid IDs

### 6. enrichOrdersWithRates Uses Promise.all (Parallel)

Each order's rate is fetched concurrently. With cache hits, this is near-instant. With API misses, up to N parallel ShipStation requests. Once real API integration ships, consider batching if rate limits are a concern.

---

## Integration Points (What's Missing)

### ❌ ShipStation API Call (placeholder)

In `rateService.ts` → `fetchRatesFromShipStation()`:
```typescript
// TODO: Replace this stub:
console.info('[rateService] STUB: fetchRatesFromShipStation called — returning empty rates', ...)
return [];

// With real implementation:
const authHeader = btoa(`${credentials.apiKey}:${credentials.apiSecret}`);
const response = await fetch('https://ssapi.shipstation.com/shipments/getrates', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authHeader}` },
  body: JSON.stringify(payload),
});
```

**Prerequisite**: CORS proxy or direct ShipStation access confirmed.

### ❌ Client Credential Storage

In `useRates.ts` → `getClientCredentials()`:
```typescript
// TODO: Replace with real credential lookup:
function getClientCredentials(_clientId: string): ClientCredentials {
  return { apiKey: '', apiSecret: '' }; // PLACEHOLDER
}
```

**Design options under consideration**:
1. Auth store (zustand) populated at login
2. Backend secret store (`/api/credentials/:clientId`)
3. Environment variable per client (dev only)

### ❌ Markup Application (waits for Feature 4)

In `ordersStore.ts` → `enrichOrdersWithRates()`:
```typescript
// TODO (Markup Chain): apply markup here:
// rate: bestRate.rate + (bestRate.rate * carrierMarkupPct) + residentialSurcharge
```

When Markup Chain (Feature 4) ships, update this line using `applyMarkup()` from `markupService.ts`.

### ❌ Origin ZIP Configuration

Currently hardcoded to `'92101'` as default. Should be:
- Configurable per-client (store profile or auth store)
- Multiple origins for multi-warehouse support

### ❌ Service Code Iteration

Currently passes a single `DEFAULT_SERVICE_CODE` for the cache key. Real implementation should:
- Fetch all available services per carrier
- Cache each independently
- Return the cheapest across all services

---

## Quality Gates (All Passing)

| Gate | Status |
|------|--------|
| TypeScript | ✅ 0 errors |
| ESLint | ✅ 0 errors |
| Tests | ✅ 41 new tests (25 rateService + 16 rateFetchCache); 149 total |
| Build | ✅ 0 errors, 193.8 kB bundle |
| Vercel | ✅ Deployable (no live route — integration incomplete) |

---

## What's NOT Done (By Design)

- ❌ Markup application (waits for Markup Chain Feature 4)
- ❌ Client credential storage (design TBD)
- ❌ Live ShipStation API call (stub returns [] until backend proxy confirmed)
- ❌ Live order enrichment in UI (waits for real rate fetch)

All of these are **intentional scaffolding gaps**. The plumbing is in place.

---

## Test Coverage Summary

### rateService.test.ts (25 tests)

- `fetchRatesFromShipStation` — 8 tests: empty ZIP, negative weight, NaN weight, missing credentials, stub returns empty, weight=0 allowed
- `selectBestRate` — 9 tests: empty, null-safe, single rate, two rates, multiple rates, tie, free shipping, high cost
- `buildRateFetchRequest` — 8 tests: valid order, missing weight/dims/ZIP, gram→oz conversion, enriched overrides, residential default

### rateFetchCache.test.ts (16 tests)

- Cache miss → fetch → cache result (4 tests)
- Cache hit → no re-fetch (2 tests)
- Null rate → not cached → retry (3 tests)
- clearRateCache (2 tests)
- invalidateRateCacheEntry (2 tests)
- Invalid params → null (3 tests)
