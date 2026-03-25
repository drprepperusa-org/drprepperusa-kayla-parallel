---
title: DJ Reselling SaaS Questionnaire — Focused on Order Management & Label Printing
created: 2026-03-25 18:55 EDT
audience: DJ (business owner) + Albert (developer)
context: Reselling SaaS - manage open orders, print labels (lowest cost), consolidate SKUs, minimize manual work
---

# Reselling SaaS App Questionnaire

**Context**: You're helping entrepreneurs manage open orders and print shipping labels. Focus: minimize manual tasks, batch operations, order consolidation, lowest-cost carrier selection.

---

## SECTION 1: NAVIGATION & GLOBAL STATE

### Questions for DJ (Business Owner)

**Q1.1: Status categories in navigation**
- Current nav shows "awaiting shipping" and "completed"
- Should there be other statuses? (e.g., "label failed", "on hold", "cancelled")
- Or just these two?

**Q1.2: Primary workflow target**
- You're focusing on "awaiting shipping" orders
- When an order gets a label, does it move to "completed"?
- Or does "completed" mean something else (delivered, refunded, etc.)?

**Q1.3: Multi-client / multi-store support**
- Are you managing orders for ONE client only per login?
- Or multiple clients (clients A, B, C) with separate order tables?
- If multiple, should there be a "client selector" in nav?

---

### Questions for Albert (Developer)

**Q1.4: API data structure**
- API returns all orders for a client in one call?
- Should we paginate/lazy-load, or load all at once?
- Are there status codes in the response (e.g., order.status = "awaiting_shipment")?
- Any sorting hints from API (newest first, by customer, etc.)?

**Q1.5: Real-time vs cached data**
- After printing a label, should the table update immediately?
- Or does user need to manually refresh?
- Should there be a background sync (auto-refresh every 30 sec)?

---

## SECTION 2: AWAITING SHIPPING TABLE

### Q2.1: Essential columns for DJ

When looking at the "awaiting shipping" list, what information do you NEED to see at a glance?

**Pick your top 5 from this list:**
- Order ID
- Customer name
- Order date
- Ship-to ZIP code
- Items / SKU count
- Item weight (total)
- Carrier (pre-selected or blank)
- Base rate (from ShipStation)
- Calculated total cost (with markup)
- Residential flag (Y/N/Unknown)
- Label status (awaiting, printing, ready)

Or something else?

---

### Q2.2: Consolidation workflow

**This is critical for a reselling SaaS.**

When you look at 10 orders, how do you decide WHICH orders to batch into one print run?

- **Option A**: By customer (all orders for Customer A, then all for Customer B)
- **Option B**: By SKU (all orders containing SKU-123, then orders with SKU-456)
- **Option C**: By carrier (all USPS together, all UPS together)
- **Option D**: Manually select orders (checkboxes, then "Print selected")
- **Option E**: By weight/size (group light packages together to save cost)

Or multiple strategies depending on the day?

---

### Q2.3: Lowest-cost carrier selection

**Current flow**: We fetch rates from ShipStation for each carrier (USPS, UPS, FedEx) and apply markup %.

**Question**: When you print labels for 5 orders, should the app:

- **Option A**: Auto-select the cheapest carrier FOR EACH order individually
- **Option B**: Show all 3 carriers per order, you pick the carrier
- **Option C**: Show top carrier per order, with dropdown to change
- **Option D**: "Print all at lowest cost" button (auto-select cheapest, then batch print all)

Which minimizes YOUR manual work?

---

### Q2.4: Sorting & filtering for efficiency

**You have 50 "awaiting shipping" orders.** What's the fastest way to find the ones YOU need to print TODAY?

**Should table have filters for:**
- Date (orders from today, this week, all)
- Weight range (light packages <1lb, medium 1-5lb, heavy >5lb)
- Carrier (pre-filtered to USPS only, for example)
- Destination ZIP (certain regions you batch together)
- Cost range (orders $X-$Y)
- Customer (recurring customers)

**Or is there a better workflow?**

---

### Q2.5: Table row actions

When you look at a row in the table, what actions should be immediately available?

- View / expand details (slide-out panel)?
- Print label button (right there on the row)?
- Change carrier dropdown (right there on the row)?
- Select checkbox (for batch operations)?
- All of the above?

**Goal**: Minimize clicks to get to label printing.

---

