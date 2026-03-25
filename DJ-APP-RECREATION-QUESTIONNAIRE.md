---
title: DJ App Recreation Questionnaire — Comprehensive UI/UX Clarification
created: 2026-03-25 18:46 EDT
audience: DJ (business owner)
purpose: Clarify ALL UI/UX expectations for accurate app recreation with minimal iterations
---

# App Recreation Questionnaire — Complete UX Clarification

We're rebuilding drprepperusa from the original. To avoid multiple iterations, we need complete clarity on UI/UX behavior, edge cases, and unique features.

---

## PART 1: OBVIOUS QUESTIONS — ORDERS PAGE

### Basic Navigation & Display

**Q1.1: When you open the app, what page appears first?**
- Orders list (default)?
- Dashboard/summary?
- Login?
- Settings required first?

**Q1.2: Default view of Orders page — what's shown?**
- How many orders per page? (10, 25, 50, 100?)
- Default sort? (newest first, oldest first, by status, by customer name?)
- Default filter? (all orders, only "awaiting shipment", only "awaiting_shipment"?)
- What date range? (today, this week, all time?)

**Q1.3: Table columns — what's ESSENTIAL and always visible?**
- Order ID
- Order date
- Customer name / Ship-to name
- Ship-to address (full or abbreviated?)
- Item count / SKU count
- Status (awaiting_shipment, shipped, cancelled, etc.)
- Current carrier (pre-selected or empty?)
- Base rate (from ShipStation)
- Calculated total cost (with markup?)
- Label status (none, pending, ready, failed)
- Any other columns?

**Q1.4: Should columns be:**
- Sortable by clicking header?
- Filterable by clicking header or via separate filter panel?
- Resizable (drag to adjust width)?
- Reorderable (drag to rearrange)?
- Hideable (column visibility toggle)?
- Frozen (order ID always visible when scrolling)?

**Q1.5: Color-coding / visual status indicators on rows**
- Should rows have background colors by status?
  - Awaiting shipment: yellow?
  - Shipped: green?
  - Cancelled: gray?
  - Error/failed label: red?
- Should there be icons in cells? (e.g., ✅ for shipped, ⏳ for pending, ❌ for failed)

### Filtering & Search

**Q1.6: What filters should be available?**
- Status filter (awaiting_shipment, shipped, cancelled, etc.) — dropdown or checkboxes?
- Carrier filter (USPS, UPS, FedEx) — dropdown or checkboxes?
- Date range (today, this week, this month, custom)
- Store / client filter (if multi-store)?
- Residential flag (yes, no, unknown)
- Cost range (show orders between $X and $Y)
- Shipping method (ground, express, overnight)?
- Any others?

**Q1.7: How should filters work?**
- Multiple filters at once (AND logic)? E.g., status=awaiting AND carrier=USPS AND date=today?
- Or exclusive filters (only one filter at a time)?
- Should filters persist when you navigate away and come back?
- Should there be a "clear all filters" button?
- Should there be a "save filter" feature for frequently-used combos?

**Q1.8: Search functionality**
- Should there be a search bar? What should it search?
  - Order ID (exact match)?
  - Customer name (substring)?
  - Shipping address (street, city, ZIP)?
  - SKU / product name?
  - Tracking number?
- Should search be real-time (as you type) or on-submit (press Enter)?
- Should search results be highlighted in the table?

### Pagination & Performance

**Q1.9: Pagination strategy**
- Traditional pagination (Previous/Next buttons + page numbers)?
- "Load more" button?
- Infinite scroll (auto-load as you scroll down)?
- Which feels better to you?

**Q1.10: For large lists (1000+ orders), how should the app behave?**
- Load all at once (slow first load, fast interactions)?
- Load first 50, then lazy-load as needed?
- Load first 100, with "load more" button?
- Server-side pagination (only load the page you're viewing)?

---

## PART 2: CLICKING BEHAVIOR — ORDER DETAIL

### What Happens When You Click an Order Row?

**Q2.1: Click target & panel behavior**
- When you click a row, does it:
  - A) Open a slide-out panel on the right side (overlay)?
  - B) Open a modal dialog (centered popup)?
  - C) Open a new page / navigate to `/orders/:id`?
  - D) Expand the row inline to show more details?
  - **Which feels right to you?**

