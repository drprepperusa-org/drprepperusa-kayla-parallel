---
title: Phase 3 Roadmap — Based on DJ's Q1-Q7 Answers
created: 2026-03-26 18:04 EDT
phase: 3
---

# Phase 3: Implementation Roadmap (Based on DJ's Locked Answers)

**Timeline**: 3 weeks (Week 5-7)

---

## Week 1: External Shipment Detection + Sync Hardening

### Task 1.1: Update SyncService with Q6 Logic
**File**: `src/services/syncService.ts`

```typescript
// Updated detectExternallyShipped logic:
for (const order of orders) {
  const hasShipStationLabel = order.label && order.label.trackingNumber;
  const hasPreshipShipped = order.status === 'shipped';
  const hasExternalLabel = hasShipStationLabel || hasPreshipShipped;
  
  if (!hasExternalLabel && hasShipStationLabel === false) {
    // No SS records AND prepship didn't ship it
    // → Order was shipped externally
    order.externallyShipped = true;
    order.status = 'shipped';
  }
}
```

**Update Order type**:
- Add `externallyShipped?: boolean`
- Add `externallyShippedAt?: Date`

**Test cases**:
- Order with SS label → not external
- Order shipped via prepship → not external
- Order with no label + no prepship shipping → external
- Order moved to shipped section on external detection

### Task 1.2: Automatic Sync Every 5 Minutes
**File**: `src/hooks/useSync.ts`

```typescript
// Add useInterval hook for automatic sync
useEffect(() => {
  const interval = setInterval(() => {
    syncOrders(); // Automatic sync every 5 min
  }, 5 * 60 * 1000);
  
  return () => clearInterval(interval);
}, []);
```