## SECTION 3: ORDER DETAIL PANEL

### Q3.1: What to show when you click an order

When you click an order row, a panel slides out. What MUST be in that panel?

**Arrange in priority order (most important first):**
- Shipping address (full)
- Items / SKUs
- Carrier options + rates
- Calculated total cost
- Residential flag
- Tracking number (if already printed)
- Print Label button
- Customer contact info
- Order notes / special instructions
- Audit trail (when label was printed, by whom, etc.)

---

### Q3.2: Carrier selection in detail panel

In the detail panel, how should carrier selection work?

- **Option A**: Dropdown showing all 3 carriers + their rates (pre-markup and post-markup)
- **Option B**: Radio buttons (USPS, UPS, FedEx) with rates
- **Option C**: Single "Recommended" carrier (cheapest) + dropdown to override
- **Option D**: Auto-select cheapest, with override allowed

**Which feels fastest for your workflow?**

---

### Q3.3: Residential flag handling

If order is being shipped to a residential address (inferred from ZIP), should the panel show:

- **Option A**: Auto-inferred, locked (can't change)
- **Option B**: Auto-inferred, but allow override toggle ("Mark as business")
- **Option C**: Manual selection (user picks Y/N/Unknown)

---

### Q3.4: Before printing label — any confirmation?

When user clicks "Print Label", should there be:

- **Option A**: Immediate — just call API, no confirmation
- **Option B**: Quick confirmation: "Ship to [address] via [carrier]? Cost: $118.45"
- **Option C**: Address verification screen (show full address, confirm, then print)

Which prevents mistakes without adding friction?

---

## SECTION 4: LABEL PRINTING WORKFLOW

### Q4.1: Single vs batch printing

**Current design**: Print one label per order.

**Question**: Do you ever want to:

- Print all labels for selected orders in ONE PDF (consolidated batch)?
- Or one label per order (separate PDFs)?
- Both options, depending on situation?

---

### Q4.2: After printing label

When user successfully prints a label, what should happen?

- **Option A**: Panel shows tracking number + PDF link, order status changes to "shipped", label closes
- **Option B**: Panel stays open, user clicks next order to print
- **Option C**: Return to table, user manually selects next order

**Which keeps workflow going fastest?**

---

### Q4.3: Failed label — error recovery

If label creation fails (invalid address, API down, etc.):

- Show error message inline in panel?
- Show error in toast notification?
- Suggest fixes (e.g., "ZIP code missing, please add")?
- Auto-retry, or manual retry button?

---

### Q4.4: Reprinting / voiding labels

If you print a label by mistake, can you:

- Void it (cancel, get refund)?
- Print a duplicate (if label gets lost)?
- Reprint with different carrier (if you realize cheaper option exists)?

How often do you need this feature?

---

## SECTION 5: EFFICIENCY & BATCH OPERATIONS

### Q5.1: Bulk actions on table

Should there be checkboxes on each row to select multiple orders?

**If yes, bulk actions could include:**
- "Print labels for selected" (batch all into one job)
- "Change carrier for selected" (all to USPS, for example)
- "Export as CSV" (for manual fulfillment)
- "Mark as on-hold" (skip these for now)

**Do you want these? Which are most useful?**

---

### Q5.2: Print queue / print jobs

**Current flow**: User selects order → prints label → done.

**Alternative**: Could we have a "print queue"?

- Add orders to queue
- Review all orders in queue before printing
- Print all at once (batch PDF)
- Confirm printed (mark as shipped)

Would this speed up your workflow, or add friction?

---

### Q5.3: Estimated cost preview

Before printing a batch of 5 orders, should app show:

- Total cost across all 5?
- Carrier comparison (total if USPS, total if UPS, etc.)?
- Savings vs most expensive carrier?

---

### Q5.4: SKU consolidation

You mentioned "consolidating SKU orders from different customers".

**Example**: Customer A ordered SKU-123 (1 unit), Customer B ordered SKU-123 (2 units).

**Question**: Should the app help you:

- See that SKU-123 appears in 2 orders?
- Pick what order to print FIRST to consolidate stock movement?
- Suggest printing Customer B first (larger qty)?

Or is this manual (you just track it yourself)?

---

## SECTION 6: PERFORMANCE & USABILITY

### Q6.1: Table size

You have 50 "awaiting shipping" orders. Should the table:

- Show all 50 at once (slow load, fast filtering)?
- Show first 25, "load more" button?
- Show first 10, with pagination?
- Auto-load as you scroll?

What feels right for your use case?

---

### Q6.2: Sorting

What's the most common way you sort orders?

- Newest first?
- Oldest first (FIFO)?
- By customer name?
- By weight (print heavy items first)?
- By destination ZIP (batch by region)?

---

### Q6.3: Mobile experience

Do you ever manage orders on mobile (phone/tablet)?

- Not at all (desktop only)?
- Sometimes (check status, print rare labels)?
- Often (primary interface)?

If yes, what's the minimum viable mobile experience?

---

## SECTION 7: ASSUMPTIONS CHECK

### For Albert (Developer)

**Q7.1: Our current architecture assumptions — are these right?**

- Orders come from ShipStation API
- Rates come from ShipStation API (and are cached 30 min)
- Labels are created via ShipStation API (returns tracking #)
- Residential flag is inferred from ZIP (Tier 1 logic)
- Markup is applied per carrier (USPS 10%, UPS 15%, FedEx 20%)
- Billing formula: (baseRate + residential) × (1 + markup%)

**Any of these wrong or missing?**

---

### For DJ (Business Owner)

**Q7.2: We're assuming your primary goal is: "Print labels for awaiting orders, minimize cost, minimize manual work"**

- Is this right?
- Missing any goals?
- Are there secondary goals (compliance, tracking, inventory sync)?

---

### Q7.3: We're assuming the workflow is:

1. Log in → see "awaiting shipping" orders
2. Review orders (filter/sort as needed)
3. Click order → see details + rates
4. Select carrier → print label
5. Order moves to "shipped"
6. Repeat for next order

**Is this the actual workflow, or different?**

---

## SECTION 8: UNIQUE FEATURES & PAIN POINTS

### Q8.1: In the original app, what worked REALLY well?

- Something you don't want to lose?
- Something that speeds up your work?
- Something that prevents mistakes?

---

### Q8.2: What frustrated you about the original app?

- Slow? Confusing? Missing features?
- Too many clicks to print a label?
- Hard to find the right order?
- Rate calculation wrong?
- Something else?

---

### Q8.3: Features you'd like that don't exist?

- Batch print multiple orders at once?
- Rate comparison (show savings)?
- SKU consolidation helper?
- Keyboard shortcuts (for power users)?
- Print queue / staging area?
- API to external systems?

---

### Q8.4: How often do you print labels?

- Handful per day?
- 50-100 per day?
- 1000+ per day?

(Affects UI design priorities — speed becomes critical at high volume)

---

## SECTION 9: DEPLOYMENT & ROLLOUT

### For Albert (Developer)

**Q9.1: MVP scope**

What's the MINIMUM we need to ship before involving DJ?

- Orders table + filter (no label printing yet)?
- Orders table + detail panel (no label printing yet)?
- Orders table + detail panel + working label creation?
- All of the above + bulk operations?

---

**Q9.2: Validation strategy**

How will we know if the rebuilt app is working correctly?

- DJ uses it for a day, gives feedback?
- Side-by-side testing (old app vs new app, same orders)?
- Specific test scenarios (print 10 orders, check cost calculations)?

---

## SUMMARY: Questions by Audience

### For DJ (Business Owner) — Answer First:
- Q1.1, Q1.2, Q1.3 — Navigation & status flow
- Q2.1 — Essential columns
- Q2.2 — Consolidation strategy
- Q2.3 — Lowest-cost carrier selection
- Q2.4 — Sorting/filtering for efficiency
- Q2.5 — Row actions
- Q3.1-Q3.4 — Detail panel + carrier selection
- Q4.1-Q4.4 — Label printing workflow
- Q5.1-Q5.4 — Batch operations & consolidation
- Q6.1-Q6.3 — Performance & mobile
- Q7.2, Q7.3 — Workflow confirmation
- Q8.1-Q8.4 — What worked, what frustrated, unique needs

### For Albert (Developer) — Answer In Parallel:
- Q1.4, Q1.5 — API data & real-time sync
- Q7.1 — Architecture assumptions
- Q9.1, Q9.2 — MVP scope & validation

---

**Goal**: Clarity on the reselling workflow so we can build the right app, right away.

**Last Updated**: 2026-03-25 18:55 EDT
