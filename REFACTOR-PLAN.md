---
title: drprepperusa-v2 React Refactor — Master Plan & Current Implementation Status
created: 2026-03-24 23:03 EDT
status: tier-1-complete, tier-2-ready-for-specs
---

# drprepperusa-v2 React Refactor — Master Plan & Implementation Status

**Repository**: https://github.com/drprepperusa-org/drprepperusa-kayla-parallel  
**Live URL**: https://drprepperusa-kayla-parallel.vercel.app  
**Tech Stack**: React 18 + TypeScript + Zustand v5 + react-query + Rsbuild  
**Deployment**: Vercel (SPA routing via vercel.json)

---

## 📊 Current Status (as of 2026-03-24 23:00 EDT)

| Metric | Value |
|--------|-------|
| **Code Complete (Tier 1)** | 1,650 lines ✅ |
| **Code Remaining (Tier 2+)** | 2,950 lines ⏳ |
| **Total Target** | 4,600 lines |
| **Progress by Volume** | 36% ✅ / 64% ⏳ |
| **Progress by Complexity** | 50% (UI done, logic pending) |
| **TypeScript Errors** | 0 ✅ |
| **ESLint Errors** | 0 ✅ |
| **Test Coverage** | 68 tests, 100% on Tier 1 ✅ |
| **Vercel Deployment** | HTTP 200 ✅ |

---

## 🗺️ Master Refactoring Plan

### Phase 1: Tier 1 (MVP + Core Logic) — ✅ COMPLETE

**What was built** (3 features, 1,650 lines):

1. **Order Detail Panel** (97% confidence)
   - Slide-in modal (desktop) / bottom sheet (mobile)
   - Order summary: customer, ship-to, items, totals, tracking
   - Context-aware actions (Print, View, Resend, Refund, Cancel)
   - Zustand store: `orderDetailStore.ts`
   - Responsive: 375px+ mobile-first
   - **Status**: ✅ Live on Vercel

2. **Residential Flag Inference** (94% confidence)
   - Tristate logic: `residential: boolean | undefined` → infer
   - Inference pipeline: company name → ZIP commercial → ZIP residential → fallback
   - Service: `residentialService.ts` (pure, immutable)
   - 27 tests, 100% coverage
   - Batch enrichment: `applyResidentialToOrders()`
   - **Status**: ✅ Merged to master

3. **Rate Cache Key Format Lock** (95% confidence)
   - Consolidated 3 conflicting doc variants
   - Canonical format: `${carrier}-${service}-${weight}-${dimensions}-${origin}-${destination}-${residential}`
   - Collision prevention: carrier + service critical (different carriers → different rates)
   - Service: `rateCache.ts` (key builder + validation)
   - 41 tests, all passing
   - **Status**: ✅ Merged to master

**Deliverables**:
- GitHub: https://github.com/drprepperusa-org/drprepperusa-kayla-parallel
- Live: https://drprepperusa-kayla-parallel.vercel.app
- Feature logs: TIER1-*.md files (on master)
- Comprehensive status: FEATURE-IMPLEMENTATION-STATUS.md (on master, team resource)

---

### Phase 2: Tier 2 (Business Logic + Integration) — ⏳ AWAITING SPECS

**What needs to be built** (5 features, 2,950 lines):

#### Feature 4: Markup Chain Calculation (2–3 hours)
- **Dependency**: None (standalone)
- **Input from DJ**: Markup rules (per carrier? per service? flat? %)
- **Deliverable**: Service `applyMarkup(baseRate, carrier, service)` + 25 tests
- **Ships**: Independently, before Billing

#### Feature 5: Single-Label Print (2–3 hours)
- **Dependency**: None (standalone)
- **Input from DJ**: Carrier API details, label format, response handling
- **Deliverable**: Modal trigger → carrier API call → PDF/download → order state update + 10 tests
- **Ships**: Independently

#### Feature 6: Rate Enrichment Pipeline (6–8 hours)
- **Dependency**: Markup Chain (Feature 4)
- **Input from DJ**: Rate API endpoint, batch vs sequential, best-rate selection algorithm
- **Deliverable**: Async pipeline: fetch rates → apply markup → select best → cache + 30 tests
- **Ships**: After Markup Chain ready

#### Feature 7: Billing Calculation (4–6 hours) — **CRITICAL**
- **Dependency**: Markup Chain (Feature 4)
- **Input from DJ**: Formula (cost = base + residential + markup + tax?), rounding rule, test data
- **Deliverable**: Service `calculateBillingCost(order, rates, markups)` + 30 tests
- **Requires**: Domain review (finance) before shipping
- **Ships**: After formula spec + review passed

