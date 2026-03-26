/**
 * billingStore.ts — Zustand SSOT for billing calculations.
 *
 * Q7 (DJ, LOCKED): "The billing should automatically update as soon as each
 * order is processed and shipped." / "There should be a calculate button that
 * allows the user to refresh the calculations based on any fields that have
 * changed." / "If an order has been voided, then there should be a mark on the
 * billing at the order level notating that."
 *
 * Formula (LOCKED — finance review required to change):
 *   total = (shippingCost + prepCost + packageCost) × (1 + carrierMarkupPercent / 100)
 *
 * Key invariants:
 *  - Uses LABEL rates, NEVER pre-creation fetched rates.
 *  - Voided records are immutable — recalculation is blocked.
 *  - billings Record<OrderId, BillingCalculation> is the single source of truth.
 */

import { create } from 'zustand';
import type { OrderId, BillingCalculation, RoundingMethod } from '../types/orders';
import { roundToNearestCent } from '../services/billingService';

// ─────────────────────────────────────────────────────────────────────────────
// Settings — configurable per deployment
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingSettings {
  /**
   * Flat prep cost per order (kitting, inspection, handling).
   * Q7: "prep cost (defined in billing section — TBD)"
   * Default: $0.00 until DJ specifies value.
   */
  prepCost: number;

  /**
   * Package material cost per ounce of package weight.
   * Q7: "package size & dimensions" contribute to billing cost.
   * Default: $0.00 until DJ specifies value.
   */
  packageCostPerOz: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input type for calculateBilling / recalculateBilling
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingInput {
  /** Order ID (internal string ID, Order.id). */
  orderId: OrderId;

  /**
   * Shipping cost from the label — NOT the pre-creation fetched rate.
   * Q7: "It should never be the fetched rates before label creation."
   * Source: OrderLabel.shipmentCost.
   */
  shippingCost: number;

  /**
   * Total package weight in ounces.
   * Used to derive packageCost = weightOz × settings.packageCostPerOz.
   */
  weightOz: number;

  /**
   * Carrier markup percentage (e.g. 15 = 15%).
   * Pulled from markupStore rules for the order's carrier + clientId.
   */
  carrierMarkupPercent: number;

  /**
   * Optional customer display name (for billing table display).
   * Does not affect calculation.
   */
  customer?: string;

  /**
   * Optional order date (for billing table display / date filters).
   * Does not affect calculation.
   */
  orderDate?: Date;

  /**
   * Optional store ID (for billing table store filter).
   * Does not affect calculation.
   */
  storeId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface BillingState {
  /**
   * SSOT for all billing records.
   * Key: OrderId (Order.id string).
   * Value: BillingCalculation (immutable after void).
   */
  billings: Record<OrderId, BillingCalculation>;

  /** Global billing settings (prep cost, package cost per oz). */
  settings: BillingSettings;

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Calculate billing for an order and store the result.
   *
   * Q7 (LOCKED): Called automatically when an order is marked as shipped.
   * "The billing should automatically update as soon as each order is
   * processed and shipped."
   *
   * Uses label rates (shippingCost from OrderLabel.shipmentCost).
   * Returns the created BillingCalculation, or null on validation failure.
   *
   * @param input - Billing inputs (shippingCost from label, weightOz, carrierMarkupPercent)
   * @returns The new BillingCalculation, or null if inputs invalid
   */
  calculateBilling: (input: BillingInput) => BillingCalculation | null;

  /**
   * Recalculate billing for an existing order.
   *
   * Q7 (LOCKED): "There should be a calculate button that allows the user to
   * refresh the calculations based on any fields that have changed."
   *
   * Blocked if the order's billing record is voided.
   * Returns null (no-op) if order is voided or not found.
   *
   * @param input - Updated billing inputs
   * @returns Updated BillingCalculation, or null if voided/not found/invalid
   */
  recalculateBilling: (input: BillingInput) => BillingCalculation | null;

  /**
   * Void a billing record for an order.
   *
   * Q7 (LOCKED): "If an order has been voided, then there should be a mark on
   * the billing at the order level notating that."
   *
   * Voided records are immutable — recalculation is blocked after voiding.
   * No-op if order not found or already voided.
   *
   * @param orderId - Internal order ID (Order.id)
   */
  voidBilling: (orderId: OrderId) => void;

  /**
   * Update global billing settings (prepCost, packageCostPerOz).
   * Note: does NOT automatically recalculate existing billing records.
   * Use recalculateBilling() after updating settings if needed.
   */
  updateSettings: (settings: Partial<BillingSettings>) => void;

  /**
   * Get billing record for a single order.
   * Returns undefined if no billing record exists.
   */
  getBilling: (orderId: OrderId) => BillingCalculation | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure calculation helper (no side effects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute billing values from inputs + settings.
 * Pure function — no store access. Used by both calculateBilling and recalculateBilling.
 *
 * Q7 formula (LOCKED):
 *   total = (shippingCost + prepCost + packageCost) × (1 + carrierMarkupPercent / 100)
 *
 * @internal
 */
function computeBilling(
  input: BillingInput,
  settings: BillingSettings,
  voided: boolean,
  voidedAt?: Date,
): BillingCalculation | null {
  const { shippingCost, weightOz, carrierMarkupPercent } = input;

  // Validate inputs
  if (
    typeof shippingCost !== 'number' || isNaN(shippingCost) || shippingCost < 0
  ) {
    console.error('[billingStore] computeBilling: invalid shippingCost', { shippingCost });
    return null;
  }
  if (
    typeof weightOz !== 'number' || isNaN(weightOz) || weightOz < 0
  ) {
    console.error('[billingStore] computeBilling: invalid weightOz', { weightOz });
    return null;
  }
  if (
    typeof carrierMarkupPercent !== 'number' || isNaN(carrierMarkupPercent) || carrierMarkupPercent < 0
  ) {
    console.error('[billingStore] computeBilling: invalid carrierMarkupPercent', { carrierMarkupPercent });
    return null;
  }

  const prepCost = settings.prepCost;
  const packageCost = roundToNearestCent(weightOz * settings.packageCostPerOz);

  // Q7 formula (LOCKED):
  //   total = (shippingCost + prepCost + packageCost) × (1 + carrierMarkupPercent / 100)
  const subtotal = roundToNearestCent(shippingCost + prepCost + packageCost);
  const multiplier = 1 + carrierMarkupPercent / 100;
  const rawTotal = subtotal * multiplier;
  const totalCost = roundToNearestCent(rawTotal);

  const breakdown = buildBreakdown(shippingCost, prepCost, packageCost, subtotal, carrierMarkupPercent, totalCost);

  const roundingMethod: RoundingMethod = 'bankers';

  return {
    shippingCost,
    prepCost,
    packageCost,
    subtotal,
    carrierMarkupPercent,
    totalCost,
    breakdown,
    calculatedAt: new Date(),
    roundingMethod,
    voided,
    voidedAt,
    // Backward-compat aliases (deprecated — use shippingCost)
    baseRate: shippingCost,
    residentialSurcharge: 0,
  };
}

/**
 * Build human-readable audit trail string.
 * Format: "$7.50 ship + $1.00 prep + $0.50 pkg × (1 + 15%) = $10.35"
 *
 * @internal
 */
function buildBreakdown(
  shippingCost: number,
  prepCost: number,
  packageCost: number,
  subtotal: number,
  carrierMarkupPercent: number,
  totalCost: number,
): string {
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const parts: string[] = [];
  parts.push(`${fmt(shippingCost)} ship`);

  if (prepCost > 0) parts.push(`${fmt(prepCost)} prep`);
  if (packageCost > 0) parts.push(`${fmt(packageCost)} pkg`);

  const subtotalStr = (prepCost > 0 || packageCost > 0)
    ? `(${fmt(subtotal)} subtotal)`
    : '';

  const markupStr = carrierMarkupPercent > 0
    ? `× (1 + ${carrierMarkupPercent.toFixed(2)}%)`
    : '';

  return [
    parts.join(' + '),
    subtotalStr,
    markupStr,
    `= ${fmt(totalCost)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Store implementation
// ─────────────────────────────────────────────────────────────────────────────

export const useBillingStore = create<BillingState>((set, get) => ({
  billings: {},

  // Default settings — both TBD per DJ, defaulting to $0 until specified
  settings: {
    prepCost: 0,
    packageCostPerOz: 0,
  },

  // ── calculateBilling ───────────────────────────────────────────────────────
  calculateBilling: (input) => {
    const { settings } = get();
    const calculation = computeBilling(input, settings, false, undefined);
    if (!calculation) return null;

    set((state) => ({
      billings: { ...state.billings, [input.orderId]: calculation },
    }));

    return calculation;
  },

  // ── recalculateBilling ────────────────────────────────────────────────────
  recalculateBilling: (input) => {
    const { billings, settings } = get();
    const existing = billings[input.orderId];

    // Q7: voided records are immutable — recalculation blocked
    if (existing?.voided) {
      console.warn('[billingStore] recalculateBilling: blocked — order is voided', {
        orderId: input.orderId,
      });
      return null;
    }

    const calculation = computeBilling(input, settings, false, undefined);
    if (!calculation) return null;

    set((state) => ({
      billings: { ...state.billings, [input.orderId]: calculation },
    }));

    return calculation;
  },

  // ── voidBilling ───────────────────────────────────────────────────────────
  voidBilling: (orderId) => {
    const existing = get().billings[orderId];
    if (!existing) {
      console.warn('[billingStore] voidBilling: no billing record found', { orderId });
      return;
    }
    if (existing.voided) {
      // Already voided — no-op
      return;
    }

    const voidedAt = new Date();
    set((state) => ({
      billings: {
        ...state.billings,
        [orderId]: {
          ...existing,
          voided: true,
          voidedAt,
        },
      },
    }));
  },

  // ── updateSettings ────────────────────────────────────────────────────────
  updateSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }));
  },

  // ── getBilling ────────────────────────────────────────────────────────────
  getBilling: (orderId) => {
    return get().billings[orderId];
  },
}));
