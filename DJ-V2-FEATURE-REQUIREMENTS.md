---
title: For DJ — V2 Feature Requirements & Questions
created: 2026-03-25 22:11 EDT
audience: DJ (business owner only)
purpose: Business logic decisions needed to unblock development
---

# DJ: Feature Requirements & Questions

## MVP Scope Decision

Which of these are MUST-HAVE for MVP (first release)?

- Orders list + detail (awaiting shipping)? **YES**
- Label creation (single order)? **YES**
- Rate comparison (show all 3 carriers)? **YES**
- Markup/billing calculations? **YES**
- Batch print queue (print multiple labels at once)? **Y/N?**
- Inventory management? **Y/N?**
- Sales analytics? **Y/N?**
- Settings/preferences (remember filters, column visibility)? **Y/N?**
- Multi-client support (manage multiple storefronts)? **Y/N?**

---

## Feature Details

### Batch Label Printing
- When you print 5 labels, should they:
  - Merge into one PDF file? OR
  - Stay as separate PDFs?

### Inventory Management
- Do you manage package/box inventory in the app, or buy as-needed from suppliers?
- Do you need stock alerts, or just view-only inventory?
- How complex is your SKU hierarchy (parent SKUs with variants)?

### Multi-Warehouse
- Do you ship from one warehouse, or multiple locations?
- Do you change your ship-from address often, or is it static?

### Settings & Persistence
- Should the app remember your preferred filters/columns across sessions?
- Which is more important: remembering filters, or remembering markup rules?

### Multi-Client
- Do you run multiple storefronts/clients, or just one?
- If multiple, should you manage them all in one session (with a client selector)?

---

## V2 Behavior Validation

### Workflow Questions
1. In the original V2 app, what was your TYPICAL workflow for printing a label?
   - (e.g., "Search for order → click → select carrier → print → move to next")

2. What filters did you use MOST on the orders table?
   - (e.g., "Today's orders", "USPS only", "Awaiting labels", etc.)

3. When a label creation FAILED (API error, invalid address), what did you do?
   - (e.g., "retry immediately", "fix address first", "skip and come back later")

### Feature Priorities (1-5, where 1 = most important)
- Order list + filtering: **_____**
- Label creation: **_____**
- Batch printing: **_____**
- Rate comparison: **_____**
- Billing display: **_____**

### Pain Points
1. What frustrated you MOST about the V2 app?
2. What took too many clicks or was confusing?
3. What feature would make your life easier?

---

## Defaults (If you don't specify, we'll assume these)

- Single warehouse, single client
- Batch print: separate PDFs
- Inventory: Phase 2 (not MVP)
- Analytics: Phase 2 (not MVP)
- Batch print: nice-to-have (Phase 1)
- Multi-client: Phase 2 (not MVP)
- Settings: remember markups only (MVP)

**If any of these are WRONG, tell us now.**

---

## Timeline

Answer these questions by EOD tomorrow, and we can start building MVP by Friday.

---

**Last Updated**: 2026-03-25 22:11 EDT
