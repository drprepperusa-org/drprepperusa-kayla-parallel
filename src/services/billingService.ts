/**
 * @file billingService.ts
 * @description Billing calculation service — Phase 2 service layer.
 *
 * IMMUTABLE CONTRACT:
 * ⚠️ This file implements the canonical billing formula. Revenue-impacting.
 * Finance team review required before any change. Formula is locked.
 *
 * Formula: cost = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)
 * Rounding: Banker's rounding (IEEE 754 round-half-to-even), nearest $0.01
 *
 * This service is a thin wrapper over the existing billingService.ts in utils/,
 * extending it with:
 * - Richer BillingCalculation (with audit trail breakdown string)
 * - Integration with OrdersStore types (types/orders.ts BillingCalculation)
 * - Convenience helpers for order-level billing
 *
 * The original utils/billingService.ts is preserved for backward compat.
 * New code should import from this service.
 *
 * @example
 * ```ts
 * // Calculate billing for a selected rate
 * const result = calculateBilling({
 *   baseRate: 7.50,
 *   residentialSurcharge: 4.40,
 *   carrierMarkupPercent: 15,
 * });
 *
 * if (result.ok) {
 *   console.log(result.calculation.totalCost); // → 13.68
 *   console.log(result.calculation.breakdown);
 *   // → "$7.50 base + $4.40 residential × (1 + 15%) = $13.68"
 * }
 * ```
 */

import type { BillingCalculation, RoundingMethod } from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input for a billing calculation. All amounts in USD dollars. */
export interface BillingInput {
  /** Raw carrier cost from ShipStation, before markup. Must be >= 0. */
  baseRate: number;
  /** Extra charge for residential delivery. Must be >= 0. */
  residentialSurcharge: number;
  /**
   * Client-specific markup percentage.
   * e.g. 15 = 15% markup. Must be >= 0 (no discounts).
   */
  carrierMarkupPercent: number;
  /** Optional: creator/context for audit purposes. */
  context?: string;
}

export type BillingServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'NEGATIVE_RESULT';

export class BillingServiceError extends Error {
  constructor(
    message: string,
    public readonly code: BillingServiceErrorCode,
    public readonly input?: BillingInput,
  ) {
    super(message);
    this.name = 'BillingServiceError';
  }
}

/** Result type — prefer over throwing. */
export type BillingResult =
  | { ok: true; calculation: BillingCalculation }
  | { ok: false; error: BillingServiceError };

// ─────────────────────────────────────────────────────────────────────────────
// Banker's Rounding (IEEE 754 round-half-to-even)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round a dollar amount to the nearest cent using banker's rounding.
 *
 * Standard math.round() has upward bias at 0.5 boundaries.
 * Banker's rounding eliminates that bias by rounding to the nearest EVEN digit.
 *
 * Examples:
 *   roundToNearestCent(118.445) → 118.44  (4 is even)
 *   roundToNearestCent(118.455) → 118.46  (6 is even)
 *   roundToNearestCent(0.5)     → 0.00    (0 is even)
 *   roundToNearestCent(1.5)     → 2.00    (2 is even)
 *   roundToNearestCent(2.5)     → 2.00    (2 is even)
 *   roundToNearestCent(3.5)     → 4.00    (4 is even)
 *
 * @param amount - Dollar amount to round
 * @returns Amount rounded to nearest cent via IEEE 754 round-half-to-even
 */