**Q2.2: Can you click anywhere on the row, or only specific cells?**
- Click anywhere on the row → open detail?
- Click only on Order ID → open detail?
- Click only on a detail button/icon → open detail?
- Should some cells be actionable? (e.g., click customer name → filter by customer)

**Q2.3: If a side panel opens, what sections should it show? (in order)**
1. **Header**: Order ID, customer name, order date, status badge
2. **Shipping info**: Ship-to address, ZIP code, residential flag (inferred or override?), carrier selection
3. **Items**: List of SKUs/products in order
4. **Rates & Billing**: 
   - Base rate (from ShipStation)
   - Residential surcharge ($ or %?)
   - Selected carrier
   - Carrier markup %
   - Calculated total
   - Full breakdown: "($100 base + $3 residential) × 1.15 = $118.45"?
5. **Label section**: 
   - Label status (awaiting, created, printed, failed)
   - Tracking number (if created)
   - Label PDF download link
   - "Print Label" button / "Create Label" button
6. **Timestamps**: Order created, label created, order shipped
7. **Audit trail**: Full history of calculations, changes, errors
8. **Other**: Notes/comments, customer contact info, etc.?

**Q2.4: Should panel sections be:**
- All expanded (everything visible)?
- Collapsible (click section header to expand/collapse)?
- Tabbed (Shipping tab, Items tab, Billing tab, etc.)?
- Scrollable (panel scrolls if content is long)?

**Q2.5: Should you be able to close the panel?**
- Click X button?
- Click outside the panel?
- Press Escape key?
- All of the above?

### Editing in Detail Panel

**Q2.6: What fields should be editable in the detail panel?**
- Carrier selection (before label created)?
  - Dropdown with USPS, UPS, FedEx options?
  - Show rates for each carrier before selection?
- Residential flag (override)?
  - Manual toggle before label created?
  - Lock after label created?
- Shipping address?
  - Edit address before label created?
  - Lock after label created?
- Markup % (per-order override)?
  - Allow override of default markup?
  - Or always use default?
- Any other fields?

**Q2.7: After label is created/printed, what should be locked?**
- Everything? (read-only mode)
- Only certain fields? (address locked, carrier locked)
- Nothing? (allow edits anytime)

**Q2.8: If user edits something (e.g., changes carrier) after viewing, should:**
- Changes save automatically?
- Require an explicit "Save" button?
- Show a warning "Changes not saved"?
- Recalculate rates/billing automatically?

---

## PART 3: LABEL CREATION — BEHAVIOR & EDGE CASES

### The "Print Label" / "Create Label" Button

**Q3.1: Button placement & visibility**
- Should button be in the detail panel?
- Should button also be in the table row (right column)?
- Should button be in both places?

**Q3.2: Button states**
What should the button look like/say in each scenario?
- Order created, no label yet: "Print Label" (blue, clickable)
- Label is being created: "⏳ Creating label..." (disabled, gray)
- Label created, ready: "✅ Label ready" (disabled, green) + "Download PDF" button
- Label creation failed: "❌ Label failed" (red) + "Retry" button

**Q3.3: When user clicks "Print Label" — immediate or confirmation?**
- Option A: Immediately call ShipStation API (fire & forget)
- Option B: Show confirmation dialog: "Create label for Order #1234 to USPS? This cannot be undone."
- Option C: Show preview/review screen (show address, rate, etc. before confirming)
- **Which do you prefer?**

**Q3.4: After clicking, what should happen?**
- Button shows loading spinner ("Creating...")
- Toast notification appears: "Label created for Order #1234"
- Order status changes from "awaiting" to "shipped" automatically
- Tracking number appears in panel
- PDF link becomes clickable
- Should PDF auto-open in new tab, or just save link?

**Q3.5: Error handling — if label creation fails**
- What error message should be shown?
  - Generic: "Label creation failed. Please try again."
  - Specific: Show the actual ShipStation error (invalid address, etc.)?
- Where should error appear?
  - Toast notification?
  - Modal dialog?
  - Inline error message in detail panel?
- Should user be able to retry immediately, or is there a cooldown?
- Should order stay in "awaiting" status, or change to "failed"?

**Q3.6: Idempotency — what if user clicks "Print Label" twice by accident?**
- Should the second click be prevented (button disabled)?
- Should it create a duplicate label?
- Should it return the existing label (idempotent)?
- Should it show a warning ("Label already created")?

**Q3.7: Multi-carrier scenario — user creates label, then wants to change carrier**
- Should this be allowed?
- If allowed, what happens to the first label? (void it, keep it, warn user?)
- Should there be a "Void label" button to cancel and retry with different carrier?