#### Feature 8: Label Creation State Machine (5–7 hours) — **CRITICAL**
- **Dependency**: None (standalone)
- **Input from DJ**: State diagram, triggers, storage location, webhook handling
- **Deliverable**: State enum + store action + UI + 35 tests
- **Requires**: Domain review (ops/fulfillment) before shipping
- **Ships**: Independently

**Blocker Status**:
- 🔴 **Cannot proceed** without DJ's 3 specs:
  1. Markup rules + algorithm
  2. Billing formula + rounding + test data
  3. Label creation state machine + storage

---

## 🎯 Implementation Roadmap

### Current Step: **AWAITING DJ SPECS**

**Action Items**:
1. DJ provides 3 specs (20–30 minutes to answer questions)
2. Kayla spawns 3 parallel agents (Markup, Billing, Label Creation)
3. Agents deliver piecemeal (2–3 hours each)
4. Domain reviews on critical features (Billing, Label) — 24 hours
5. All Tier 2 shipped to master (3–4 days total)

### Timeline (Once Specs Arrive)

| Step | Time | What Happens |
|------|------|--------------|
| **Specs delivered** | 0h | DJ provides all 3 answers |
| **Agent spawn** | 0h 05m | Kayla spawns 3 agents in parallel |
| **Markup Chain** | 2h 15m | Feature 4 ships to master (independent) |
| **Billing Calc** | 2h 30m | Feature 7 ships (consumes Markup) |
| **Label Creation** | 2h 45m | Feature 8 ships (independent) |
| **Domain reviews** | +24h | Finance reviews Billing, Ops reviews Label |
| **Rate Enrichment** | 6–8h after | Feature 6 ships (consumes Markup + Billing) |
| **Full completion** | **3–4 days** | All features shipped + reviewed |

---

## 📋 Spec Template for DJ

**To unblock immediately, DJ needs to answer**:

### Markup Chain Specification
```
1. Who maintains markups? (hardcoded JSON? database? config?)
2. Granularity: per carrier? per service? per carrier+service combo?
3. Example rules:
   - USPS Priority: +10% markup? +$2 surcharge? Both?
   - UPS Ground: +15% markup? 
   - FedEx Ground: +20% markup?
4. Precedence: apply % markup THEN $ surcharge? Or reverse?
5. Multiple surcharges: can one order have markup + residential surcharge + tax?
```

### Billing Formula Specification
```
1. Formula: cost = baseRate + ? + ? + ?
   (e.g., cost = baseRate + residentialSurcharge + markup + tax)
2. Rounding: banker's rounding? half-up? truncate?
3. Test case 1: baseRate=$100, residential surcharge=$3, markup=10%, tax=8%
   → expected cost = ?
4. Test case 2: baseRate=$50, NO surcharge, markup=15%, tax=0%
   → expected cost = ?
5. Test case 3: edge case (negative markup/discount allowed?)
   → expected behavior = ?
```

### Label Creation State Machine Specification
```
1. State diagram (pseudo-code OK):
   - States: awaiting → shipped → labeled? Or separate labelCreated flag?
   - What triggers label creation: automatic on shipped? Manual button?
2. Storage: where does label persist?
   - OrderDTO.label = {id, url, carrier, createdAt}?
   - Separate labelStore collection?
   - Backend only?
3. Carrier integration:
   - Which carrier API? (ShipStation? EasyPost? Custom?)
   - Authentication: API keys in Vercel env?
4. Webhook handling:
   - Does carrier notify when label ready? (ShipStation webhooks?)
   - Or do we poll?
   - Or label is synchronous HTTP response?
5. Idempotency:
   - What happens if "Print Label" clicked twice?
   - Error? No-op? Retry?
```

---

## 🏗️ Architecture (Zustand + SSOT)

**Store Design** (already implemented for Tier 1):

```typescript
// ordersStore.ts — single source of truth for order state
create<OrderStore>((set) => ({
  orders: [],
  selectedOrder: null,
  fetchOrders: async () => { /* ... */ },
  applyResidentialLogic: (orders) => { /* Tier 1 */ },
  applyMarkupLogic: (orders, markups) => { /* Tier 2 — Feature 4 */ },
  calculateBillingCost: (order) => { /* Tier 2 — Feature 7 */ },
  createLabel: async (orderId) => { /* Tier 2 — Feature 8 */ },
}));

// orderDetailStore.ts — modal state (companion store)
create<OrderDetailStore>((set) => ({
  selectedDetail: null,
  openDetail: (id) => { /* ... */ },
  closeDetail: () => { /* ... */ },
}));
```

