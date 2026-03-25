/**
 * billingService.test.ts
 *
 * 40 tests for the Billing Calculation Service (Feature 7).
 *
 * ⚠️ Test cases A, B, C are LOCKED spec requirements.
 *     Do not modify expected values without finance team sign-off.
 */

import { describe, it, expect } from 'vitest';
import { calculateBillingCost, roundToNearestCent } from './billingService';

// ---------------------------------------------------------------------------
// LOCKED: Canonical Test Cases (A, B, C)
// Finance team sign-off required to change these.
// ---------------------------------------------------------------------------

describe('LOCKED: Canonical Test Cases', () => {
  it('Test Case A: ($100 + $3) × 1.15 = $118.45', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.totalCost).toBe(118.45);
  });

  it('Test Case B: ($50 + $0) × 1.10 = $55.00', () => {
    const result = calculateBillingCost(50, 0, 10);
    expect(result.totalCost).toBe(55.00);
  });

  it('Test Case C: ($200 + $5) × 1.20 = $246.00', () => {
    const result = calculateBillingCost(200, 5, 20);
    expect(result.totalCost).toBe(246.00);
  });

  it('Test Case A: subtotal is $103', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.subtotal).toBe(103);
  });

  it('Test Case A: markupAmount is $15.45', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.markupAmount).toBe(15.45);
  });

  it('Test Case B: subtotal is $50', () => {
    const result = calculateBillingCost(50, 0, 10);
    expect(result.subtotal).toBe(50);
  });

  it('Test Case C: subtotal is $205', () => {
    const result = calculateBillingCost(200, 5, 20);
    expect(result.subtotal).toBe(205);
  });
});

// ---------------------------------------------------------------------------
// Banker's Rounding — roundToNearestCent
// ---------------------------------------------------------------------------

describe("roundToNearestCent — banker's rounding (round-half-to-even)", () => {
  it('118.445 → 118.44 (4 is even)', () => {
    expect(roundToNearestCent(118.445)).toBe(118.44);
  });

  it('118.455 → 118.46 (6 is even)', () => {
    expect(roundToNearestCent(118.455)).toBe(118.46);
  });

  it('0.5 cents → 0.00 (0 is even)', () => {
    expect(roundToNearestCent(0.005)).toBe(0.00);
  });

  it('1.5 cents → rounds to 2 cents (2 is even)', () => {
    expect(roundToNearestCent(0.015)).toBe(0.02);
  });

  it('2.5 cents → rounds to 2 cents (2 is even)', () => {
    expect(roundToNearestCent(0.025)).toBe(0.02);
  });

  it('3.5 cents → rounds to 4 cents (4 is even)', () => {
    expect(roundToNearestCent(0.035)).toBe(0.04);
  });

  it('non-half values round normally: 118.446 → 118.45', () => {
    expect(roundToNearestCent(118.446)).toBe(118.45);
  });

  it('non-half values round normally: 118.444 → 118.44', () => {
    expect(roundToNearestCent(118.444)).toBe(118.44);
  });

  it('exact cent amounts pass through unchanged: 10.00', () => {
    expect(roundToNearestCent(10.00)).toBe(10.00);
  });

  it('exact cent amounts pass through unchanged: 0.01', () => {
    expect(roundToNearestCent(0.01)).toBe(0.01);
  });

  it('rounds very large amounts correctly: 10000.445 → 10000.44', () => {
    expect(roundToNearestCent(10000.445)).toBe(10000.44);
  });
});

// ---------------------------------------------------------------------------
// calculateBillingCost — return shape
// ---------------------------------------------------------------------------