### Refund & Void Label

**Q3.8: Should there be a "Void Label" button in the detail panel?**
- Only visible if label exists?
- Clicking it voids the label and refunds the shipping cost?
- Shows confirmation: "This will void the label and refund $XX. Continue?"
- After voiding, order status goes back to "awaiting"?

---

## PART 4: RATES & BILLING — EDGE CASES

### Multi-Carrier Rate Display

**Q4.1: When order is awaiting shipment, how many carriers should be shown?**
- Option A: Show all 3 carriers (USPS, UPS, FedEx) with their rates
- Option B: Show only the "best rate" (cheapest carrier)
- Option C: Show only the pre-selected carrier (if one was selected)
- Option D: Show USPS as default, allow user to see others via dropdown
- **Which is the user experience you want?**

**Q4.2: If showing multiple carriers, should each show:**
- Base rate (pre-markup)?
- Rate with markup applied?
- Delivery time estimate?
- Service level (Ground, 2-Day, Overnight)?
- All of the above?

**Q4.3: Rate caching — rates are cached for 30 minutes**
- Should user see when rates were last fetched?
- Should there be a "Refresh rates" button to force a fresh lookup?
- Should there be a warning if rates are >5 minutes old?

### Residential Surcharge

**Q4.4: Residential surcharge — how is it determined?**
- Auto-inferred from ZIP code?
- Manual override by user?
- Show both (inferred + allow override)?
- Should there be a visual indicator (e.g., "(inferred)" label)?

**Q4.5: If inferred incorrectly, can user override?**
- Before label created? Yes?
- After label created? No?
- How obvious is the override option to the user?

### Billing Calculation Display

**Q4.6: How should billing be displayed in the detail panel?**
- Option A: Simple — "Total: $118.45" (final number only)
- Option B: Breakdown — "Base: $100, Residential: $3, Markup: $15.45, Total: $118.45"
- Option C: Full math — "($100 + $3) × 1.15 = $118.45"
- Option D: All of the above (collapsed by default, expandable)?
- **Which feels right?**

**Q4.7: Rounding edge cases**
- If calculation results in $118.445, should it round to $118.44 or $118.45?
- Should user see the rounding logic, or should it be hidden?
- Is banker's rounding acceptable, or do you need a different method?

**Q4.8: Should there be an audit trail of billing calculations?**
- Show: "Calculated on 2026-03-25 18:46, Base $100 → +$3 residential → ×1.15 markup = $118.45"
- For compliance / verification purposes?

---

## PART 5: EDGE CASES & UNUSUAL SCENARIOS

### Multi-User Concurrency

**Q5.1: If two users view the same order simultaneously:**
- Should they see each other's changes in real-time?
- What if both try to print a label at the same time?
- Should there be optimistic locking to prevent double-labels?
- Should user A see "User B created a label" notification?

### Offline & Network Failures

**Q5.2: If user's internet drops while creating a label:**
- Should the action queue and retry when online?
- Should there be an offline indicator?
- Should pending actions show in UI with retry button?

### Large Orders

**Q5.3: Order with 50 SKUs / 100 items:**
- Should all items be shown in detail panel, or paginated?
- Should there be a summary ("50 items") with ability to expand?
- Should there be a "Items" tab separate from other sections?

### Unusual Addresses

**Q5.4: If shipping address is invalid (missing ZIP, bad street, etc.):**
- Should label creation be blocked entirely?
- Should warning appear but allow retry?
- Should there be an address validation tool?

**Q5.5: If address is ambiguous (e.g., "123 Main St" in a city with multiple Main Streets):**
- Should app prompt user to confirm address?
- Should it auto-select the most likely match?
- Should user see the full confirmed address before label is created?

### Very Old Orders

**Q5.6: If user tries to create a label for an order from 6 months ago:**
- Should this be blocked (order too old)?
- Should there be a warning?
- Should it be allowed, or is there a business rule against it?

---

## PART 6: UNIQUE FEATURES & SPECIAL REQUESTS

### Features Outside Standard Flow

**Q6.1: Are there any features in the current app that we haven't discussed?**
- Print queue (batch label printing)?
- CSV export of orders?
- Picklist generation?
- Inventory integration?
- Analytics / reporting?
- Other?