**SSOT Principle**:
- All order data lives in `ordersStore`
- Derived state (modal, filters, pagination) in companion stores
- No data duplication
- All mutations go through store actions

**Integration Pattern**:
- Components use hooks: `const orders = useOrdersStore(state => state.orders)`
- Mutations: `useOrdersStore(state => state.applyMarkupLogic)(orders)`
- React Query for async (caching), Zustand for sync state

---

## 📁 File Structure (Current + Planned)

```
src/
├── components/
│   ├── OrderDetail/          ✅ (Tier 1)
│   ├── OrdersView/           ✅ (Tier 1)
│   ├── LabelPrintModal/      ⏳ (Tier 2 — Feature 5)
│   └── [others]
├── stores/
│   ├── ordersStore.ts        ✅ (Tier 1 + Tier 2 actions)
│   ├── orderDetailStore.ts   ✅ (Tier 1)
│   └── [others]
├── utils/
│   ├── residentialService.ts ✅ (Tier 1)
│   ├── rateCache.ts          ✅ (Tier 1)
│   ├── markupService.ts      ⏳ (Tier 2 — Feature 4)
│   ├── billingService.ts     ⏳ (Tier 2 — Feature 7)
│   ├── labelService.ts       ⏳ (Tier 2 — Feature 8)
│   └── [others]
├── api/
│   ├── mock-data.ts          ✅ (Tier 1)
│   ├── rates.ts              ⏳ (Tier 2 — Feature 6)
│   └── [others]
├── TIER1-*.md                ✅ (Implementation logs)
└── [App.tsx, index.tsx, etc]
```

---

## 🚀 Next Immediate Steps

### Step 1: DJ Confirms Readiness (now)
- ✅ "I'm ready to spec"
- 🔄 Kayla provides spec template (link below)

### Step 2: DJ Provides 3 Specs (20–30 minutes)
- Answers all Markup Chain questions
- Answers all Billing Calc questions
- Answers all Label Creation questions

### Step 3: Kayla Spawns 3 Agents (1 minute)
- Agent for Markup Chain (2h)
- Agent for Billing Calc (2.5h)
- Agent for Label Creation (2.5h)
- All in parallel

### Step 4: Piecemeal Shipping (2–3 hours)
- Markup Chain ships first (independent)
- Billing Calc ships after (depends on Markup)
- Label Creation ships in parallel (independent)
- Each PR reviewed + merged independently

### Step 5: Domain Reviews (24 hours)
- Finance reviews Billing Calc test data + formula
- Ops reviews Label Creation state machine
- Approval → ship to production

---

## ✅ Confirmation Checklist

Before context compaction, confirm:

- [ ] **Tier 1 status**: ✅ Complete, understand Order Detail + Residential + Rate Cache
- [ ] **Tier 2 plan**: ⏳ Ready to move forward if DJ provides specs
- [ ] **Timeline realistic**: 3–4 days once specs arrive?
- [ ] **Architecture clear**: Zustand + SSOT pattern understood?
- [ ] **Next step**: DJ provides 3 specs (Markup, Billing, Label)?
- [ ] **Resources**: 3 agents available to run in parallel once specs arrive?

---

## 📚 References

**GitHub**:
- Repo: https://github.com/drprepperusa-org/drprepperusa-kayla-parallel
- Live: https://drprepperusa-kayla-parallel.vercel.app
- PRs: #1 (Order Detail), #2 (Residential), #3 (Rate Cache), #4 (Feature Status)

**Master Documentation**:
- Full status: `/Users/albert_mini/workspace/projects/kaylafromsd/drprepperusa-kayla-parallel/FEATURE-IMPLEMENTATION-STATUS.md`
- Tier 1 logs: `/Users/albert_mini/workspace/projects/kaylafromsd/drprepperusa-kayla-parallel/src/TIER1-*.md` (3 files)

**This Artifact**:
- Location: `/Users/albert_mini/workspace/ChiefOfStaff/.openclaw/workspace/memory/handoffs/2026-03-24-DRPREPPERUSA-REFACTOR-PLAN.md`

---

**Status**: Ready for DJ specs or context compaction  
**Updated**: 2026-03-24 23:03 EDT  
**Owner**: Kayla (agent) + Albert (stakeholder) + DJ (business logic expert)