export function roundToNearestCent(amount: number): number {
  const scaled = amount * 100;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;

  const EPSILON = 1e-10;
  const isHalf = Math.abs(fraction - 0.5) < EPSILON;

  let rounded: number;
  if (isHalf) {
    // Round to even
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    rounded = Math.round(scaled);
  }

  return rounded / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateBillingInput(input: BillingInput): BillingServiceError | null {
  if (typeof input.baseRate !== 'number' || isNaN(input.baseRate)) {
    return new BillingServiceError('baseRate must be a valid number', 'VALIDATION_ERROR', input);
  }
  if (typeof input.residentialSurcharge !== 'number' || isNaN(input.residentialSurcharge)) {
    return new BillingServiceError('residentialSurcharge must be a valid number', 'VALIDATION_ERROR', input);
  }
  if (typeof input.carrierMarkupPercent !== 'number' || isNaN(input.carrierMarkupPercent)) {
    return new BillingServiceError('carrierMarkupPercent must be a valid number', 'VALIDATION_ERROR', input);
  }
  if (input.baseRate < 0) {
    return new BillingServiceError(`baseRate must be >= 0, got ${input.baseRate}`, 'VALIDATION_ERROR', input);
  }
  if (input.residentialSurcharge < 0) {
    return new BillingServiceError(`residentialSurcharge must be >= 0, got ${input.residentialSurcharge}`, 'VALIDATION_ERROR', input);
  }
  if (input.carrierMarkupPercent < 0) {
    return new BillingServiceError(
      `Negative markups (discounts) are not allowed. carrierMarkupPercent: ${input.carrierMarkupPercent}`,
      'VALIDATION_ERROR',
      input,
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Trail Breakdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a human-readable audit trail string for a billing calculation.
 * Format: "$7.50 base + $4.40 residential × (1 + 15%) = $13.68"
 */
function buildBreakdown(
  baseRate: number,
  residentialSurcharge: number,
  carrierMarkupPercent: number,
  totalCost: number,
): string {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const parts: string[] = [];

  parts.push(`${fmt(baseRate)} base`);

  if (residentialSurcharge > 0) {
    parts.push(`${fmt(residentialSurcharge)} residential`);
  }

  const subtotalStr = residentialSurcharge > 0
    ? `(${fmt(baseRate + residentialSurcharge)} subtotal)`
    : '';

  const markupStr = carrierMarkupPercent > 0
    ? `× (1 + ${carrierMarkupPercent.toFixed(2)}%)`
    : '';

  const breakdown = [
    parts.join(' + '),
    subtotalStr,
    markupStr,
    `= ${fmt(totalCost)}`,
  ]
    .filter(Boolean)
    .join(' ');

  return breakdown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Calculate Billing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate billing cost using the immutable canonical formula.
 *
 * Formula (LOCKED — finance review required to change):
 *   cost = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)
 *
 * Rounding: Banker's rounding (IEEE 754 round-half-to-even) to nearest $0.01
 *
 * This function is pure (no side effects, no store access).
 * The returned BillingCalculation includes a full audit trail.
 *
 * @param input - Billing input (baseRate, residentialSurcharge, carrierMarkupPercent)
 * @returns BillingResult — ok=true with calculation, or ok=false with typed error
 *
 * @example
 * ```ts
 * const result = calculateBilling({ baseRate: 7.50, residentialSurcharge: 4.40, carrierMarkupPercent: 15 });
 * // result.calculation.totalCost === 13.68
 * // result.calculation.breakdown === "$7.50 base + $4.40 residential (subtotal $11.90) × (1 + 15%) = $13.68"
 * ```
 */
export function calculateBilling(input: BillingInput): BillingResult {
  const validationError = validateBillingInput(input);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const { baseRate, residentialSurcharge, carrierMarkupPercent } = input;

  // Apply formula — order of operations is locked
  const subtotal = baseRate + residentialSurcharge;
  const multiplier = 1 + carrierMarkupPercent / 100;
  const rawTotal = subtotal * multiplier;

  // Banker's rounding
  const totalCost = roundToNearestCent(rawTotal);

  if (totalCost < 0) {
    return {
      ok: false,
      error: new BillingServiceError(
        `Billing resulted in negative cost: ${totalCost}. Check inputs.`,
        'NEGATIVE_RESULT',
        input,
      ),
    };
  }

  const calculation: BillingCalculation = {
    // Q7 new fields — services/billingService.ts maps legacy shape to expanded type
    // shippingCost = baseRate (carrier rate from label); prep + package = 0 (legacy caller)
    shippingCost: baseRate,
    prepCost: 0,
    packageCost: 0,
    voided: false,
    // Legacy fields (backward compat — retained as-is)
    baseRate,
    residentialSurcharge,
    carrierMarkupPercent,
    subtotal,
    totalCost,
    breakdown: buildBreakdown(baseRate, residentialSurcharge, carrierMarkupPercent, totalCost),
    calculatedAt: new Date(),
    roundingMethod: 'bankers' as RoundingMethod,
  };

  return { ok: true, calculation };
}

/**
 * Calculate billing and throw on error (use when you're sure inputs are valid).
 * Prefer calculateBilling() for user-facing code that needs to handle errors.
 *
 * @throws {BillingServiceError}
 */
export function calculateBillingOrThrow(input: BillingInput): BillingCalculation {
  const result = calculateBilling(input);
  if (!result.ok) throw result.error;
  return result.calculation;
}

/**
 * Quick billing total without the full audit trail object.
 * Useful for display in the UI before storing the full calculation.
 *
 * @param baseRate - Raw carrier cost
 * @param residentialSurcharge - Residential delivery surcharge
 * @param carrierMarkupPercent - Carrier markup %
 * @returns Total cost in dollars, or null if inputs are invalid
 */
export function quickBillingTotal(
  baseRate: number,
  residentialSurcharge: number,
  carrierMarkupPercent: number,
): number | null {
  const result = calculateBilling({ baseRate, residentialSurcharge, carrierMarkupPercent });
  return result.ok ? result.calculation.totalCost : null;
}
