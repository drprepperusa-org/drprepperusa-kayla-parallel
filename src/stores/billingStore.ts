/**
 * billingStore.ts — Zustand SSOT for billing calculations.
 *
 * Q7 (DJ, LOCKED): "The billing should automatically update as soon as each
 * order is processed and shipped." / "There should be a calculate button that
 * allows the user to refresh the calculations based on any fields that have
 * changed." / "If an order has been voided, then there should be a mark on the
 * billing at the order level notating that."
 * Q7 (DJ, LOCKED): "Billing should be stored in database."
 *
 * Formula (LOCKED — finance review required to change):
 *   total = (shippingCost + prepCost + packageCost) × (1 + carrierMarkupPercent / 100)
 *
 * Key invariants:
 *  - Uses LABEL rates, NEVER pre-creation fetched rates.
 *  - Voided records are immutable — recalculation is blocked.
 *  - billings Record<OrderId, BillingCalculation> is the single source of truth.
 *  - Settings are loaded from /api/settings/billing on app startup.
 *  - Billings are persisted to /api/billing/:orderId on calculate/recalculate/void.
 *
 * Phase 3 Week 3 additions:
 *  - loadSettingsFromApi(): loads settings on startup; 404 = use defaults
 *  - updateSettings(): now also POSTs to /api/settings/billing
 *  - persistBilling(): writes to /api/billing/:orderId (POST or PUT)
 *  - settingsLoaded: tracks whether API settings have been fetched
 *  - settingsError / persistError: surface API errors to UI
 */

import { create } from 'zustand';
import type { OrderId, BillingCalculation, RoundingMethod } from '../types/orders';
import { roundToNearestCent } from '../services/billingService';
import {
  getBillingSettings,
  updateBillingSettings,
  createBilling,
  recalculateBillingApi,
  voidBillingApi,
} from '../api/billingApi';
import type { BillingSettingsResponse, UpdateBillingSettingsBody } from '../types/billing';

