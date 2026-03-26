---
title: DJ's Answers — Q1, Q6, Q7 (LOCKED)
created: 2026-03-26 18:04 EDT
status: locked
---

# DJ's Answers to Critical Questions

## Q1: ShipStation V1/V2 Field Mapping

**Answer**: "We can do this once we get the API to pull in orders so we can verify with what it provides us."

**Implementation**:
- Defer exact field path extraction until real API integration
- Current code has stubbed `extractV1ShippingProviderId()` with TODO comment
- Once real orders come in from ShipStation API, we'll examine response structure
- Lock the mapping contract immediately after first successful extraction
- No changes allowed after locking

**Timeline**: Week 2-3 (after server-side proxy is live)

---

## Q6: External Shipment Detection (LOCKED)

**Answer**: 
> "An order is considered externally shipped if it's been shipped OUTSIDE of prepship OR shipstation. If there are shipstation records then it is considered shipped within shipstation. If shipstation has no records AND we didn't ship out of prepship, then it is considered externally shipped."

**Detection Logic**:
```
For each order:
  IF ShipStation has label/tracking for this order:
    → Order shipped via ShipStation (within system)
  ELSE IF prepship.shipped == true:
    → Order shipped via prepship (within system)
  ELSE IF ShipStation has NO records AND prepship.shipped == false:
    → Order shipped externally (DOUBLE-SHIP RISK)
```

**Critical Requirement**:
> "All orders must be checked to see if it's been shipped either through ss or externally every few minutes. The point of this is so that if it has been fulfilled outside of prepship, we don't ship it out of prepship again, which would double the shipping."

**Implementation**:
- Sync runs every few minutes (configurable, default 5 min)
- SyncService checks all orders for external shipments
- If external shipment detected:
  - Mark order `externallyShipped: true`
  - Move to "shipped" section
  - Show alert: "⚠️ Order shipped externally"
  - Disable label creation button (prevent double-ship)
- Database stores `externallyShipped` flag per order
- Cannot create label if `externallyShipped == true`

**Edge Cases**:
- Order in "awaiting_shipment" with no label → check SS for tracking
- Order with label but marked cancelled in SS → detect and update status
- Partial sync (SS returns subset) → continue checking

---

## Q7: Billing Workflow (LOCKED)

**Data Required** (per order):
- date
- description
- recipient
- store
- shipping cost (from label creation, NOT fetched rates)
- package size & dimensions
- **prep cost** (defined in billing section — TBD)

**Calculation Logic**:
```
Billing = (shipping_cost + prep_cost) + package_cost + other_fees
(Exact formula TBD after billing section is built)
```

**Key Rules**:
1. **Use label rates, never fetched rates**:
   > "The rates should be from when the label has been created, or when the ss records show the label rates. It should never be the fetched rates before label creation since these rates aren't locked in until it's selected and printed."

2. **Automatic calculation on ship**:
   > "The billing should automatically update as soon as each order is processed and shipped."
   - When order moved to "shipped" → calculate billing immediately
   - Trigger: `ordersStore.calculateOrderCosts(orderId)`

3. **Manual recalculation button**:
   > "There should be a calculate button that allows the user to refresh the calculations based on any fields that have changed."
   - Button in billing section: "Recalculate Billing"
   - Triggers `calculateOrderCosts` with current order data
   - Supports cost changes (markup updates, package size changes, etc.)

4. **Database persistence**:
   > "Billing should be stored in database."
   - Table: `order_billing` (orderId, shippingCost, prepCost, packageCost, totalCost, voided, calculatedAt)
   - Synced from OrdersStore to backend on every calculation

5. **Display location**:
   > "The billing should show only in the billing section, nowhere else."
   - Create dedicated "Billing" section/page
   - Show only for orders with `status == 'shipped'`
   - NOT in order table, NOT in detail panel, NOT in dashboard

6. **Void handling**:
   > "If an order has been voided, then there should be a mark on the billing at the order level notating that."
   - Add `voided: boolean` + `voidedAt: Date` to billing record
   - Show badge: "Voided" on billing entry
   - Recalculation not allowed on voided orders

**Billing Section Features**:
- Table: All shipped orders with billing data
- Columns: Order #, Customer, Shipping Cost, Prep Cost, Package Cost, Total, Voided, Last Calculated
- Filters: Date range, customer, store
- Actions: Recalculate button (per order or bulk)
- Export: CSV with all billing data

---

## Implementation Order (Based on DJ's Answers)

### Phase 2A (This week): Update Code with Locked Answers
1. Update `SyncService.detectExternallyShipped()` with exact logic above
2. Add automatic sync every 5 minutes (configurable)
3. Add `externallyShipped` flag to Order type
4. Disable label creation if `externallyShipped == true`
5. Mark "shipped" orders as ready for billing

### Phase 2B (Next week): Billing Section
1. Create `BillingSection.tsx` page
2. Add `billingStore.ts` (Zustand SSOT for billing data)
3. Add `calculateOrderCosts()` action (uses label rates, NOT fetched)
4. Add recalculate button with manual trigger
5. Add void tracking + UI badge
6. Wire to database persistence

### Phase 3 (Following week): Settings + Sync Frequency
1. Settings page: Configure sync frequency (default 5 min)
2. Prep cost + package cost definitions (builder UI in settings)
3. Billing formula customization (per store?)
4. Webhook integration (optional, for real-time SS updates)

---

## Summary

| Item | Answer | Impact |
|------|--------|--------|
| Q1 | Verify with real API data | Label creation works after API integration |
| Q6 | Check every 5min for external ships | Prevents double-shipping |
| Q7 | Billing auto-calc on ship, DB persist, separate section | Financial tracking complete |

**All answers locked and ready for implementation.**

---

**Last Updated**: 2026-03-26 18:04 EDT
**Status**: LOCKED (no changes without DJ approval)
