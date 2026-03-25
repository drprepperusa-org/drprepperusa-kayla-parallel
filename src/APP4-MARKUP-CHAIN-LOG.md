# APP4: Markup Chain Calculation Service — Build Log

**Feature**: Feature 4 — Markup Chain Calculation Service
**Branch**: `feature/app4-markup-chain`
**Status**: ✅ Complete — merged to master
**Date**: 2026-03-25

---

## Summary

Implemented the carrier-specific markup calculation service for the DrPrepperUSA shipping platform.
Markup is applied per-carrier, per-client, after residential surcharge is added (per Billing feature spec).

---

## Files Created / Modified

### Created
| File | Purpose |
|------|---------|
| `src/utils/markupService.ts` | Core markup logic: `getMarkupRuleForCarrier`, `applyMarkup`, `calculateMarkupAmount`, `applyMarkupForCarrier` |
| `src/stores/markupStore.ts` | Zustand store with default rules (USPS 10%, UPS 15%, FedEx 20%) and admin CRUD actions |
| `src/utils/markupService.test.ts` | 49 tests covering all functions, carriers, rates, edge cases, multi-tenancy |

### Modified
| File | Change |
|------|--------|
| `src/stores/ordersStore.ts` | Added `applyMarkupToOrders()` action for batch markup application |

---

## Specification Compliance

| Requirement | Status |
|-------------|--------|
| USPS: 10% markup | ✅ Default rule seeded |
| UPS: 15% markup | ✅ Default rule seeded |
| FedEx: 20% markup | ✅ Default rule seeded |
| Per-carrier granularity | ✅ Lookup by carrier + clientId |
| Multi-tenant (per-client) | ✅ clientId on every rule |
| Formula: baseRate × (1 + pct/100) | ✅ Implemented in `applyMarkup()` |
| Markup after residential surcharge | ✅ Per spec — `applyMarkupToOrders` applies post-enrichment |
| Admin configurable | ✅ Zustand store with addRule/updateRule/deleteRule |
| Fallback: 0% if no rule | ✅ `getMarkupRuleForCarrier` returns 0 on miss |

---

## Quality Gates

| Gate | Result |
|------|--------|
| TypeScript: 0 new errors | ✅ 0 errors introduced (3 pre-existing from other features) |
| ESLint: 0 errors on changed files | ✅ Clean |
| Tests: 49 passing | ✅ 49/49 (exceeds 25+ requirement) |
| Build: full test suite passing | ✅ 198/198 tests pass |

---

## Design Decisions

### Fallback to 0%
When no markup rule is found for a carrier+client pair, the service returns 0% (no markup applied). This is safe — avoids unexpected billing surprises for unconfigured carriers.

### Case-insensitive carrier lookup
`getMarkupRuleForCarrier` normalizes carrier names to uppercase before comparison, so 'usps', 'USPS', and 'Usps' all match correctly.

### Inline type imports
Merged `import type { MarkupRule }` into value imports using inline `type` keyword to satisfy the `no-duplicate-imports` ESLint rule.

### `calculateMarkupAmount` bonus function
Added as a utility for billing UI line items (shows "Markup: $X.XX" separately from total). Not in original spec but zero-cost addition with test coverage.

### applyMarkupForCarrier convenience function
Combines lookup + apply in one call — reduces boilerplate for callers that have carrier/clientId but not a pre-fetched markup percent.

---

## Test Coverage Breakdown

| Suite | Tests |
|-------|-------|
| `getMarkupRuleForCarrier` | 17 |
| `applyMarkup` | 18 |
| `calculateMarkupAmount` | 8 |
| `applyMarkupForCarrier` | 6 |
| **Total** | **49** |
