/**
 * markupService.ts
 *
 * Markup Chain Calculation Service (Feature 4)
 *
 * Applies carrier-specific markup percentages to base shipping rates.
 * Markup is applied AFTER residential surcharge (see Billing feature for full formula).
 *
 * Default markup rules (admin-configurable via markupStore):
 *   USPS:  10%
 *   UPS:   15%
 *   FedEx: 20%
 *
 * Formula: markedUpRate = baseRate × (1 + markupPercent / 100)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MarkupRule {
  /** Carrier name: 'USPS', 'UPS', 'FedEx' */
  carrier: string;
  /** Markup percentage: e.g., 10 for 10%, 15 for 15% */
  markupPercent: number;
  /** Multi-tenant client identifier — each client has own markup rules */
  clientId: string;
  /** When this rule was last updated */
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

/**
 * Look up the markup percentage for a given carrier and client.
 *
 * @param carrier  - Carrier name, case-insensitive ('USPS', 'UPS', 'FedEx')
 * @param clientId - Tenant identifier
 * @param rules    - Array of MarkupRule objects (typically from markupStore)
 * @returns Markup percentage (e.g., 15 for 15%). Falls back to 0 if no rule found.
 */
export function getMarkupRuleForCarrier(
  carrier: string,
  clientId: string,
  rules: MarkupRule[],
): number {
  if (!carrier || !clientId || !rules || rules.length === 0) {
    return 0;
  }

  const normalizedCarrier = carrier.trim().toUpperCase();
  const normalizedClientId = clientId.trim();

  // Exact match: carrier + clientId
  const rule = rules.find(
    (r) =>
      r.carrier.trim().toUpperCase() === normalizedCarrier &&
      r.clientId.trim() === normalizedClientId,
  );

  if (rule) {
    return rule.markupPercent;
  }

  // Fallback: 0% (no markup)
  return 0;
}

/**
 * Apply a markup percentage to a base rate.
 *
 * Formula: result = baseRate × (1 + markupPercent / 100)
 * Example: $100 × 1.15 = $115.00
 *
 * Uses standard round-half-up rounding (Math.round) to 2 decimal places
 * for financial precision.
 *
 * @param baseRate      - The rate before markup (in dollars). Must be ≥ 0.
 * @param markupPercent - Markup percentage (e.g., 15 for 15%). Must be ≥ 0.
 * @returns Marked-up rate rounded to 2 decimal places.
 */
export function applyMarkup(baseRate: number, markupPercent: number): number {
  if (baseRate < 0) {
    throw new Error(`applyMarkup: baseRate must be >= 0, got ${baseRate}`);
  }
  if (markupPercent < 0) {
    throw new Error(`applyMarkup: markupPercent must be >= 0, got ${markupPercent}`);
  }

  const raw = baseRate * (1 + markupPercent / 100);
  // Round to 2 decimal places using standard financial rounding
  return Math.round(raw * 100) / 100;
}

/**
 * Calculate the markup amount (delta) without adding it to the base.
 * Useful for displaying line items like "Markup: $15.00".
 *
 * @param baseRate      - Base rate in dollars
 * @param markupPercent - Markup percentage
 * @returns The markup dollar amount (not the total)
 */
export function calculateMarkupAmount(baseRate: number, markupPercent: number): number {
  if (baseRate < 0) {
    throw new Error(`calculateMarkupAmount: baseRate must be >= 0, got ${baseRate}`);
  }
  if (markupPercent < 0) {
    throw new Error(`calculateMarkupAmount: markupPercent must be >= 0, got ${markupPercent}`);
  }

  const raw = baseRate * (markupPercent / 100);
  return Math.round(raw * 100) / 100;
}

/**
 * Apply markup to a base rate, given a carrier + clientId, looking up rules automatically.
 *
 * Convenience function combining getMarkupRuleForCarrier + applyMarkup.
 *
 * @param baseRate  - Rate before markup
 * @param carrier   - Carrier name
 * @param clientId  - Tenant identifier
 * @param rules     - Markup rules array
 * @returns Marked-up rate
 */
export function applyMarkupForCarrier(
  baseRate: number,
  carrier: string,
  clientId: string,
  rules: MarkupRule[],
): number {
  const markupPercent = getMarkupRuleForCarrier(carrier, clientId, rules);
  return applyMarkup(baseRate, markupPercent);
}
