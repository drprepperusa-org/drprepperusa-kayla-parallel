---
title: DJ Pending Questions — Needed Before Build Starts
created: 2026-03-26 11:08 EDT
status: pending-answers
---

# DJ Pending Questions

**These 6 questions MUST be answered before final implementation strategy is locked.**

---

## Q1: ShipStation API Field Mapping (CRITICAL)

**Why needed**: To lock immutable data extraction contract.

**Question**: Provide sample responses for:
1. V1 GET /shipments/{id} response (JSON)
2. V2 POST /labels response (JSON)

**What we need to verify**:
- Exact field paths for: shippingProviderId, shipment_cost, carrier_code, service_code, trackingNumber
- How to map V1 providerAccountId to "Shipping Account" nickname
- Where carrier_code comes from (V1 or V2)

**Once answered**: We'll document exact extraction logic and lock it as immutable.

---

## Q2: Batch Panel Details (HIGH PRIORITY)

**Question**: When 2+ orders are selected (Batch Panel), what should display?

- Show thumbnails of all selected orders?
- Show just a summary (e.g., "3 orders, 5 SKUs, $450 total")?
- Allow user to adjust carrier/rate for ALL selected orders at once?
- Show individual carrier selection per order?

**What we're building toward**: Batch print → merge all labels into one PDF. Need to know how user selects carriers for multiple orders.

---

## Q3: SKU Sort Grouping Logic (HIGH PRIORITY)

**Question**: Explain "SKU sort button" behavior in detail.

**From spec**: "group all orders per sku +qty with a header so we can batch print instead of having to click all like-kind orders one at a time"

- Does this mean: Group orders by (SKU, Qty) combination?
  - Example: 3 orders with SKU-123 qty 2 grouped together with header "SKU-123 Qty: 2 (3 orders)"?
- Can user then click the group header to select all 3 orders at once?
- Does grouping change pagination (show groups instead of individual orders)?

---

## Q4: Labels Button Functionality (HIGH PRIORITY)

**Question**: What should "Labels" button do?

Options:
- A) Create label for selected order (same as Shipping Panel print?)
- B) Show list of created labels?
- C) Manage label settings (format, size, layout)?
- D) Something else?

---

## Q5: Print Queue Workflow (HIGH PRIORITY)

**Question**: Explain complete Print Queue workflow.

**From spec**: "Batch print queue" feature (Priority #4)

- How does user trigger Print Queue?
- Workflow: Add to queue → Review → Print all as merged PDF?
- Can user modify orders in queue before printing (change carriers, etc.)?
- After printing, what happens to queued orders (auto-shipped, stay in awaiting, etc.)?
- Persistence: Does queue persist if page reloads?

---

## Q6: External Shipment Detection (HIGH PRIORITY)

**Question**: How to detect externally shipped/cancelled orders?

**From spec**: "Sync button should check if orders shipped externally and update status"

- How do we know an order was shipped outside of drprepperusa?
  - Check ShipStation API for orders with tracking numbers that don't exist in our DB?
  - Check shipment status from ShipStation webhook?
  - Other method?
- If externally shipped: Update order status to "shipped" + populate tracking from ShipStation?
- If externally cancelled: Update order status to "cancelled"?
- What's the exact logic to determine "external" vs "created in drprepperusa"?

---

## Q7: BillingCalculation Workflow (HIGH PRIORITY)

**Question**: How and when should BillingCalculation be populated?

**From spec**: Order has optional `billing` field (BillingCalculation object)

- When is billing calculated?
  - When rates are fetched (before label creation)?
  - When label is created (after user confirms carrier)?
  - On sync/update?
  - On-demand per order?
- Should billing persist in database or computed on-demand?
- Does billing calculation trigger when markup rules change?
- Should billing be displayed in the order table or only in the detail panel?
- If a label is voided, should the billing record be cleared?

---

## Summary

**Once these 7 are answered, we can**:
1. Lock immutable ShipStation data mapping (Q1)
2. Build Batch Panel UI (Q2)
3. Build SKU Sort grouping (Q3)
4. Build Labels button functionality (Q4)
5. Build Print Queue workflow (Q5)
6. Build incremental sync with external detection (Q6)
7. Wire BillingCalculation into Zustand + BillingService (Q7)

**Estimated answers needed by**: Before implementation strategy review

---

**Last Updated**: 2026-03-26 11:08 EDT
