---
title: DJ Quick-Start — drprepperusa-v2 Refactor (Specifications Needed)
created: 2026-03-24 23:09 EDT
audience: DJ (business logic expert)
status: ready-for-specs
---

# DJ Quick-Start: Your Role in drprepperusa-v2 Refactor

**TL;DR**: Answer 3 sets of questions about your business logic → I (Kayla) implement all the features automatically → team ships in 3–4 days.

---

## 🎯 Your Mission (30 Minutes of Work)

You provide specifications for **3 critical features** that only you understand. I'll handle all the implementation, testing, and deployment.

**What you need to provide**:
1. **Markup Chain** — How markups & surcharges are calculated (2–5 minutes)
2. **Billing Formula** — How order costs are calculated (2–5 minutes)
3. **Label State Machine** — How label creation works in the order workflow (5–10 minutes)

**Impact**: Once you answer, 3 agents ship all features to production in parallel (2–3 hours development time).

---

## 📋 The 3 Specs You Need to Provide

### Spec 1: Markup Chain Calculation

**What I need from you**:
```
1. How are markups defined in your system?
   Example: "USPS gets 10% markup, UPS gets 15%, FedEx gets 20%"
   Or: "All carriers get a 12% flat markup"
   Or: "Markups vary by service (Priority gets 10%, Ground gets 15%)"

2. Are markups hardcoded, read from a database, or configured elsewhere?

3. Are there surcharges in addition to markups?
   Example: "USPS gets 10% markup PLUS a $2.50 residential surcharge"

4. When markup % and surcharge $ both apply, which comes first?
   Example: 
   - Apply 15% to $100 base = $115, then add $2.50 = $117.50
   OR
   - Add $2.50 first = $102.50, then apply 15% = $117.88

5. Can orders have multiple surcharges?
   Example: markup + residential surcharge + international surcharge all at once?
```

**Where to provide it**: Just answer in this chat (no formatting needed, plain English is fine).

---

### Spec 2: Billing Formula Calculation

**What I need from you**:
```
1. What's the complete formula for order cost?
   Start: baseRate (from carrier)
   Then: add/apply ?
   Then: add/apply ?
   Then: add/apply ?
   Final: totalCost

   Example formula:
   cost = baseRate + residentialSurcharge + (baseRate × markupPercent) + tax

2. How should rounding work?
   Options:
   - Round to nearest $0.01 using banker's rounding (standard accounting)
   - Round to nearest $0.01 using half-up (always round .005 up)
   - Truncate (always round down)

3. Provide 3 test examples with known correct costs:
   Example:
   - Order A: $100 base, 10% markup, $3 surcharge, 8% tax → total = $122.40
   - Order B: $50 base, 0% markup, $0 surcharge, 0% tax → total = $50.00
   - Order C: $200 base, 15% markup, $5 surcharge, 8% tax → total = ?

4. Can markups be negative? (i.e., discounts?)
   If yes, how are they applied? Can a cost go below the base rate?

5. Are there any caps or minimums?
   Example: "never charge less than the base carrier rate"?
```

**Where to provide it**: Just answer in this chat (formulas, rounding rule, 3 test cases).

---

### Spec 3: Label Creation State Machine

**What I need from you**:
```
1. What's the order workflow around label creation?
   States:
   - Order created (awaiting shipment)
   - Label printed (tracking number assigned)
   - Shipped (carrier notified)
   - Delivered (carrier confirms)
   
   OR different states? What are the exact state names?

2. When does label creation happen?
   - Automatically when order transitions to "shipped"?
   - Manual button click in the order detail panel?
   - API call from an external system?

3. Which carrier API prints the label?
   - ShipStation?
   - EasyPost?
   - Custom API?
   - Something else?

4. Where does label metadata persist?
   - In the order object (OrderDTO.label)?
   - In a separate database collection?
   - Backend-only (never synced to frontend)?

5. Does the carrier notify us when the label is ready?
   - ShipStation webhooks?
   - EasyPost callbacks?
   - Polling (we ask periodically)?
   - Synchronous (label ready immediately after HTTP call)?

6. What happens if "Print Label" is clicked twice?
   - Error? 
   - No-op (second click does nothing)?
   - Retry (regenerate label)?
   - Deduplication (check if already created, skip)?

7. What's the business rule if label printing fails?
   - Show error to user?
   - Retry automatically?
   - Mark order as "label_failed" and wait for manual intervention?
```

