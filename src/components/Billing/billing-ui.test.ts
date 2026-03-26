/**
 * billing-ui.test.ts — Billing UI behavior tests (pure store logic).
 *
 * Tests the observable behavior that BillingSection.tsx and VoidedBadge
 * depend on: store state transitions that drive recalculate button
 * enabled/disabled state and voided badge visibility.
 *
 * Q7 (DJ, LOCKED):
 *  - Recalculate button blocked on voided orders
 *  - VoidedBadge shown when billing.voided === true
 *  - Active orders show enabled recalculate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBillingStore } from '../../stores/billingStore';
import type { BillingCalculation } from '../../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function resetStore() {
  useBillingStore.setState({
    billings: {},
    settings: { prepCost: 0, packageCostPerOz: 0 },
  });
}

/**
 * Simulate the recalculate button logic from BillingSection.tsx.
 * Returns true if recalculation is allowed (button enabled).
 */
function canRecalculate(billing: BillingCalculation | undefined): boolean {
  if (!billing) return false;
  return !billing.voided;
}

/**
 * Simulate VoidedBadge visibility logic from BillingSection.tsx.
 * Returns true if the badge should be shown.
 */
function shouldShowVoidedBadge(billing: BillingCalculation | undefined): boolean {
  return billing?.voided === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recalculate button logic
// ─────────────────────────────────────────────────────────────────────────────

describe('BillingSection — Recalculate button enabled/disabled (Q7 LOCKED)', () => {
  beforeEach(resetStore);

  it('recalculate button is ENABLED for active (non-voided) billing record', () => {
    const { calculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'ui-1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    const billing = useBillingStore.getState().billings['ui-1'];
    expect(canRecalculate(billing)).toBe(true);
  });

  it('recalculate button is DISABLED for voided billing record', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'ui-2', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('ui-2');
    const billing = useBillingStore.getState().billings['ui-2'];
    expect(canRecalculate(billing)).toBe(false);
  });

  it('recalculate button is DISABLED for undefined billing (no record)', () => {
    expect(canRecalculate(undefined)).toBe(false);
  });

  it('after recalculate, record is still active (not voided)', () => {
    const { calculateBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'ui-3', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    recalculateBilling({ orderId: 'ui-3', shippingCost: 15, weightOz: 0, carrierMarkupPercent: 0 });
    const billing = useBillingStore.getState().billings['ui-3'];
    expect(canRecalculate(billing)).toBe(true);
    expect(billing.totalCost).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VoidedBadge visibility logic
// ─────────────────────────────────────────────────────────────────────────────

describe('VoidedBadge — visibility driven by billing.voided (Q7 LOCKED)', () => {
  beforeEach(resetStore);

  it('badge NOT shown for active order', () => {
    const { calculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'badge-1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    const billing = useBillingStore.getState().billings['badge-1'];
    expect(shouldShowVoidedBadge(billing)).toBe(false);
  });

  it('badge SHOWN after voidBilling', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'badge-2', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('badge-2');
    const billing = useBillingStore.getState().billings['badge-2'];
    expect(shouldShowVoidedBadge(billing)).toBe(true);
  });

  it('badge NOT shown for undefined billing', () => {
    expect(shouldShowVoidedBadge(undefined)).toBe(false);
  });

  it('badge has voidedAt date when voided', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'badge-3', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('badge-3');
    const billing = useBillingStore.getState().billings['badge-3'];
    expect(billing.voidedAt).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk recalculate all (BillingSection.tsx behavior)
// ─────────────────────────────────────────────────────────────────────────────

describe('BillingSection — Bulk recalculate all', () => {
  beforeEach(resetStore);

  it('bulk recalculate skips voided orders', () => {
    const { calculateBilling, voidBilling, recalculateBilling, billings: _ } = useBillingStore.getState();
    void _;

    // Create two orders
    calculateBilling({ orderId: 'bulk-1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    calculateBilling({ orderId: 'bulk-2', shippingCost: 15, weightOz: 0, carrierMarkupPercent: 0 });

    // Void one
    voidBilling('bulk-1');

    // Simulate "Recalculate All" — only non-voided orders
    const billings = useBillingStore.getState().billings;
    const allOrderIds = ['bulk-1', 'bulk-2'];

    for (const orderId of allOrderIds) {
      const b = billings[orderId];
      if (!b?.voided) {
        recalculateBilling({ orderId, shippingCost: 20, weightOz: 0, carrierMarkupPercent: 0 });
      }
    }

    // bulk-1 (voided) unchanged
    expect(useBillingStore.getState().billings['bulk-1'].shippingCost).toBe(10);
    // bulk-2 (active) updated
    expect(useBillingStore.getState().billings['bulk-2'].shippingCost).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV export logic (field correctness)
// ─────────────────────────────────────────────────────────────────────────────

describe('BillingSection — CSV export data correctness', () => {
  beforeEach(resetStore);

  it('voided status reflected in CSV "Voided" column', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'csv-1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('csv-1');
    const billing = useBillingStore.getState().billings['csv-1'];
    // This is what BillingSection.tsx puts in the CSV
    const csvVoidedValue = billing.voided ? 'Yes' : 'No';
    expect(csvVoidedValue).toBe('Yes');
  });

  it('active record exports "No" for voided column', () => {
    const { calculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'csv-2', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    const billing = useBillingStore.getState().billings['csv-2'];
    const csvVoidedValue = billing.voided ? 'Yes' : 'No';
    expect(csvVoidedValue).toBe('No');
  });

  it('totalCost formatted correctly for CSV', () => {
    const { calculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'csv-3', shippingCost: 12.5, weightOz: 0, carrierMarkupPercent: 10 });
    const billing = useBillingStore.getState().billings['csv-3'];
    expect(billing.totalCost.toFixed(2)).toBe('13.75');
  });
});