**Update Settings** (for now, hardcoded; later configurable):
- Sync frequency: 5 minutes (configurable later)
- Retry on failure: exponential backoff
- Silent in background (don't block UI)

### Task 1.3: Prevent Double-Shipping
**File**: `src/components/PrintLabelButton.tsx`

```typescript
// Disable label creation if externally shipped
<button
  onClick={createLabel}
  disabled={order.externallyShipped}
  title={order.externallyShipped ? "Order already shipped externally" : "Create label"}
>
  Create Label
</button>
```

**Show alert**:
```tsx
{order.externallyShipped && (
  <Alert type="warning">
    ⚠️ This order was shipped externally. Creating a label will result in double-shipping.
  </Alert>
)}
```

---

## Week 2: Billing Section + Q7 Implementation

### Task 2.1: Create Billing Section
**Files**: `src/pages/BillingSection.tsx`, `src/stores/billingStore.ts`

**BillingStore** (Zustand SSOT):
```typescript
interface BillingStoreState {
  // All shipped orders with billing data
  billings: Record<OrderId, BillingCalculation>;
  
  // Settings (moved from settings later)
  prepCost: number; // Default cost per order
  packageCostPerOz: number; // Cost per ounce
  
  // Actions
  calculateBilling(orderId: string): BillingCalculation;
  recalculateBilling(orderId: string): void;
  voidBilling(orderId: string): void;
  setBillingSettings(prepCost, packageCostPerOz): void;
}
```

**BillingCalculation** (expanded from current):
```typescript
interface BillingCalculation {
  orderId: string;
  
  // Inputs
  shippingCost: number; // From label (NOT fetched rate)
  prepCost: number; // Default or custom
  packageCost: number; // weight * packageCostPerOz
  
  // Fees (TBD in billing section)
  processingFee?: number;
  handlingFee?: number;
  
  // Markup
  carrierMarkup: number; // 10% USPS, 15% UPS, 20% FedEx
  
  // Totals
  subtotal: number; // shipping + prep + package
  markupAmount: number;
  totalCost: number;
  
  // Status
  voided: boolean;
  voidedAt?: Date;
  calculatedAt: Date;
  
  // Audit
  breakdown: string; // Formula breakdown
}
```

### Task 2.2: Billing Section UI
**File**: `src/pages/BillingSection.tsx`

**Components**:
1. BillingTable
   - Columns: Order #, Customer, Store, Shipping Cost, Prep Cost, Package Cost, Total, Voided, Last Calculated
   - Filters: Date range, customer, store, voided status
   - Sort by: Date, customer, total, status
   - Pagination: 50/100/200 per page

2. RecalculateButton
   - Per order: "Recalculate" button
   - Bulk: "Recalculate All" button
   - Shows spinner during calculation
   - Shows "Updated: 2 min ago" after calculation

3. VoidedBadge
   - Shows on voided orders
   - Gray background with text "Voided"
   - Tooltip: "Voided at [date] by [user]"
   - Recalculation disabled for voided orders

4. ExportButton
   - Export CSV with all billing columns
   - Include filters (date range, store, etc.)

### Task 2.3: Calculate on Ship
**File**: `src/stores/ordersStore.ts`

```typescript
// When order moves to shipped:
markOrderAsShipped(orderId: string) {
  // 1. Update order status
  const order = this.allOrders.find(o => o.id === orderId);
  order.status = 'shipped';
  order.shippedAt = new Date();
  
  // 2. Auto-calculate billing
  const billing = billingStore.calculateBilling(orderId);
  
  // 3. Persist to database (backend)
  await api.post(`/api/billing/${orderId}`, billing);
}
```

### Task 2.4: Recalculation Logic
**File**: `src/stores/billingStore.ts`

```typescript
calculateBilling(orderId: string): BillingCalculation {
  const order = ordersStore.getState().allOrders.find(o => o.id === orderId);
  
  // Get label rates (NOT fetched rates)
  const shippingCost = order.label?.shipment_cost || 0;
  
  // Calculate prep cost (default from settings)
  const prepCost = this.prepCost;
  
  // Calculate package cost = weight * rate per oz
  const weightOz = order.weight;
  const packageCost = weightOz * this.packageCostPerOz;
  
  // Subtotal
  const subtotal = shippingCost + prepCost + packageCost;
  
  // Markup (per carrier)
  const carrierMarkup = getMarkupPercent(order.label?.carrier_code); // 10% USPS, etc.
  const markupAmount = subtotal * (carrierMarkup / 100);
  
  // Total
  const totalCost = subtotal + markupAmount;
  
  return {
    orderId,
    shippingCost,
    prepCost,
    packageCost,
    carrierMarkup,
    subtotal,
    markupAmount,
    totalCost,
    voided: false,
    calculatedAt: new Date(),
    breakdown: `(${shippingCost} + ${prepCost} + ${packageCost}) × (1 + ${carrierMarkup}%) = ${totalCost}`
  };
}

recalculateBilling(orderId: string) {
  if (this.billings[orderId]?.voided) {
    throw new Error('Cannot recalculate voided billing');
  }
  
  const updated = this.calculateBilling(orderId);
  this.billings[orderId] = updated;
  
  // Persist to database
  await api.put(`/api/billing/${orderId}`, updated);
}

voidBilling(orderId: string) {
  this.billings[orderId].voided = true;
  this.billings[orderId].voidedAt = new Date();
  
  // Persist to database
  await api.put(`/api/billing/${orderId}/void`, {
    voided: true,
    voidedAt: new Date()
  });
}
```

---

## Week 3: Settings + Database Persistence

### Task 3.1: Billing Settings Page
**File**: `src/pages/SettingsPage.tsx` (billing section)

**Fields**:
- Prep Cost (per order): `$X.XX` (e.g., $2.50)
- Package Cost (per oz): `$X.XXX` (e.g., $0.50/oz)
- Carrier Markup: USPS %, UPS %, FedEx % (existing, just expose here)
- Sync Frequency: 5 min, 10 min, 30 min, 1 hour
- Auto-void orders after: (optional) X days

**Persistence**:
- Save to backend: POST /api/settings/billing
- Load on app start
- Update billingStore on change

### Task 3.2: Database Schema
**Tables**:
```sql
CREATE TABLE order_billing (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  client_id UUID REFERENCES clients(id),
  
  -- Costs
  shipping_cost DECIMAL(10, 2),
  prep_cost DECIMAL(10, 2),
  package_cost DECIMAL(10, 2),
  carrier_markup_percent INT,
  markup_amount DECIMAL(10, 2),
  
  -- Totals
  subtotal DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  
  -- Status
  voided BOOLEAN DEFAULT false,
  voided_at TIMESTAMP,
  
  -- Audit
  calculated_at TIMESTAMP,
  calculated_by UUID,
  breakdown TEXT,
  
  -- Metadata
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX idx_order_billing_order_id ON order_billing(order_id);
CREATE INDEX idx_order_billing_client_id ON order_billing(client_id);
CREATE INDEX idx_order_billing_calculated_at ON order_billing(calculated_at);
```

### Task 3.3: Backend API Endpoints
**Endpoints**:
```
GET /api/billing/:orderId → BillingCalculation
POST /api/billing/:orderId → Create (auto-calculated on ship)
PUT /api/billing/:orderId → Recalculate
PUT /api/billing/:orderId/void → Void billing
GET /api/billing?clientId=...&dateRange=... → List (with filters)
POST /api/billing/recalculate-bulk → Recalculate all in date range
GET /api/settings/billing → Get prep cost, package cost, sync freq
PUT /api/settings/billing → Update settings
```

---

## Implementation Checklist

### Week 1: External Shipment Detection
- [ ] Update SyncService with Q6 logic
- [ ] Add `externallyShipped` field to Order type
- [ ] Automatic sync every 5 minutes
- [ ] Disable label creation if externally shipped
- [ ] Show alert when order shipped externally
- [ ] Tests: external detection, double-ship prevention
- [ ] PR: Review + merge

### Week 2: Billing Section
- [ ] Create BillingSection.tsx page
- [ ] Create billingStore.ts (Zustand)
- [ ] Implement calculateBilling logic
- [ ] Implement recalculateBilling with manual button
- [ ] Implement voidBilling with UI badge
- [ ] Create BillingTable with columns, filters, sorting
- [ ] Wire "Calculate" button to recalculateBilling
- [ ] Wire markOrderAsShipped to auto-calculate
- [ ] Tests: calculation accuracy, recalculation, void behavior
- [ ] PR: Review + merge

### Week 3: Settings + Database
- [ ] Add billing settings to SettingsPage
- [ ] Create database table for order_billing
- [ ] Implement backend API endpoints
- [ ] Persist billing to database on calculate
- [ ] Sync frequency settings (configurable)
- [ ] Load prep/package costs on app startup
- [ ] Tests: settings persistence, database queries
- [ ] PR: Review + merge

---

## Q1 Follow-Up

**When real API is integrated**:
1. Examine V1 and V2 response samples
2. Extract exact field paths
3. Update `labelService.ts` → `extractV1ShippingProviderId()`
4. Test label creation with real API
5. Lock field mapping contract (immutable)

---

## Testing Strategy

**Unit Tests**:
- detectExternallyShipped() with various scenarios
- calculateBilling() with different costs
- recalculateBilling() with field changes
- voidBilling() prevents recalc

**Integration Tests**:
- Order shipped externally → auto-detect → disable label
- Order shipped via prepship → auto-calculate billing
- User recalculates billing → costs updated
- Voided order → show badge, prevent recalc

**E2E Tests**:
- Side-by-side with V2
- Verify billing calculations match
- Test sync every 5 min detects external ships
- Test prep + package costs are applied correctly

---

## Known Unknowns (Ask DJ)

1. **Prep cost formula**: Per order or per item?
2. **Package cost formula**: Per oz or per package?
3. **Additional fees**: Processing fee, handling fee, etc.?
4. **Carrier markup source**: From markup store or per label?
5. **Database persistence**: Which fields to save?
6. **Sync frequency**: 5 min default, user-configurable?
7. **Voided order behavior**: Can it be un-voided?

---

**Status**: Ready to implement Phase 3 based on DJ's locked answers.

**Last Updated**: 2026-03-26 18:04 EDT