**Q6.2: What features are most important to recreate first?**
- Order list + filter
- Order detail panel
- Label creation
- Billing display
- Something else?

**Q6.3: What features are "nice-to-have" vs. "must-have"?**
- Real-time updates?
- Dark mode?
- Mobile app?
- Offline mode?
- Advanced analytics?

**Q6.4: Are there any quirks / workarounds in the current app that frustrate you?**
- Things that don't work well?
- Things that are confusing?
- Things you'd want changed?
- Performance issues?

**Q6.5: What would make this app better than the original?**
- Faster load times?
- Better mobile experience?
- Simpler UI?
- More features?
- Different workflow?

---

## PART 7: CLARIFYING QUESTIONS

### Navigation & Global State

**Q7.1: Should the app have a sidebar/navigation menu?**
- Yes, with links to Orders, Clients, Inventory, Billing, Settings?
- No, just the main Orders page and detail panel?
- Hamburger menu on mobile?
- Top navigation bar instead?

**Q7.2: Should there be a "home" / "dashboard" page?**
- Summary stats (orders today, shipped today, pending labels, etc.)?
- Quick access to common actions?
- Or go straight to Orders list?

**Q7.3: Multi-store / multi-client support**
- Should app support multiple stores/clients?
- If yes, should there be a store/client selector in nav or filter?
- Can a user switch clients mid-session?

### Mobile Responsiveness

**Q7.4: Should the app work on mobile?**
- Desktop-first (mobile a secondary concern)?
- Mobile-optimized (responsive design)?
- Native mobile app (separate from web)?
- What's the priority?

### Settings & Configuration

**Q7.5: Should there be a Settings page for:**
- Markup configuration (USPS 10%, UPS 15%, FedEx 20%)?
- Column visibility (which columns to show in orders table)?
- Default filters (auto-apply filters on load)?
- Dark mode / theme?
- Other?

**Q7.6: Who should have access to Settings?**
- All users?
- Admin only?
- Role-based permissions?

---

## PART 8: WHERE MIGHT WE HAVE GONE WRONG?

### Questions for DJ to Review Our Assumptions

**Q8.1: In our current rebuild, we've made these assumptions. Which are wrong?**
- Orders table is the main page (not a dashboard)
- Clicking an order opens a side panel (not a modal or new page)
- Markup is applied as a percentage, per carrier
- Billing formula is `(baseRate + residential) × (1 + markup%)`
- Residential surcharge is a fixed $ amount (not %)
- Label creation is manual (user clicks button, not automatic)
- Rates are cached for 30 minutes

**Q8.2: In the original app, what was confusing or broken that we should fix?**
- UI that didn't make sense?
- Bugs that were never fixed?
- Performance issues?
- Workflow problems?

**Q8.3: What was the original app's biggest pain point for you as a user?**
- Speed?
- Complexity?
- Missing features?
- Error handling?
- Mobile experience?

---

## Summary: Questions by Priority

### CRITICAL (Must answer before starting build)
- Q1.1: First page?
- Q1.2: Default view of orders table?
- Q1.3: Essential columns?
- Q2.1: Detail view type (panel, modal, page)?
- Q2.3: Sections in detail panel?
- Q3.1-Q3.4: Label creation flow?
- Q4.1: Multi-carrier display?
- Q7.1: Navigation structure?

### HIGH (Needed for first iteration)
- Q1.4-Q1.5: Column features (sort, filter, color)?
- Q1.6-Q1.8: Filters and search?
- Q2.6-Q2.8: Editability and saves?
- Q3.5-Q3.7: Error handling and idempotency?
- Q4.4-Q4.6: Residential and billing display?
- Q7.4: Mobile responsiveness?

### MEDIUM (Nice-to-have for later)
- Q2.4-Q2.5: Panel interactions (collapsible, tabs)?
- Q4.7-Q4.8: Rounding and audit trail?
- Q5.x: Edge cases?
- Q6.x: Unique features?
- Q7.5-Q7.6: Settings and permissions?

---

## How to Use This Document

1. **For DJ**: Read through, answer all questions (prioritize CRITICAL first)
2. **For Albert & Kayla**: Collect DJ's answers, cross-reference with original app code/UI
3. **Build**: Use answers to build UI with minimal ambiguity
4. **Validate**: Show built UI to DJ, confirm it matches expectations

---

**Goal**: Zero surprises during development. Full clarity before first line of code.

**Last Updated**: 2026-03-25 18:46 EDT
