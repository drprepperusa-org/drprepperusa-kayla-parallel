/**
 * billingStore.test.ts — Phase 3 Week 2 Billing Store Tests
 *
 * Q7 (DJ, LOCKED): Formula, label-rates rule, auto-calc on ship, void behavior.
 *
 * Test categories:
 *  1. calculateBilling — accuracy, label rates, formula, rounding
 *  2. recalculateBilling — field changes, idempotency
 *  3. voidBilling — prevents recalculation, marks voided
 *  4. settings — prepCost, packageCostPerOz effects
 *  5. getBilling — lookup helper
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBillingStore } from './billingStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: reset store between tests
// ─────────────────────────────────────────────────────────────────────────────

function resetStore() {
  useBillingStore.setState({
    billings: {},
    settings: { prepCost: 0, packageCostPerOz: 0 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. calculateBilling — accuracy, label rates, formula, rounding
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.calculateBilling — formula accuracy (Q7 LOCKED)', () => {
  beforeEach(resetStore);

  it('stores billing record after calculation', () => {
    const { calculateBilling, billings } = useBillingStore.getState();
    calculateBilling({ orderId: 'order-1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    expect(useBillingStore.getState().billings['order-1']).toBeDefined();
    void billings;
  });

  it('Q7 formula: (shipping + prep + package) × (1 + markup%) — zero prep/pkg', () => {
    const { calculateBilling } = useBillingStore.getState();
    // 10 × 1.15 = 11.50
    const result = calculateBilling({ orderId: 'o1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 15 });
    expect(result?.totalCost).toBe(11.50);
  });

  it('Q7 formula: with prepCost setting', () => {
    useBillingStore.setState({ settings: { prepCost: 2, packageCostPerOz: 0 } });
    const { calculateBilling } = useBillingStore.getState();
    // (10 + 2) × 1.10 = 12 × 1.10 = 13.20
    const result = calculateBilling({ orderId: 'o2', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 10 });
    expect(result?.totalCost).toBe(13.20);
  });

  it('Q7 formula: with packageCostPerOz and weight', () => {
    useBillingStore.setState({ settings: { prepCost: 0, packageCostPerOz: 0.10 } });
    const { calculateBilling } = useBillingStore.getState();
    // pkg = 10oz × $0.10 = $1.00; (5 + 0 + 1) × 1.15 = 6 × 1.15 = 6.90
    const result = calculateBilling({ orderId: 'o3', shippingCost: 5, weightOz: 10, carrierMarkupPercent: 15 });
    expect(result?.packageCost).toBe(1.00);
    expect(result?.totalCost).toBe(6.90);
  });

  it('Q7 formula: all three costs combined', () => {
    useBillingStore.setState({ settings: { prepCost: 1.50, packageCostPerOz: 0.05 } });
    const { calculateBilling } = useBillingStore.getState();
    // pkg = 20oz × $0.05 = $1.00; subtotal = 8 + 1.50 + 1.00 = 10.50; × 1.20 = 12.60
    const result = calculateBilling({ orderId: 'o4', shippingCost: 8, weightOz: 20, carrierMarkupPercent: 20 });
    expect(result?.shippingCost).toBe(8);
    expect(result?.prepCost).toBe(1.50);
    expect(result?.packageCost).toBe(1.00);
    expect(result?.subtotal).toBe(10.50);
    expect(result?.totalCost).toBe(12.60);
  });

  it('zero markup: total equals subtotal', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o5', shippingCost: 7.50, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.totalCost).toBe(7.50);
  });

  it('banker\'s rounding: subtotal 5.225 rounds to 5.22 (522.5 → 522 even), then × 1.10 = 5.742 → 5.74', () => {
    const { calculateBilling } = useBillingStore.getState();
    // subtotal = roundToNearestCent(5.225) = 5.22  (banker's: 522.5 → 522, 2 is even)
    // totalCost = roundToNearestCent(5.22 × 1.10) = roundToNearestCent(5.742) = 5.74
    const result = calculateBilling({ orderId: 'o6', shippingCost: 5.225, weightOz: 0, carrierMarkupPercent: 10 });
    expect(result?.totalCost).toBe(5.74);
  });

  it('returns null on negative shippingCost', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o7', shippingCost: -1, weightOz: 0, carrierMarkupPercent: 10 });
    expect(result).toBeNull();
  });

  it('returns null on negative weightOz', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o8', shippingCost: 10, weightOz: -1, carrierMarkupPercent: 10 });
    expect(result).toBeNull();
  });

  it('returns null on negative carrierMarkupPercent', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o9', shippingCost: 10, weightOz: 0, carrierMarkupPercent: -5 });
    expect(result).toBeNull();
  });

  it('stores shippingCost from label, NOT fetched rate (Q7 invariant)', () => {
    // This test documents the Q7 contract: the caller must pass label cost.
    // billingStore does not access OrderDTO.enrichedRate or selectedRate.
    const { calculateBilling } = useBillingStore.getState();
    const labelShippingCost = 9.99; // from OrderLabel.shipmentCost
    const result = calculateBilling({ orderId: 'o10', shippingCost: labelShippingCost, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.shippingCost).toBe(labelShippingCost);
  });

  it('calculatedAt is a recent Date', () => {
    const { calculateBilling } = useBillingStore.getState();
    const before = Date.now();
    const result = calculateBilling({ orderId: 'o11', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 10 });
    const after = Date.now();
    expect(result?.calculatedAt).toBeInstanceOf(Date);
    expect(result?.calculatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result?.calculatedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('voided defaults to false on new record', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o12', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.voided).toBe(false);
    expect(result?.voidedAt).toBeUndefined();
  });

  it('roundingMethod is "bankers"', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o13', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.roundingMethod).toBe('bankers');
  });

  it('breakdown string contains shippingCost label', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o14', shippingCost: 7.50, weightOz: 0, carrierMarkupPercent: 15 });
    expect(result?.breakdown).toContain('$7.50 ship');
  });

  it('breakdown includes markup percentage when > 0', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'o15', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 15 });
    expect(result?.breakdown).toContain('15.00%');
  });

  it('LOCKED canonical case A: ($100 + $3 prep + $0 pkg) × 1.15 = $118.45', () => {
    // Verifies the formula matches the legacy billingService canonical test
    useBillingStore.setState({ settings: { prepCost: 3, packageCostPerOz: 0 } });
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'canonical-a', shippingCost: 100, weightOz: 0, carrierMarkupPercent: 15 });
    expect(result?.totalCost).toBe(118.45);
  });

  it('LOCKED canonical case B: $50 × 1.10 = $55.00', () => {
    const { calculateBilling } = useBillingStore.getState();
    const result = calculateBilling({ orderId: 'canonical-b', shippingCost: 50, weightOz: 0, carrierMarkupPercent: 10 });
    expect(result?.totalCost).toBe(55.00);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. recalculateBilling — field changes, idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.recalculateBilling', () => {
  beforeEach(resetStore);

  it('recalculates when fields change', () => {
    const { calculateBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'r1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 10 });
    // total was 11.00; now markup changes to 20%
    const result = recalculateBilling({ orderId: 'r1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 20 });
    expect(result?.totalCost).toBe(12.00);
  });

  it('recalculates when shippingCost changes (new label rate)', () => {
    const { calculateBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'r2', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    const result = recalculateBilling({ orderId: 'r2', shippingCost: 8, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.shippingCost).toBe(8);
    expect(result?.totalCost).toBe(8.00);
  });

  it('recalculates when settings change (prepCost updated)', () => {
    useBillingStore.setState({ settings: { prepCost: 0, packageCostPerOz: 0 } });
    const { calculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'r3', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });

    // Update settings, then recalculate
    useBillingStore.getState().updateSettings({ prepCost: 2 });
    const result = useBillingStore.getState().recalculateBilling({ orderId: 'r3', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.prepCost).toBe(2);
    expect(result?.totalCost).toBe(12.00);
  });

  it('updates the stored billing record', () => {
    const { calculateBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'r4', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 10 });
    recalculateBilling({ orderId: 'r4', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 20 });
    expect(useBillingStore.getState().billings['r4'].carrierMarkupPercent).toBe(20);
  });

  it('can recalculate on order with no prior billing (acts like calculateBilling)', () => {
    const { recalculateBilling } = useBillingStore.getState();
    const result = recalculateBilling({ orderId: 'r5-new', shippingCost: 15, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result?.totalCost).toBe(15.00);
  });

  it('returns null on invalid input (negative shippingCost)', () => {
    const { calculateBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'r6', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    const result = recalculateBilling({ orderId: 'r6', shippingCost: -1, weightOz: 0, carrierMarkupPercent: 0 });
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. voidBilling — prevents recalculation, marks voided
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.voidBilling — Q7 LOCKED', () => {
  beforeEach(resetStore);

  it('marks billing record as voided', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'v1', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('v1');
    expect(useBillingStore.getState().billings['v1'].voided).toBe(true);
  });

  it('sets voidedAt timestamp', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'v2', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    const before = Date.now();
    voidBilling('v2');
    const after = Date.now();
    const voided = useBillingStore.getState().billings['v2'];
    expect(voided.voidedAt).toBeInstanceOf(Date);
    expect(voided.voidedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(voided.voidedAt!.getTime()).toBeLessThanOrEqual(after);
  });

  it('recalculateBilling returns null on voided record', () => {
    const { calculateBilling, voidBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'v3', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('v3');
    const result = recalculateBilling({ orderId: 'v3', shippingCost: 20, weightOz: 0, carrierMarkupPercent: 10 });
    expect(result).toBeNull();
  });

  it('voided record is NOT updated by recalculateBilling', () => {
    const { calculateBilling, voidBilling, recalculateBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'v4', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('v4');
    recalculateBilling({ orderId: 'v4', shippingCost: 99, weightOz: 0, carrierMarkupPercent: 50 });
    // shippingCost should still be 10, not 99
    expect(useBillingStore.getState().billings['v4'].shippingCost).toBe(10);
    expect(useBillingStore.getState().billings['v4'].totalCost).toBe(10);
  });

  it('double-void is a no-op (does not change voidedAt)', () => {
    const { calculateBilling, voidBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'v5', shippingCost: 10, weightOz: 0, carrierMarkupPercent: 0 });
    voidBilling('v5');
    const firstVoidedAt = useBillingStore.getState().billings['v5'].voidedAt?.getTime();
    // Wait a tick and re-void
    voidBilling('v5');
    const secondVoidedAt = useBillingStore.getState().billings['v5'].voidedAt?.getTime();
    expect(firstVoidedAt).toBe(secondVoidedAt);
  });

  it('void on non-existent order is a no-op', () => {
    // Should not throw
    expect(() => {
      useBillingStore.getState().voidBilling('nonexistent-order');
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. settings — prepCost, packageCostPerOz effects
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.settings', () => {
  beforeEach(resetStore);

  it('updateSettings: changes prepCost', () => {
    useBillingStore.getState().updateSettings({ prepCost: 3.50 });
    expect(useBillingStore.getState().settings.prepCost).toBe(3.50);
  });

  it('updateSettings: changes packageCostPerOz', () => {
    useBillingStore.getState().updateSettings({ packageCostPerOz: 0.25 });
    expect(useBillingStore.getState().settings.packageCostPerOz).toBe(0.25);
  });

  it('updateSettings: partial update does not reset other fields', () => {
    useBillingStore.setState({ settings: { prepCost: 5, packageCostPerOz: 0.10 } });
    useBillingStore.getState().updateSettings({ prepCost: 7 });
    expect(useBillingStore.getState().settings.packageCostPerOz).toBe(0.10);
  });

  it('default settings are $0 for both (TBD per DJ)', () => {
    resetStore();
    const { settings } = useBillingStore.getState();
    expect(settings.prepCost).toBe(0);
    expect(settings.packageCostPerOz).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getBilling — lookup helper
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.getBilling', () => {
  beforeEach(resetStore);

  it('returns billing for known order', () => {
    const { calculateBilling, getBilling } = useBillingStore.getState();
    calculateBilling({ orderId: 'g1', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    expect(getBilling('g1')).toBeDefined();
    expect(getBilling('g1')?.totalCost).toBe(5);
  });

  it('returns undefined for unknown order', () => {
    expect(useBillingStore.getState().getBilling('unknown')).toBeUndefined();
  });
});
