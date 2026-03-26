/**
 * billingPersistence.test.ts — Phase 3 Week 3: Settings + Database Persistence
 *
 * Q7 (DJ, LOCKED): "Billing should be stored in database."
 *
 * Tests:
 *  1. Settings load on startup (loadSettingsFromApi)
 *  2. Settings save + reload (updateSettings)
 *  3. Billing persists to DB (calculateBilling fires createBilling)
 *  4. Recalculate fires update API
 *  5. Void fires void API
 *  6. 404 on settings → defaults, no error
 *  7. 500 on settings → settingsError set
 *  8. DB failure on persist → persistError set
 *  9. updateSettings: partial update preserves other fields
 * 10. syncFrequencyMin stored and returned from loadSettingsFromApi
 * 11. autoVoidAfterDays stored and returned
 * 12. settingsLoaded transitions false → true
 * 13. New settings (prepCost/packageCostPerOz) apply to next calculateBilling
 * 14. Bulk recalculate API shape (type-level contract)
 * 15. Filter queries: ListBillingsQuery shape contract
 * 16. BillingRecord DB shape contract
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useBillingStore } from './billingStore';
import * as billingApi from '../api/billingApi';

// ─────────────────────────────────────────────────────────────────────────────
// Mock the entire billingApi module
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../api/billingApi', () => ({
  getBillingSettings: vi.fn(),
  updateBillingSettings: vi.fn(),
  createBilling: vi.fn(),
  recalculateBillingApi: vi.fn(),
  voidBillingApi: vi.fn(),
  listBillings: vi.fn(),
  bulkRecalculate: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStore() {
  useBillingStore.setState({
    billings: {},
    settings: { prepCost: 0, packageCostPerOz: 0, syncFrequencyMin: 5, autoVoidAfterDays: null },
    settingsLoaded: false,
    settingsError: null,
    persistError: null,
  });
}

/** Flush microtasks (allows fire-and-forget Promises to settle). */
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1–2. Settings load / save
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.loadSettingsFromApi — Phase 3 Week 3', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('loads prepCost from API on startup', async () => {
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 2.50,
      packageCostPerOz: 0.10,
      syncFrequencyMin: 5,
      autoVoidAfterDays: null,
    });

    await useBillingStore.getState().loadSettingsFromApi();

    expect(useBillingStore.getState().settings.prepCost).toBe(2.50);
  });

  it('loads packageCostPerOz from API on startup', async () => {
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 0,
      packageCostPerOz: 0.075,
      syncFrequencyMin: 10,
      autoVoidAfterDays: null,
    });

    await useBillingStore.getState().loadSettingsFromApi();

    expect(useBillingStore.getState().settings.packageCostPerOz).toBe(0.075);
  });

  it('loads syncFrequencyMin from API', async () => {
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 0,
      packageCostPerOz: 0,
      syncFrequencyMin: 30,
      autoVoidAfterDays: null,
    });

    await useBillingStore.getState().loadSettingsFromApi();

    expect(useBillingStore.getState().settings.syncFrequencyMin).toBe(30);
  });

  it('loads autoVoidAfterDays from API', async () => {
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 0,
      packageCostPerOz: 0,
      syncFrequencyMin: 5,
      autoVoidAfterDays: 45,
    });

    await useBillingStore.getState().loadSettingsFromApi();

    expect(useBillingStore.getState().settings.autoVoidAfterDays).toBe(45);
  });

  it('sets settingsLoaded=true after successful load', async () => {
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 1, packageCostPerOz: 0.05, syncFrequencyMin: 5, autoVoidAfterDays: null,
    });

    expect(useBillingStore.getState().settingsLoaded).toBe(false);
    await useBillingStore.getState().loadSettingsFromApi();
    expect(useBillingStore.getState().settingsLoaded).toBe(true);
  });

  it('404 on settings → keeps defaults, settingsLoaded=true, no error', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    (billingApi.getBillingSettings as Mock).mockRejectedValue(err);

    await useBillingStore.getState().loadSettingsFromApi();

    const { settings, settingsLoaded, settingsError } = useBillingStore.getState();
    expect(settingsLoaded).toBe(true);
    expect(settingsError).toBeNull();
    // Defaults unchanged
    expect(settings.prepCost).toBe(0);
    expect(settings.packageCostPerOz).toBe(0);
  });

  it('500 on settings → settingsError set, settingsLoaded=true', async () => {
    const err = Object.assign(new Error('Internal Server Error'), { status: 500 });
    (billingApi.getBillingSettings as Mock).mockRejectedValue(err);

    await useBillingStore.getState().loadSettingsFromApi();

    const { settingsLoaded, settingsError } = useBillingStore.getState();
    expect(settingsLoaded).toBe(true);
    expect(settingsError).toContain('Internal Server Error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Settings save
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.updateSettings — Phase 3 Week 3', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('persists prepCost to API on save', async () => {
    (billingApi.updateBillingSettings as Mock).mockResolvedValue({
      prepCost: 3.00, packageCostPerOz: 0, syncFrequencyMin: 5, autoVoidAfterDays: null,
    });

    await useBillingStore.getState().updateSettings({ prepCost: 3.00 });

    expect(billingApi.updateBillingSettings).toHaveBeenCalledWith(
      expect.objectContaining({ prepCost: 3.00 })
    );
  });

  it('persists packageCostPerOz to API on save', async () => {
    (billingApi.updateBillingSettings as Mock).mockResolvedValue({
      prepCost: 0, packageCostPerOz: 0.125, syncFrequencyMin: 5, autoVoidAfterDays: null,
    });

    await useBillingStore.getState().updateSettings({ packageCostPerOz: 0.125 });

    expect(billingApi.updateBillingSettings).toHaveBeenCalledWith(
      expect.objectContaining({ packageCostPerOz: 0.125 })
    );
  });

  it('persists syncFrequencyMin to API on save', async () => {
    (billingApi.updateBillingSettings as Mock).mockResolvedValue({
      prepCost: 0, packageCostPerOz: 0, syncFrequencyMin: 60, autoVoidAfterDays: null,
    });

    await useBillingStore.getState().updateSettings({ syncFrequencyMin: 60 });

    expect(billingApi.updateBillingSettings).toHaveBeenCalledWith(
      expect.objectContaining({ syncFrequencyMin: 60 })
    );
  });

  it('optimistic update applies before API resolves', async () => {
    let resolveApi!: (v: unknown) => void;
    (billingApi.updateBillingSettings as Mock).mockImplementation(
      () => new Promise((res) => { resolveApi = res; })
    );

    void useBillingStore.getState().updateSettings({ prepCost: 5.00 });
    // Before API resolves, optimistic update should be applied
    expect(useBillingStore.getState().settings.prepCost).toBe(5.00);

    // Resolve API and clean up
    resolveApi({ prepCost: 5.00, packageCostPerOz: 0, syncFrequencyMin: 5, autoVoidAfterDays: null });
  });

  it('partial update preserves other settings fields', async () => {
    useBillingStore.setState({
      settings: { prepCost: 2.00, packageCostPerOz: 0.10, syncFrequencyMin: 10, autoVoidAfterDays: 30 },
    });
    (billingApi.updateBillingSettings as Mock).mockResolvedValue({
      prepCost: 5.00, packageCostPerOz: 0.10, syncFrequencyMin: 10, autoVoidAfterDays: 30,
    });

    await useBillingStore.getState().updateSettings({ prepCost: 5.00 });

    const { settings } = useBillingStore.getState();
    expect(settings.packageCostPerOz).toBe(0.10); // preserved
    expect(settings.syncFrequencyMin).toBe(10);   // preserved
    expect(settings.autoVoidAfterDays).toBe(30);  // preserved
    expect(settings.prepCost).toBe(5.00);         // updated
  });

  it('API failure on save → throws + sets settingsError', async () => {
    (billingApi.updateBillingSettings as Mock).mockRejectedValue(new Error('DB write failed'));

    await expect(
      useBillingStore.getState().updateSettings({ prepCost: 1.00 })
    ).rejects.toThrow('DB write failed');

    expect(useBillingStore.getState().settingsError).toContain('DB write failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Billing persistence on calculate
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.calculateBilling — DB persistence (Q7 LOCKED)', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('calls createBilling with orderId after calculateBilling', async () => {
    (billingApi.createBilling as Mock).mockResolvedValue({});

    useBillingStore.getState().calculateBilling({
      orderId: 'db-order-1',
      shippingCost: 7.50,
      weightOz: 16,
      carrierMarkupPercent: 10,
    });

    await flushPromises();

    expect(billingApi.createBilling).toHaveBeenCalledWith('db-order-1', expect.objectContaining({
      shippingCost: 7.50,
      weightOz: 16,
      carrierMarkupPercent: 10,
    }));
  });

  it('409 conflict on createBilling does not set persistError', async () => {
    const err = Object.assign(new Error('Conflict'), { status: 409 });
    (billingApi.createBilling as Mock).mockRejectedValue(err);

    useBillingStore.getState().calculateBilling({
      orderId: 'conflict-order',
      shippingCost: 5,
      weightOz: 0,
      carrierMarkupPercent: 0,
    });

    await flushPromises();

    // 409 is non-fatal — local store is correct, no persistError
    expect(useBillingStore.getState().persistError).toBeNull();
    // Billing record is still in store
    expect(useBillingStore.getState().billings['conflict-order']).toBeDefined();
  });

  it('DB failure on createBilling sets persistError', async () => {
    (billingApi.createBilling as Mock).mockRejectedValue(new Error('DB write failed'));

    useBillingStore.getState().calculateBilling({
      orderId: 'fail-order',
      shippingCost: 5,
      weightOz: 0,
      carrierMarkupPercent: 0,
    });

    await flushPromises();

    expect(useBillingStore.getState().persistError).toContain('DB write failed');
  });

  it('new settings from API apply to next calculateBilling', async () => {
    // Load settings from API (prepCost=3, packageCostPerOz=0.20)
    (billingApi.getBillingSettings as Mock).mockResolvedValue({
      prepCost: 3.00, packageCostPerOz: 0.20, syncFrequencyMin: 5, autoVoidAfterDays: null,
    });
    (billingApi.createBilling as Mock).mockResolvedValue({});

    await useBillingStore.getState().loadSettingsFromApi();

    const result = useBillingStore.getState().calculateBilling({
      orderId: 'api-settings-order',
      shippingCost: 10,
      weightOz: 10, // 10oz × $0.20 = $2.00 pkg
      carrierMarkupPercent: 0,
    });

    // prepCost=$3, packageCost=$2, shipping=$10 → subtotal=$15, markup=0 → total=$15
    expect(result?.prepCost).toBe(3.00);
    expect(result?.packageCost).toBe(2.00);
    expect(result?.totalCost).toBe(15.00);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Recalculate fires update API
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.recalculateBilling — DB persistence', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('calls recalculateBillingApi after recalculate', async () => {
    (billingApi.createBilling as Mock).mockResolvedValue({});
    (billingApi.recalculateBillingApi as Mock).mockResolvedValue({});

    useBillingStore.getState().calculateBilling({ orderId: 'recalc-1', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    await flushPromises();

    useBillingStore.getState().recalculateBilling({ orderId: 'recalc-1', shippingCost: 8, weightOz: 0, carrierMarkupPercent: 10 });
    await flushPromises();

    expect(billingApi.recalculateBillingApi).toHaveBeenCalledWith('recalc-1', expect.objectContaining({
      shippingCost: 8,
      carrierMarkupPercent: 10,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Void fires void API
// ─────────────────────────────────────────────────────────────────────────────

describe('billingStore.voidBilling — DB persistence', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it('calls voidBillingApi after void', async () => {
    (billingApi.createBilling as Mock).mockResolvedValue({});
    (billingApi.voidBillingApi as Mock).mockResolvedValue({});

    useBillingStore.getState().calculateBilling({ orderId: 'void-persist-1', shippingCost: 5, weightOz: 0, carrierMarkupPercent: 0 });
    await flushPromises();

    useBillingStore.getState().voidBilling('void-persist-1');
    await flushPromises();

    expect(billingApi.voidBillingApi).toHaveBeenCalledWith('void-persist-1', expect.objectContaining({
      voided: true,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type-level contracts for API shapes
// ─────────────────────────────────────────────────────────────────────────────

describe('Billing API type contracts — Phase 3 Week 3', () => {
  it('BulkRecalculateBody has clientId, dateStart, dateEnd fields', () => {
    // Type-level: if this compiles, types are correct
    const body: import('../types/billing').BulkRecalculateBody = {
      clientId: 'client-1',
      dateStart: '2026-01-01',
      dateEnd: '2026-03-31',
    };
    expect(body.clientId).toBe('client-1');
  });

  it('ListBillingsQuery has clientId, dateStart, dateEnd, voided, page, pageSize', () => {
    const query: import('../types/billing').ListBillingsQuery = {
      clientId: 'client-2',
      dateStart: '2026-01-01',
      dateEnd: '2026-03-31',
      voided: false,
      page: 1,
      pageSize: 50,
    };
    expect(query.pageSize).toBe(50);
  });

  it('BillingRecord DB shape has all required fields', () => {
    const record: import('../types/billing').BillingRecord = {
      id: 'uuid-1',
      order_id: 'order-1',
      client_id: null,
      shipping_cost: 7.50,
      prep_cost: 2.00,
      package_cost: 1.00,
      carrier_markup_percent: 10,
      markup_amount: 1.05,
      subtotal: 10.50,
      total_cost: 11.55,
      breakdown: '...',
      rounding_method: 'bankers',
      voided: false,
      voided_at: null,
      calculated_at: '2026-03-26T00:00:00Z',
      created_at: '2026-03-26T00:00:00Z',
      updated_at: '2026-03-26T00:00:00Z',
    };
    expect(record.total_cost).toBe(11.55);
  });

  it('BillingSettingsResponse has all required fields', () => {
    const settings: import('../types/billing').BillingSettingsResponse = {
      prepCost: 2.50,
      packageCostPerOz: 0.10,
      syncFrequencyMin: 5,
      autoVoidAfterDays: null,
    };
    expect(settings.syncFrequencyMin).toBe(5);
  });

  it('BulkRecalculateResponse has recalculated, skippedVoided, errors', () => {
    const resp: import('../types/billing').BulkRecalculateResponse = {
      recalculated: 42,
      skippedVoided: 3,
      errors: [{ orderId: 'bad-order', error: 'DB error' }],
    };
    expect(resp.recalculated).toBe(42);
  });
});
