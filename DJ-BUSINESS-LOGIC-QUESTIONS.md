---
title: DJ Business Logic Questions — UI Section Breakdown
created: 2026-03-25 18:40 EDT
audience: DJ (business owner)
purpose: Clarify expected behavior for each UI section
---

# Business Logic Questions for DJ — By UI Section

This document breaks down all questions we need answered about **expected behavior** for the drprepperusa-v2 UI, organized by major UI sections.

---

## Section 1: Navigation Panel

### Visual Structure & Behavior

**Q1.1: Main Navigation Items**
- What are the primary navigation categories in the left sidebar/header?
- Should navigation be:
  - Flat (all items at same level)?
  - Hierarchical (collapsible sections)?
  - Tabbed (grouped sections)?
- Examples from original: Orders, Clients, Billing, Settings, Reports, etc.?

**Q1.2: Navigation State Indicators**
- Should nav items show badges with counts? (e.g., "Orders (42)", "Pending Labels (3)")
- Should any nav items have visual indicators for:
  - Unread/new items?
  - Items requiring action (overdue, error)?
  - Loading states during sync?
- How frequently should counts update? (real-time, on-page-load, manual refresh?)

**Q1.3: Search / Quick Navigation**
- Should there be a search bar in the nav to quickly find:
  - Orders by order ID?
  - Customers by name?
  - Tracking numbers?
- Should search be global (all data) or scoped (current view only)?

**Q1.4: Settings & Admin Section**
- What admin/settings options should be in the nav?
  - Markup rules configuration?
  - ShipStation credentials?
  - Client management?
  - Rate cache refresh?
  - Audit logs?
- Who should have access to settings? (all users, admins only?)

**Q1.5: User Menu / Authentication**
- Should there be a user profile menu (top-right, bottom-left)?
- Should it show:
  - Current user name / client?
  - Logout option?
  - Dark mode toggle?
- Multi-client support: should users be able to switch clients in this menu?

**Q1.6: Mobile Responsiveness**
- On mobile, should nav be:
  - Hamburger menu (hidden by default)?
  - Sticky top bar with essential items?
  - Bottom tab navigation?
  - Collapsible sidebar?

---

## Section 2: Orders Table Page

### Table Structure & Display

**Q2.1: Table Columns (Order Details)**
- Which columns should be visible by default?
  - Order ID (always visible?)
  - Customer name?
  - Order date?
  - Ship-to address (full or abbreviated)?
  - Item count?
  - Base rate / calculated cost?
  - Residential flag (indicator)?
  - Carrier?
  - Current status (awaiting, shipped, etc.)?
  - Label status (none, pending, ready, failed)?
- Should columns be:
  - Sortable?
  - Filterable?
  - Reorderable?
  - Resizable?
  - Hideable (column visibility toggle)?

**Q2.2: Table Row States & Visual Indicators**
- Should rows have different background colors for status?
  - Awaiting label: light yellow?
  - Shipped (label ready): light green?
  - Error (label failed): light red?
  - Processing (label pending): light gray?
- Should rows show any hover effects?
  - Highlight row?
  - Show action buttons?
  - Show preview tooltip?

**Q2.3: Row Expansion / Detail View**
- Should clicking a row expand to show more details, or open a side panel?
- What additional details should be shown in expanded view?
  - Full shipping address?
  - Items list with SKUs?
  - Billing breakdown (base rate + residential + markup + total)?
  - Label tracking number / PDF link?
  - Full audit trail (calculations, errors)?
  - Timestamps (created, shipped, label printed)?

**Q2.4: Pagination & Sorting**
- How many rows per page? (10, 25, 50, 100?)
- Should there be a "Load more" button or traditional pagination controls?
- Default sort order? (newest first, oldest first, by status?)
- Should sorting be:
  - Single column?
  - Multi-column (hold Shift + click)?

**Q2.5: Filtering & Search**
- Should there be filters for:
  - Status (awaiting, shipped, failed)?
  - Carrier (USPS, UPS, FedEx)?
  - Date range?
  - Residential flag?
  - Cost range?
  - Label status?
- Should filters be:
  - In a sidebar?
  - In a collapsible panel above the table?
  - Inline with column headers?
- Should filters be cumulative (AND logic) or exclusive (OR logic)?

**Q2.6: Bulk Actions**
- Should there be a checkbox to select multiple rows?
- Should bulk actions be available? (e.g., bulk print labels, bulk refund, bulk export?)
- Should there be a "Select all" checkbox?
- Should bulk action buttons appear in a sticky toolbar above/below table?

**Q2.7: Real-time Updates & Sync**
- Should the table auto-refresh in the background?
  - Every 5 seconds? 30 seconds? 5 minutes? On-demand?
  - Should there be a visual indicator that data is stale?
  - Should there be a manual "Refresh" button?
- When a label is created or order changes, should the row update immediately?
- Should there be a toast/notification when changes occur?

---

## Section 3: Behavior of Clicking

### Order Row / Order Detail Panel

**Q3.1: Click Target & Action**
- When user clicks a row, what should happen?
  - Option A: Open a slide-out right panel showing order details?
  - Option B: Expand the row inline to show details?
  - Option C: Open a modal dialog?
  - Option D: Navigate to a detail page?
  - **Which do you prefer?**

**Q3.2: Order Detail Panel — Sections**
Assuming a slide-out panel opens, what sections should it show?
- **Header**: Order ID, customer name, status badge
- **Shipping Info**: Ship-to address, residential flag (Y/N), carrier selection
- **Items**: List of items in order
- **Rates & Billing**:
  - Base rate (from ShipStation)
  - Residential surcharge (if applicable)
  - Carrier markup percentage
  - Calculated total cost
  - Breakdown showing (base + residential) × (1 + markup%) = total