**Where to provide it**: Just answer in this chat (state diagram, carrier, storage location, webhook info, error handling).

---

## 🌍 Remote Access (Important for You)

Since you're remote, **everything you need is on GitHub master branch**:

- Click any link above → read full docs
- No local installation needed
- All docs are live, always up-to-date
- Share links with team members (everyone can access)

---

## 🚀 How the System Works (Quick Guide for DJ)

You're working with an **autonomous agent system** called OpenClaw. Here's what you should know:

### What I Can Do Automatically

1. **Code Generation** (super fast)
   - Write React components, TypeScript services, business logic
   - Generate unit tests (30+ tests per feature)
   - Ensure 0 TypeScript errors, 0 ESLint errors

2. **Parallel Execution** (save time)
   - Spawn 3+ agents to work on different features simultaneously
   - Markup Chain: Agent A (2 hours)
   - Billing Calc: Agent B (2.5 hours)
   - Label Creation: Agent C (2.5 hours)
   - All ship together (not 6.5 hours sequentially)

3. **Deployment** (zero-touch)
   - Push to GitHub (feature branches + PRs)
   - Deploy to Vercel (HTTP 200 verified)
   - Report 3 links: GitHub, Live URL, Project

4. **Testing** (comprehensive)
   - Unit tests: 25–40 tests per feature
   - Edge cases covered (null values, errors, boundary conditions)
   - 100% test coverage on critical logic

### How to Use Me Effectively

**When you have answers**, just provide them like this:

```
**Markup Chain Spec**:
- Markups are per-carrier (hardcoded JSON in config)
- USPS: 10% markup + $2.50 surcharge
- UPS: 15% markup, no surcharge
- FedEx: 15% markup + $3 surcharge
- Apply markup % first, then add surcharge $
- [continue answering the other questions]

**Billing Formula**:
- cost = baseRate + (baseRate × markupPercent) + residentialSurcharge + tax
- Round to nearest $0.01 using banker's rounding
- Test case 1: $100 base, 10% markup, $3 surcharge, 8% tax = $122.40
- [continue with other test cases]

**Label State Machine**:
- States: awaiting → shipped → labeled → delivered
- Trigger: manual "Print Label" button (not automatic)
- Carrier: ShipStation API
- Storage: OrderDTO.label = { shippingNumber, labelUrl, carrierCode, createdAt }
- [continue with other answers]
```

**I'll then**:
1. ✅ Extract your specs into structured format
2. ✅ Validate for completeness
3. ✅ Spawn 3 agents in parallel
4. ✅ Each agent delivers feature in 2–2.5 hours
5. ✅ All 3 features ship to master
6. ✅ Link you to live code + test suites

### Tips for Success

1. **Be specific, not vague**
   - ❌ "Markups are flexible"
   - ✅ "USPS gets 10%, UPS gets 15%, markup applied before surcharge"

2. **Provide test data**
   - This is critical for validation
   - Even "made-up" numbers help me verify the formula works
   - Example: "$100 base → $123.45 final" tells me everything about your formula

3. **Ask questions if unclear**
   - If my spec template doesn't make sense, ask for clarification
   - Better to clarify now than implement wrong

4. **The system auto-generates implementations**
   - You don't write code
   - You don't deploy anything
   - You just answer questions about your business logic
   - I handle the rest (code, tests, deployment)

---

## 📁 What You'll Review (If Interested)

Once implementations are done, you can review:

**For each feature**, I provide:
- GitHub PR with complete code
- Live implementation on Vercel (clickable link)
- Test suite (30–40 tests, all passing)
- Implementation log (explaining design decisions)