describe('calculateBillingCost — return object shape', () => {
  it('returns all required fields', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result).toHaveProperty('baseRate');
    expect(result).toHaveProperty('residentialSurcharge');
    expect(result).toHaveProperty('carrierMarkupPercent');
    expect(result).toHaveProperty('subtotal');
    expect(result).toHaveProperty('markupAmount');
    expect(result).toHaveProperty('totalCost');
    expect(result).toHaveProperty('calculatedAt');
    expect(result).toHaveProperty('precision');
  });

  it('precision field is "bankers_rounding"', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.precision).toBe('bankers_rounding');
  });

  it('calculatedAt is a Date instance', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  it('mirrors input values back in the result', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.baseRate).toBe(100);
    expect(result.residentialSurcharge).toBe(3);
    expect(result.carrierMarkupPercent).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('calculateBillingCost — edge cases', () => {
  it('zero residential surcharge: $50 × 1.10 = $55.00', () => {
    const result = calculateBillingCost(50, 0, 10);
    expect(result.totalCost).toBe(55.00);
    expect(result.residentialSurcharge).toBe(0);
  });

  it('zero markup percent: passes through subtotal unchanged', () => {
    const result = calculateBillingCost(100, 5, 0);
    expect(result.totalCost).toBe(105.00);
    expect(result.markupAmount).toBe(0);
  });

  it('very small amount: $1 base, 0 surcharge, 10% markup = $1.10', () => {
    const result = calculateBillingCost(1, 0, 10);
    expect(result.totalCost).toBe(1.10);
  });

  it('very large amount: $10000 base, $500 surcharge, 15% markup = $12075.00', () => {
    const result = calculateBillingCost(10000, 500, 15);
    // (10000 + 500) × 1.15 = 10500 × 1.15 = 12075.00
    expect(result.totalCost).toBe(12075.00);
  });

  it('$0.01 precision: $0.10 base, $0 surcharge, 10% markup = $0.11', () => {
    const result = calculateBillingCost(0.10, 0, 10);
    expect(result.totalCost).toBe(0.11);
  });

  it('high markup percent: $100 base, $0 surcharge, 100% markup = $200.00', () => {
    const result = calculateBillingCost(100, 0, 100);
    expect(result.totalCost).toBe(200.00);
  });

  it('fractional base rate: $99.99 base, $0 surcharge, 10% markup → $109.99', () => {
    const result = calculateBillingCost(99.99, 0, 10);
    // 99.99 × 1.10 = 109.989 → rounds to 109.99
    expect(result.totalCost).toBe(109.99);
  });

  it('fractional surcharge: $100 base, $2.50 surcharge, 15% markup → $117.88', () => {
    const result = calculateBillingCost(100, 2.50, 15);
    // 102.50 × 1.15 = 117.875 → 117.88 (round half to even: 8 is even)
    expect(result.totalCost).toBe(117.88);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('calculateBillingCost — input validation', () => {
  it('throws on negative baseRate', () => {
    expect(() => calculateBillingCost(-1, 0, 10)).toThrow(/baseRate must be ≥ 0/);
  });

  it('throws on negative residentialSurcharge', () => {
    expect(() => calculateBillingCost(100, -1, 10)).toThrow(/residentialSurcharge must be ≥ 0/);
  });

  it('throws on negative carrierMarkupPercent (no discounts)', () => {
    expect(() => calculateBillingCost(100, 0, -1)).toThrow(/Negative markups/);
  });

  it('throws on NaN baseRate', () => {
    expect(() => calculateBillingCost(NaN, 0, 10)).toThrow(/Invalid baseRate/);
  });

  it('throws on NaN residentialSurcharge', () => {
    expect(() => calculateBillingCost(100, NaN, 10)).toThrow(/Invalid residentialSurcharge/);
  });

  it('throws on NaN carrierMarkupPercent', () => {
    expect(() => calculateBillingCost(100, 0, NaN)).toThrow(/Invalid carrierMarkupPercent/);
  });

  it('zero values are valid (no throws)', () => {
    expect(() => calculateBillingCost(0, 0, 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Audit trail — calculation breakdown
// ---------------------------------------------------------------------------

describe('calculateBillingCost — audit trail', () => {
  it('full breakdown stored for audit: Test Case A', () => {
    const result = calculateBillingCost(100, 3, 15);
    expect(result.baseRate).toBe(100);
    expect(result.residentialSurcharge).toBe(3);
    expect(result.carrierMarkupPercent).toBe(15);
    expect(result.subtotal).toBe(103);
    expect(result.markupAmount).toBe(15.45);
    expect(result.totalCost).toBe(118.45);
    expect(result.precision).toBe('bankers_rounding');
    expect(result.calculatedAt).toBeInstanceOf(Date);
  });

  it('full breakdown stored for audit: Test Case B', () => {
    const result = calculateBillingCost(50, 0, 10);
    expect(result.baseRate).toBe(50);
    expect(result.residentialSurcharge).toBe(0);
    expect(result.carrierMarkupPercent).toBe(10);
    expect(result.subtotal).toBe(50);
    expect(result.markupAmount).toBe(5.00);
    expect(result.totalCost).toBe(55.00);
  });

  it('calculatedAt timestamp is recent (within last 5 seconds)', () => {
    const before = Date.now();
    const result = calculateBillingCost(100, 3, 15);
    const after = Date.now();
    expect(result.calculatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.calculatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