- **Label**: Current label status, tracking number, PDF link
- **Actions**: Buttons to print label, refund, cancel, resend, etc.
- **Audit Trail**: Full history of calculations, status changes, errors

**Q3.3: Order Detail Panel — What Should Be Editable?**
- Can users edit:
  - Carrier choice (before label printed)?
  - Residential flag (before label printed)?
  - Shipping address (before label printed)?
  - Markup percentage (per-order override)?
- What should be locked after label is printed?
  - Everything? Only certain fields?

**Q3.4: Print Label Button Behavior**
- Button label: "Print Label", "Create Label", "Ship Order"?
- When user clicks "Print Label":
  - Does it immediately call ShipStation API?
  - Does it show a confirmation dialog first ("Print label for order #1234 to USPS?)?
  - Does it disable the button and show a loading spinner?
  - Does it show a success toast when complete?
  - Does it open the label PDF in a new tab, or just save a link?

**Q3.5: Label Status Transitions**
- After label is printed, what changes?
  - Order status changes from "awaiting" to "shipped"?
  - Print Label button becomes disabled ("Label already printed")?
  - Tracking number appears in the panel?
  - Ability to download/view the label PDF?
  - Should user be able to print the label again, or print a duplicate?

**Q3.6: Error Handling When Printing Label**
- If label creation fails (API error, invalid address, etc.):
  - Should error message appear in a toast, modal, or inline?
  - Should error details be shown to user, or generic message?
  - Should there be a "Retry" button?
  - Should order remain in "awaiting" state?
  - Should user be able to try again immediately, or is there a cooldown?

**Q3.7: Residential Flag Behavior**
- How is residential flag determined?
  - Auto-inferred from ZIP code (Tier 1 logic)?
  - User-selectable override?
  - Both (show inferred value, allow user to override)?
- If inferred, should there be a visual indicator that it's inferred vs. manually set?
- Can user change residential flag after order is created?
  - Before label printed? Yes?
  - After label printed? No?

**Q3.8: Markup & Billing Display**
- Should the billing breakdown be shown in the order panel?
  - Fully expanded: "Base $100 + Residential $3 = $103, × 1.15 markup = $118.45"?
  - Simplified: "Base $100, Total $118.45, Markup $18.45"?
  - Just show final total?
- Should user be able to:
  - Override carrier markup per-order?
  - See the historical calculation if it changes?
  - Export billing details?

**Q3.9: Multi-Carrier Selection**
- Should user be able to see rates from multiple carriers (USPS, UPS, FedEx)?
  - Option A: Show one recommended carrier (best rate)?
  - Option B: Show all 3 carriers with their rates, let user choose?
  - Option C: Show all carriers, but default to recommended?
- If multiple carriers shown, should each have:
  - Rate (pre-markup)?
  - Rate (post-markup)?
  - Delivery time estimate?
  - Service level (Ground, 2-Day, Overnight)?

---

## Section 4: Cross-Cutting Concerns

### Behavior That Spans Multiple Sections

**Q4.1: State Synchronization**
- If user prints a label while order panel is open:
  - Should the panel update in real-time?
  - Should it show a "refreshed" indicator?
  - Should the table also update immediately?

**Q4.2: Permissions & Multi-User**
- If multiple users are viewing the same order:
  - Should they see each other's changes in real-time?
  - What happens if two users try to print a label simultaneously?
  - Should there be an optimistic lock (prevent double-label)?

**Q4.3: Offline Behavior**
- If the internet connection drops:
  - Should pending actions (like "print label") queue and retry?
  - Should there be an offline indicator?
  - Should the UI gracefully degrade?

**Q4.4: Performance & Caching**
- Rates are cached for 30 minutes. Should user be able to:
  - Force refresh rates for an order?
  - See when rates were last fetched?
  - See a "rates may be stale" warning?

**Q4.5: Notifications & Alerts**
- Should user receive notifications for:
  - Label printed successfully?
  - Label creation failed (action required)?
  - Orders awaiting action (no label)?
  - ShipStation webhook updates (label status changed)?
- Should notifications be:
  - Toast (auto-dismiss)?
  - Persistent badge (requires action)?
  - Both?

---

## Summary of Priority Questions for DJ

### Immediate (Blocking UI Design)
1. **Q2.1**: Which columns should be visible in orders table?
2. **Q3.1**: When clicking an order, open a panel, modal, or navigate to detail page?
3. **Q3.2**: What sections should be in the order detail panel?
4. **Q3.4**: How should "Print Label" button behave (immediate, confirmation, etc.)?

### High Priority (Next Sprint)
5. **Q2.2**: Should rows have color-coding by status?
6. **Q2.4**: How many rows per page, default sort order?
7. **Q3.5**: What happens after label is printed (order status change, button disable)?
8. **Q3.9**: Show one carrier or all 3 carriers (USPS, UPS, FedEx)?

### Medium Priority (Nice-to-Have)
9. **Q2.5**: What filters should be available?
10. **Q2.6**: Should bulk actions be available?
11. **Q4.1-Q4.5**: State sync, permissions, offline, caching, notifications

---

## How to Use This Document

**For DJ**:
1. Read through each section
2. Answer the questions that apply to your use case
3. Mark priority questions as "Required" vs. "Nice-to-have"
4. Provide sketches or references if available

**For Albert & Kayla**:
1. Share this with DJ
2. Collect DJ's answers
3. Build UI based on DJ's requirements
4. Validate that delivered UI matches expectations

---

**Ready to send to DJ for clarification.** 🚀

**Last Updated**: 2026-03-25 18:40 EDT
