/**
 * billingService.ts — Billing Calculation Service (Feature 7)
 *
 * Formula:
 *   cost = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)
 *
 * Rounding: Banker's rounding (IEEE 754 round-half-to-even) to nearest $0.01
 *
 * ⚠️ Revenue-impacting. All changes require finance team review.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillingCalculation {
  baseRate: number;
  residentialSurcharge: number;
  carrierMarkupPercent: number;
  /** baseRate + residentialSurcharge */
  subtotal: number;
  /** subtotal × (carrierMarkupPercent / 100), rounded to nearest cent */
  markupAmount: number;
  /** subtotal + markupAmount, rounded to nearest cent via banker's rounding */
  totalCost: number;
  calculatedAt: Date;
  /** Always 'bankers_rounding' — IEEE 754 round-half-to-even */
  precision: string;
}

// ---------------------------------------------------------------------------
// Banker's rounding (round-half-to-even, IEEE 754)
// ---------------------------------------------------------------------------

/**
 * Round a dollar amount to the nearest cent using banker's rounding (round-half-to-even).
 *
 * Standard arithmetic rounding (round-half-up) introduces a systematic upward bias
 * in financial calculations. Banker's rounding eliminates that bias by rounding
 * half-values to the nearest even digit.
 *
 * Examples:
 *   118.445 → 118.44 (round to even: 4 is even)
 *   118.455 → 118.46 (round to even: 6 is even)
 *   0.5     → 0.00   (round to even: 0 is even)
 *   1.5     → 2.00   (round to even: 2 is even)
 */
export function roundToNearestCent(amount: number): number {
  // Work in integer cents to avoid IEEE 754 floating-point accumulation errors.
  // Multiply by 100 to work in cents; floor to get the integer cent.
  const scaled = amount * 100;

  // Decompose into integer part and fractional part
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;

  // Tolerance for floating-point near-equality comparisons
  const EPSILON = 1e-10;

  // Is the fractional part exactly 0.5 (within floating-point tolerance)?
  const isHalf = Math.abs(fraction - 0.5) < EPSILON;

  let rounded: number;
  if (isHalf) {
    // Banker's rounding: round to even
    rounded = floor % 2 === 0 ? floor : floor + 1;
  } else {
    // Standard rounding for non-half values
    rounded = Math.round(scaled);
  }

  return rounded / 100;
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Calculate billing cost using the canonical formula.
 *
 * Formula: cost = (baseRate + residentialSurcharge) × (1 + carrierMarkupPercent / 100)
 *
 * Constraints:
 *   - carrierMarkupPercent must be ≥ 0 (no discounts)
 *   - baseRate must be ≥ 0
 *   - residentialSurcharge must be ≥ 0
 *
 * @throws {Error} if any input violates constraints
 */
export function calculateBillingCost(
  baseRate: number,
  residentialSurcharge: number,
  carrierMarkupPercent: number,
): BillingCalculation {
  // --- Input validation ---
  if (typeof baseRate !== 'number' || isNaN(baseRate)) {
    throw new Error(`[billingService] Invalid baseRate: ${baseRate}`);
  }
  if (typeof residentialSurcharge !== 'number' || isNaN(residentialSurcharge)) {
    throw new Error(`[billingService] Invalid residentialSurcharge: ${residentialSurcharge}`);
  }
  if (typeof carrierMarkupPercent !== 'number' || isNaN(carrierMarkupPercent)) {
    throw new Error(`[billingService] Invalid carrierMarkupPercent: ${carrierMarkupPercent}`);
  }
  if (baseRate < 0) {
    throw new Error(`[billingService] baseRate must be ≥ 0, got: ${baseRate}`);
  }
  if (residentialSurcharge < 0) {
    throw new Error(`[billingService] residentialSurcharge must be ≥ 0, got: ${residentialSurcharge}`);
  }
  if (carrierMarkupPercent < 0) {
    throw new Error(
      `[billingService] Negative markups (discounts) are not allowed. carrierMarkupPercent: ${carrierMarkupPercent}`,
    );
  }

  // --- Calculation ---
  const subtotal = baseRate + residentialSurcharge;
  const markupAmount = roundToNearestCent(subtotal * (carrierMarkupPercent / 100));
  const totalCost = roundToNearestCent(subtotal + subtotal * (carrierMarkupPercent / 100));

  return {
    baseRate,
    residentialSurcharge,
    carrierMarkupPercent,
    subtotal,
    markupAmount,
    totalCost,
    calculatedAt: new Date(),
    precision: "bankers_rounding",
  };
}