// ─────────────────────────────────────────────────────────────────────────────
// Settings — configurable per deployment, persisted to DB
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

  /**
   * Sync frequency in minutes (5 | 10 | 30 | 60).
   * Q7: "Sync Frequency" configurable in settings.
   * Default: 5 minutes. Optional for backward compat with existing test setState calls.
   */
  syncFrequencyMin?: 5 | 10 | 30 | 60;

  /**
   * Auto-void billing records after N days (null = disabled).
   * Q7: "Auto-void (TBD)" — controlled from SettingsPage.
   * Optional for backward compat with existing test setState calls.
   */
  autoVoidAfterDays?: number | null;
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
   * Update global billing settings (prepCost, packageCostPerOz, syncFrequencyMin, autoVoidAfterDays).
   * Also persists to /api/settings/billing (PUT).
   * Note: does NOT automatically recalculate existing billing records.
   * Use recalculateBilling() after updating settings if needed.
   *
   * Phase 3 Week 3: wired to SettingsPage save button.
   */
  updateSettings: (settings: Partial<BillingSettings>) => Promise<void>;

  /**
   * Load billing settings from /api/settings/billing on app startup.
   *
   * Phase 3 Week 3: Q7 — settings persist across sessions via DB.
   * On 404: settings not yet saved → use defaults (no error).
   * On 500: log error, keep current settings, set settingsError.
   */
  loadSettingsFromApi: () => Promise<void>;

  /**
   * Get billing record for a single order.
   * Returns undefined if no billing record exists.
   */
  getBilling: (orderId: OrderId) => BillingCalculation | undefined;

  // ── API state ─────────────────────────────────────────────────────────────

  /** True once loadSettingsFromApi() has completed (success or 404). */
  settingsLoaded: boolean;

  /** Error message from last settings load/save, or null. */
  settingsError: string | null;

  /** Error message from last billing persist, or null. */
  persistError: string | null;
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

  // Default settings — TBD per DJ, defaulting to $0 until specified.
  // Overwritten by loadSettingsFromApi() on app startup.
  settings: {
    prepCost: 0,
    packageCostPerOz: 0,
    syncFrequencyMin: 5,
    autoVoidAfterDays: null,
  },

  // API state
  settingsLoaded: false,
  settingsError: null,
  persistError: null,

  // ── calculateBilling ───────────────────────────────────────────────────────
  calculateBilling: (input) => {
    const { settings } = get();
    const calculation = computeBilling(input, settings, false, undefined);
    if (!calculation) return null;

    set((state) => ({
      billings: { ...state.billings, [input.orderId]: calculation },
    }));

    // Phase 3 Week 3: Persist to backend DB (fire-and-forget, non-blocking).
    // Q7: "Billing should be stored in database."
    createBilling(input.orderId, {
      shippingCost: input.shippingCost,
      weightOz: input.weightOz,
      carrierMarkupPercent: input.carrierMarkupPercent,
    }).catch((err: unknown) => {
      // 409 = already exists, use PUT path next time (recalculate)
      if (err instanceof Error && (err as Error & { status?: number }).status === 409) {
        // Non-fatal: billing already exists in DB, store state is correct
        return;
      }
      console.error('[billingStore] calculateBilling: persist failed', err);
      set({ persistError: err instanceof Error ? err.message : String(err) });
    });

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

    // Phase 3 Week 3: Persist updated billing to backend (fire-and-forget).
    recalculateBillingApi(input.orderId, {
      shippingCost: input.shippingCost,
      weightOz: input.weightOz,
      carrierMarkupPercent: input.carrierMarkupPercent,
    }).catch((err: unknown) => {
      console.error('[billingStore] recalculateBilling: persist failed', err);
      set({ persistError: err instanceof Error ? err.message : String(err) });
    });

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

    // Phase 3 Week 3: Persist void to backend DB (fire-and-forget).
    voidBillingApi(orderId, { voided: true, voidedAt: voidedAt.toISOString() }).catch((err: unknown) => {
      console.error('[billingStore] voidBilling: persist failed', err);
      set({ persistError: err instanceof Error ? err.message : String(err) });
    });
  },

  // ── updateSettings ────────────────────────────────────────────────────────
  // Phase 3 Week 3: Now also persists to /api/settings/billing.
  updateSettings: async (partial) => {
    // Optimistic update — apply locally first
    set((state) => ({
      settings: { ...state.settings, ...partial },
      settingsError: null,
    }));

    // Persist to backend
    const body: UpdateBillingSettingsBody = {};
    if (partial.prepCost !== undefined) body.prepCost = partial.prepCost;
    if (partial.packageCostPerOz !== undefined) body.packageCostPerOz = partial.packageCostPerOz;
    if (partial.syncFrequencyMin !== undefined) body.syncFrequencyMin = partial.syncFrequencyMin;
    if (partial.autoVoidAfterDays !== undefined) body.autoVoidAfterDays = partial.autoVoidAfterDays;

    try {
      await updateBillingSettings(body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[billingStore] updateSettings: save failed', err);
      set({ settingsError: msg });
      throw err; // Re-throw so SettingsPage can show error toast
    }
  },

  // ── loadSettingsFromApi ───────────────────────────────────────────────────
  // Phase 3 Week 3: Load settings from API on app startup.
  // 404 = settings not yet saved → use defaults (no error).
  // 500 = DB error → log + set settingsError.
  loadSettingsFromApi: async () => {
    try {
      const remote: BillingSettingsResponse = await getBillingSettings();
      set((state) => ({
        settings: {
          ...state.settings,
          prepCost: remote.prepCost,
          packageCostPerOz: remote.packageCostPerOz,
          syncFrequencyMin: remote.syncFrequencyMin,
          autoVoidAfterDays: remote.autoVoidAfterDays,
        },
        settingsLoaded: true,
        settingsError: null,
      }));
    } catch (err: unknown) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404) {
        // No settings saved yet — first-run, keep defaults
        set({ settingsLoaded: true, settingsError: null });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[billingStore] loadSettingsFromApi: failed', err);
      set({ settingsLoaded: true, settingsError: msg });
    }
  },

  // ── getBilling ────────────────────────────────────────────────────────────
  getBilling: (orderId) => {
    return get().billings[orderId];
  },
}));
