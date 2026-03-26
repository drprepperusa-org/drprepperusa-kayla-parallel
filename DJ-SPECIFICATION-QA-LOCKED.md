---
title: DJ Specification — Questions & Answers (LOCKED)
created: 2026-03-26 11:08 EDT
status: locked
audience: Albert (implementation decisions) + DJ (verification)
---

# DJ Specification — Complete Q&A

**Status**: All specifications locked. Ready for implementation strategy review.

---

## MVP Scope (9 Features — ALL LOCKED)

| Feature | Status |
|---------|--------|
| Orders list + detail | ✅ LOCKED |
| Label creation (single order) | ✅ LOCKED |
| Rate comparison (all 3 carriers) | ✅ LOCKED |
| Markup/billing calculations | ✅ LOCKED |
| Batch print queue | ✅ LOCKED |
| Inventory management | ✅ LOCKED |
| Sales analytics | ✅ LOCKED |
| Settings/preferences (persist) | ✅ LOCKED |
| Multi-client support (3PL) | ✅ LOCKED |

---

## Feature Details (LOCKED)

### Batch Printing
**Q**: When you print 5 labels, merge or separate PDFs?
**A**: Merge into ONE PDF

### Inventory Management
**Q**: Manage in-app or buy as-needed?
**A**: Manage in-app + stock alerts required

**Q**: SKU hierarchy complexity?
**A**: Parent SKUs with variants required

### Warehouses
**Q**: One or multiple?
**A**: One warehouse now, option to add more later

**Q**: Static or change often?
**A**: Mostly static

### Settings & Persistence
**Q**: Remember filters/markups across sessions?
**A**: YES — both important, filters priority

### Multi-Client
**Q**: One or multiple storefronts?
**A**: One login for 3PL with nested clients

**Q**: Manage all clients in one session?
**A**: YES — with client selector

---

## Workflow & Priorities (LOCKED)

### Typical Workflow
**Q**: How do you print labels?
**A**: Select order → verify dims/weight/rate → print or queue for batch printing

