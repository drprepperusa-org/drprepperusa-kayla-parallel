---
title: Phase 1 Implementation Plan — Store Setup + Layout
created: 2026-03-26 16:05 EDT
phase: 1
duration: 1 week
status: ready-to-implement
---

# Phase 1: Store Setup + Layout

**Goal**: Build foundation (Zustand store + page layout) before implementing features.

**Confidence**: 95% (data structures locked by Sonnet review)

---

## Scope

### 1. Zustand Store Implementation
- [ ] Create `src/stores/ordersStore.ts` (complete OrdersStore from DATA-STRUCTURES-AND-ZUSTAND-SCHEMA.md)
- [ ] Create `src/types/orders.ts` (all Order-related interfaces)
- [ ] Create `src/utils/orderFilters.ts` (filterOrders, getDateRange, mergeOrders helpers)
- [ ] Create `src/utils/orderValidation.ts` (validation functions)
- [ ] Write unit tests for store (selectors, actions, edge cases)

### 2. Page Layout
- [ ] Create `src/pages/AwaitingShipments.tsx` (main page component)
- [ ] Create `src/components/OrdersTable.tsx` (table with 24 columns)
- [ ] Create `src/components/RightPanel.tsx` (persistent panel, empty/shipping/batch states)
- [ ] Create `src/components/ControlBar.tsx` (search, SKU filter, date filter, export, columns, zoom)
- [ ] Create `src/components/Pagination.tsx` (bottom left/right controls)
- [ ] Create `src/components/SelectionBanner.tsx` (X Orders Selected banner)
- [ ] Create `src/styles/AwaitingShipments.module.scss` (layout + responsive styles)

### 3. Integration
- [ ] Wire store to page (useOrdersStore hooks)
- [ ] Mock API response (sample orders JSON)
- [ ] Populate store with mock data
- [ ] Test rendering (table, pagination, panel states)

### 4. Testing
- [ ] Unit tests: filterOrders, selectors, store actions
- [ ] Integration tests: filter + paginate + select
- [ ] Visual regression: table layout, responsive breakpoints
- [ ] Edge cases: empty orders, single order, 100+ orders, extreme zoom

---

## Key Files to Create

```
src/
├── stores/
│   └── ordersStore.ts          (Zustand store, ~800 lines)
├── types/
│   └── orders.ts               (Order, OrderItem, OrderLabel, etc.)
├── utils/
│   ├── orderFilters.ts         (filterOrders, getDateRange, mergeOrders)
│   ├── orderValidation.ts      (validateOrder, isValidOrder, etc.)
│   └── orderConstants.ts       (ALL_COLUMNS, INITIAL_STATE, etc.)
├── components/
│   ├── OrdersTable.tsx         (main table)
│   ├── RightPanel.tsx          (shipping/batch/empty)
│   ├── ControlBar.tsx          (filters + export + controls)
│   ├── Pagination.tsx          (bottom controls)
│   ├── SelectionBanner.tsx     (X Orders Selected)
│   └── Shipment/
│       ├── ShippingPanel.tsx   (1 order selected)
│       └── BatchPanel.tsx      (2+ orders selected)
├── styles/
│   └── AwaitingShipments.module.scss
├── pages/
│   └── AwaitingShipments.tsx   (main page)
└── __tests__/
    ├── ordersStore.test.ts
    ├── orderFilters.test.ts
    └── AwaitingShipments.test.tsx
```

---

## Implementation Steps

### Step 1: Types + Constants (Day 1)
1. Create `src/types/orders.ts` with all interfaces from DATA-STRUCTURES-AND-ZUSTAND-SCHEMA.md
2. Create `src/utils/orderConstants.ts` with ALL_COLUMNS, INITIAL_STATE, date ranges
3. Create mock data file `src/data/mockOrders.ts` (50-100 sample orders)

**Deliverable**: TypeScript interfaces locked, mock data ready

### Step 2: Zustand Store (Day 1-2)
1. Create `src/stores/ordersStore.ts` with full implementation
2. Create `src/utils/orderFilters.ts` (filterOrders, getDateRange, mergeOrders)
3. Create `src/utils/orderValidation.ts` (validation functions)
4. Write unit tests: filters, selectors, edge cases

**Deliverable**: Store is complete, all actions/selectors tested, 95%+ coverage

### Step 3: Components (Day 2-3)
1. Create `src/components/OrdersTable.tsx` (render from store, handle column visibility)
2. Create `src/components/ControlBar.tsx` (search, SKU, date, export, columns, zoom)
3. Create `src/components/Pagination.tsx` (page nav, page size toggle)
4. Create `src/components/SelectionBanner.tsx` (conditional banner)
5. Create `src/components/RightPanel.tsx` (empty/shipping/batch states)

**Deliverable**: All components render, store integration works

### Step 4: Page Layout (Day 3-4)
1. Create `src/pages/AwaitingShipments.tsx` (assemble components)
2. Create `src/styles/AwaitingShipments.module.scss` (layout, responsive, zoom levels)
3. Wire all component interactions (filter → store → component update)
4. Test data flow: filter input → store mutation → table re-render

**Deliverable**: Full page renders, all interactions work

### Step 5: Testing + Polish (Day 4-5)
1. Unit tests: store, filters, validation
2. Integration tests: filter + paginate + select
3. Visual testing: table, pagination, responsive
4. Edge case handling: empty, large datasets, zoom
5. Performance: filter 10k+ orders, pagination clamp

**Deliverable**: All tests pass, ready for feature implementation

---

## Success Criteria

- [ ] Zustand store is complete, typed, and tested (100+ unit tests)
- [ ] Table renders 24 columns with proper formatting
- [ ] All filters (search, SKU, date) work correctly and reset pagination
- [ ] Selection logic enforces mutual exclusion (checkbox vs row-click)
- [ ] Right panel switches between empty/shipping/batch correctly
- [ ] Pagination displays correct range and clamps to valid page
- [ ] Zoom levels (100%, 115%, 125%) scale content properly
- [ ] All perimeter elements (header, footer, panels) stay fixed during zoom
- [ ] Export CSV includes all visible columns + respects filters
- [ ] Mock data flows through entire app without errors

---

## Confidence & Blockers

**Confidence**: 95%

**Why not 100%**:
- CSS grid layout for large column count (24) may need optimization
- Zoom implementation (CSS transforms vs scale) needs testing on real data

**No blockers detected.** Data structures locked, store design reviewed, components clearly defined.

---

## Post-Phase 1 Checklist

Before moving to Phase 2:
- [ ] Store is production-ready (no console errors)
- [ ] All 24 columns render without horizontal scroll issues
- [ ] Filtering is responsive (sub-100ms for 10k orders)
- [ ] Selection state matches spec exactly
- [ ] Pagination edge cases handled (0 results, 1 page, 100+ pages)
- [ ] Zoom doesn't break layout (perimeter elements stay fixed)
- [ ] Ready for Albert's approval before Phase 2

---

**Next Phase**: Week 2 — Feature Implementation (features 1-5: search, SKU, date, export, columns)

**Last Updated**: 2026-03-26 16:05 EDT