**You can**:
- Click through the live version (see it working)
- Review the code (read-only, understand the logic)
- Suggest changes (I refactor via new agents)
- Approve for production (domain sign-off)

---

## 📚 Technical Context (Optional Reading)

**For curiosity**: Here's what we've already completed.

### What's Done (Tier 1) ✅
1. **Order Detail Panel** — UI that shows order info when you click a row
2. **Residential Inference** — Automatically detects residential vs commercial addresses
3. **Rate Cache Key** — Format for caching shipping rates (prevents duplicate lookups)

**All 3 are live**: https://drprepperusa-kayla-parallel.vercel.app

**Test coverage**: 68 total tests, 100% on implemented logic

### Documentation (Master Branch — Remote Access)

**Master source of truth** (on GitHub, accessible from anywhere):

1. **REFACTOR-PLAN.md** — Complete refactoring strategy + timeline
   https://github.com/drprepperusa-org/drprepperusa-kayla-parallel/blob/master/REFACTOR-PLAN.md

2. **FEATURE-IMPLEMENTATION-STATUS.md** — Detailed feature inventory + blockers
   https://github.com/drprepperusa-org/drprepperusa-kayla-parallel/blob/master/FEATURE-IMPLEMENTATION-STATUS.md

3. **TIER1-ORDER-DETAIL-LOG.md** — Order Detail Panel implementation
   https://github.com/drprepperusa-org/drprepperusa-kayla-parallel/blob/master/src/TIER1-ORDER-DETAIL-LOG.md

4. **TIER1-RESIDENTIAL-LOGIC-LOG.md** — Residential inference (27 tests, 100% coverage)
   https://github.com/drprepperusa-org/drprepperusa-kayla-parallel/blob/master/src/TIER1-RESIDENTIAL-LOGIC-LOG.md

5. **TIER1-RATE-CACHE-LOG.md** — Rate cache key format (41 tests, collision prevention)
   https://github.com/drprepperusa-org/drprepperusa-kayla-parallel/blob/master/src/TIER1-RATE-CACHE-LOG.md

**You can**: Click any link above, read full docs, understand complete context from anywhere (no local access needed)

### What's Blocked (Tier 2+) ⏳
We can't move forward without your 3 specs:
- Markup Chain (needed for rate calculation)
- Billing Calc (needed for cost display)
- Label Creation (needed for order fulfillment)

**Timeline**: Once you provide specs → 3–4 days to full release

---

## 🎯 Quick Checklist for You

Before you answer, make sure you have:

- [ ] Access to your business logic docs / specs (or knowledge in your head)
- [ ] Understanding of your markup rules
- [ ] Formula for order cost calculation
- [ ] Clarity on order workflow (label creation triggers, states, storage)
- [ ] Comfort with providing test data (made-up numbers for validation)

**Then**: Just reply in this chat with answers to the 3 spec sections above.

---

## ❓ Questions for You?

**Before I spawn agents**, I might ask clarifications like:

- "You said USPS gets 10% markup — does that apply to all USPS services or just Priority?"
- "When you say 'label is stored in OrderDTO', does that sync back to your backend or stays frontend-only?"
- "For rounding, which method matches your current accounting system?"

**Just answer straightforwardly** — the more detail, the better the implementation.

---

## 📞 How to Proceed

1. **Read the 3 spec sections** above (takes 5 minutes)
2. **Gather your answers** (takes 10–15 minutes)
3. **Reply in this chat** with all 3 specs (you can copy-paste the template)
4. **Tag me** (@kayla or just answer) and I'll:
   - Validate completeness
   - Spawn 3 agents
   - Track progress
   - Deliver to master

**You're not blocked on anything.** Just provide the specs when ready — no time pressure, but sooner is better (3–4 day timeline starts once you answer).

---

**Welcome to the team!** Looking forward to your specs. 🚀

---

**Status**: Ready for DJ's input  
**Specs Needed**: 3 (Markup, Billing, Label State)  
**Expected Delivery**: 2–3 hours after specs received  
**Created**: 2026-03-24 23:09 EDT