### Feature Priorities (1-5, 1 = most important)
1. Order list + filtering (PRIORITY #1)
2. Rate comparison (PRIORITY #2)
3. Label creation (PRIORITY #3)
4. Batch printing (PRIORITY #4)
5. Billing display (PRIORITY #5)

### Error Handling
**Q**: What happens if label creation fails?
**A**: Show error, leave order in state, NEVER auto-ship without success

---

## Rate Logic (LOCKED)

### Best Rate vs Selected Rate
**Q**: When to fetch rates?
**A**: Fetch all 3 carriers once when panel opens. One fetch, not three.

**Q**: What is "best rate"?
**A**: Best rate = lowest cost (suggestion only). User can always select any carrier manually.

**Q**: Can user override?
**A**: YES — best rate is recommended, never forced. User has full control.

---

## Selection Logic (LOCKED)

### Checkbox Mode (Multi-select)
- Check 1+ boxes → Shipping Panel (1 order) or Batch Panel (2+ orders)
- Uncheck last box → Panel empties
- Banner appears when 2+ checked: "X Orders Selected" with X button to clear

### Row Click Mode (Single-select)
- Click row → auto-check checkbox, show Shipping Panel
- Click different row → uncheck previous, check new, switch Shipping Panel
- Click row while 2+ already checked → NO ACTION (prevent misclick)

### Mutually Exclusive Modes
- Checkbox mode and row-click mode CANNOT mix
- If in checkbox mode (2+ checked), row clicks do nothing
- If in row-click mode (1 order), checking another checkbox cancels row and enters checkbox mode

### Empty States
- All checkboxes unchecked → empty panel
- Last row unselected → empty panel

---

## Panel Behavior (LOCKED)

### Persistent Right Panel
- Always visible on right side (not modal)
- Shows empty state when no orders selected
- Shows "Shipping Panel" for 1 order selected
- Shows "Batch Ship Panel" for 2+ orders selected (checkboxes)

### Two Detail Views (Same Location)
1. **Shipping Panel** — Click row → verify/rate/print
2. **Order Details Panel** — Click order # → view order from ShipStation

---

## Table Columns (23 Total — LOCKED)

Awaiting Shipment columns:
- select, date, client, orderNum, customer, itemname, sku, qty, weight, shipto, carrier, custcarrier, total, bestrate, margin, age

Shipped columns:
- Same as awaiting + tracking, labelcreated (remove age)

---

## Pagination (LOCKED)

### Bottom Left
- "Page 1 of 2" display
- "← Prev" button (disabled on page 1)
- "Next →" button (disabled on last page)

### Bottom Right
- Toggle: "50 | 100 | 200" (orders per page)
- Display: "1-50 of 105" (current range of total)

**Behavior**: Default 50 per page. Changing toggle resets to page 1. Range updates based on page + per-page.

---

## Filters & Search (LOCKED)

### Search Bar (Real-time, All Fields)
- Searches: date, client, order #, recipient name, item name, SKU
- Auto-populates as user types (no Enter needed)
- Instant results

### SKU Dropdown (Real-time, With Count)
- Shows all products
- Selecting SKU filters orders with that SKU
- Displays count: "12 orders"

### Date Filter (Dropdown)
- Today, Yesterday, Last 7 days, Last 14 days, Last 30 days, Last 90 days
- Filters by date range

### Critical: Cross-System Search
**All filters search/correlate across ALL orders in system, not just visible page**
- Example: Last 30 days selected, but search "Danny" finds order from 2 months ago → shows result
- Filters stack (search AND sku AND date all work together)

### SKU Sort Button
- Groups orders by SKU + quantity with headers
- (Details to follow)

---

## Export CSV (LOCKED)

**Behavior**:
- Downloads current page data only (respects pagination)
- Includes all visible columns (all data shown in table)
- Respects all active filters:
  - Client filter
  - Search filter
  - Date filter
  - SKU filter
- Works in both awaiting_shipment and shipped sections

**Example**: Client kfgoods, Page 1 of 2, 50 orders showing → Export downloads CSV with kfgoods orders from current page only

---

## Top-Right Controls (LOCKED)

### Last Sync Display
- Shows: "Last sync — 2 min ago"
- Updates when sync completes

### Sync Button (Incremental)
- Only fetch new/changed orders since last sync
- Check for externally shipped/cancelled orders
- Update order status if changed externally
- Reduces API calls (don't re-fetch existing orders)

### Columns Button (Dropdown)
- All 23 columns with toggle checkboxes
- Drag handles to reorder
- Persists user preference

### Zoom Button (Toggle)
- Options: 100% | 115% | 125%
- Zooms content only
- Fixed perimeter areas (left panel, right panel, top/bottom headers) stay fixed

### Labels Button
- (Details to follow)

### Print Queue Button
- (Details to follow)

---

## ShipStation Data Mapping (PENDING VERIFICATION)

**When label created, collect from V1 + V2**:
- V2 response: tracking_number, shipment_cost, carrier_code, service_code
- V1 response: shipmentId, providerAccountId, advancedOptions.billToMyOtherAccount

**Store on Order object**:
- selectedRate (cost from V2)
- trackingNumber (from V2)
- carrier (from V2)
- service (from V2)
- shippingProviderId / providerAccountId (from V1)
- carrierCode (from V1)

**Shipped section shows**:
- trackingNumber
- Shipping Account (nickname lookup via shippingProviderId)
- carrier
- service
- selectedRate

**LOCKED REQUIREMENT**: Once this mapping is set, it becomes immutable. No changes allowed even if new features demand additions.

---

## Pain Points Acknowledged (LOCKED)

**From V2**: "Inability to make new features without breaking existing code. Too many dependencies. Lack of hardcoded logic."

**Our approach**: Hardcode business logic, minimize dependencies, keep features loosely coupled.

---

**Last Updated**: 2026-03-26 11:08 EDT
**Status**: ALL SPECIFICATIONS LOCKED — Ready for implementation strategy
