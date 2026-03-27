/**
 * SettingsPage.tsx
 *
 * Application settings page — full-width, no right panel.
 *
 * Sections:
 *   1. Markup Settings  — per-carrier Rate Browser markups (rateMarkupStore)
 *   2. Cache Management — clear rate cache + refetch
 *   3. Billing          — billing defaults (billingStore, preserved from prior phase)
 *
 * Route: /settings (wired via App.tsx currentView === 'settings')
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBillingStore, type BillingSettings } from '../stores/billingStore';
import { useRateMarkupStore } from '../stores/rateMarkupStore';
import { useBillingSettings, useUpdateBillingSettings } from '../hooks/useBillingSettings';
import MarkupRow from '../components/Settings/MarkupRow';
import CacheManagement from '../components/Settings/CacheManagement';
import styles from './SettingsPage.module.scss';

// ─────────────────────────────────────────────────────────────────────────────
// Debounce helper
// ─────────────────────────────────────────────────────────────────────────────

function useDebounced<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    (...args: T) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        fn(...args);
      }, delay);
    },
    [fn, delay],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast (inline, no external dep)
// ─────────────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';

interface ToastData {
  type: ToastType;
  message: string;
}

function ToastNotification({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor = toast.type === 'success' ? '#16a34a' : '#dc2626';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        background: bgColor,
        color: '#fff',
        padding: '10px 18px',
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 14,
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span>{toast.type === 'success' ? '✓' : '✗'}</span>
      <span>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, marginLeft: 4 }}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parsePositiveFloat(value: string): number | null {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

function parsePositiveInt(value: string): number | null {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage(): React.ReactElement {
  // ── Markup store ─────────────────────────────────────────────────────────
  const markups = useRateMarkupStore((s) => s.markups);
  const setMarkupType = useRateMarkupStore((s) => s.setMarkupType);
  const setMarkupValue = useRateMarkupStore((s) => s.setMarkupValue);

  // Debounced wrappers — auto-save on change after 500ms
  const debouncedSetType = useDebounced(
    (id: string, type: 'flat' | 'pct') => { setMarkupType(id, type); },
    500,
  );

  const debouncedSetValue = useDebounced(
    (id: string, value: number) => { setMarkupValue(id, value); },
    500,
  );

  // For immediate visual feedback we also update store immediately;
  // the "debounced" behavior is relevant for a future API persist call.
  const handleTypeChange = useCallback(
    (id: string, type: 'flat' | 'pct') => {
      setMarkupType(id, type);
      debouncedSetType(id, type);
    },
    [setMarkupType, debouncedSetType],
  );

  const handleValueChange = useCallback(
    (id: string, value: number) => {
      setMarkupValue(id, value);
      debouncedSetValue(id, value);
    },
    [setMarkupValue, debouncedSetValue],
  );

  // ── Billing store ────────────────────────────────────────────────────────
  const { settings, settingsLoaded, settingsError, loadSettingsFromApi, updateSettings } =
    useBillingStore();

  // ── React Query: billing settings (backend source of truth) ─────────────
  // Falls back to billingStore defaults if the backend is unavailable.
  const { data: remoteSettings } = useBillingSettings();
  const updateBillingSettingsMutation = useUpdateBillingSettings();

  const [prepCost, setPrepCost] = useState<string>('0.00');
  const [packageCostPerOz, setPackageCostPerOz] = useState<string>('0.000');
  const [syncFrequencyMin, setSyncFrequencyMin] = useState<5 | 10 | 30 | 60>(5);
  const [autoVoidAfterDays, setAutoVoidAfterDays] = useState<string>('');
  const [autoVoidEnabled, setAutoVoidEnabled] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettingsFromApi();
    }
  }, [settingsLoaded, loadSettingsFromApi]);

  // Populate form from backend (React Query) when available; otherwise fall
  // back to the billingStore values populated by loadSettingsFromApi().
  useEffect(() => {
    const src = remoteSettings ?? settings;
    setPrepCost(src.prepCost.toFixed(2));
    setPackageCostPerOz(src.packageCostPerOz.toFixed(3));
    setSyncFrequencyMin(src.syncFrequencyMin ?? 5);
    setAutoVoidEnabled((src.autoVoidAfterDays ?? null) !== null);
    setAutoVoidAfterDays(
      (src.autoVoidAfterDays ?? null) !== null ? String(src.autoVoidAfterDays) : '',
    );
  }, [remoteSettings, settings]);

  const handleSave = useCallback(async () => {
    const errors: Record<string, string> = {};

    const parsedPrepCost = parsePositiveFloat(prepCost);
    if (parsedPrepCost === null) errors.prepCost = 'Must be a valid amount (≥ $0.00)';

    const parsedPkgCost = parsePositiveFloat(packageCostPerOz);
    if (parsedPkgCost === null) errors.packageCostPerOz = 'Must be a valid amount (≥ $0.000)';

    let parsedAutoVoid: number | null = null;
    if (autoVoidEnabled) {
      parsedAutoVoid = parsePositiveInt(autoVoidAfterDays);
      if (parsedAutoVoid === null)
        errors.autoVoidAfterDays = 'Must be a positive number of days';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const newSettings: Partial<BillingSettings> = {
      prepCost: parsedPrepCost!,
      packageCostPerOz: parsedPkgCost!,
      syncFrequencyMin,
      autoVoidAfterDays: autoVoidEnabled ? parsedAutoVoid : null,
    };

    setSaving(true);
    try {
      // Persist via billingStore (which also calls the API internally) and
      // separately via React Query mutation to keep the query cache in sync.
      await updateSettings(newSettings);
      await updateBillingSettingsMutation.mutateAsync(newSettings);
      setToast({ type: 'success', message: 'Billing settings saved.' });
    } catch (_err: unknown) {
      setToast({ type: 'error', message: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  }, [
    prepCost,
    packageCostPerOz,
    syncFrequencyMin,
    autoVoidEnabled,
    autoVoidAfterDays,
    updateSettings,
    updateBillingSettingsMutation,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 5,
    fontSize: 14,
    lineHeight: '1.4',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 4,
    color: '#374151',
  };

  const errorStyle: React.CSSProperties = {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 3,
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Settings</h1>
      <p className={styles.pageSubtitle}>
        Configure PrepShip billing defaults, carrier markups, and sync behavior.
      </p>

      {/* ── Section 1: Markup Settings ───────────────────────────────────── */}
      <section className={styles.sectionCard} aria-labelledby="markup-settings-heading">
        <h2 id="markup-settings-heading" className={styles.sectionTitle}>
          Markup Settings
        </h2>
        <p className={styles.sectionSubtitle}>
          $ or % markup added per carrier account — applied to displayed rates in the Rate Browser.
        </p>

        {/* Sub-section: Rate Browser — Account Markups */}
        <div>
          <h3 className={styles.subSectionTitle}>Rate Browser — Account Markups</h3>
          <p className={styles.subSectionSubtitle}>
            $ or % added to displayed rates per carrier account. Useful for billing clients above
            cost.
          </p>

          <div className={styles.markupTable} role="table" aria-label="Carrier account markups">
            <div className={styles.markupTableHeader} role="row">
              <span className={styles.colCarrier} role="columnheader">Carrier Account</span>
              <span className={styles.colControls} role="columnheader">Type / Value / Display</span>
            </div>

            {markups.map((entry) => (
              <MarkupRow
                key={entry.id}
                entry={entry}
                onTypeChange={handleTypeChange}
                onValueChange={handleValueChange}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 2: Cache Management ──────────────────────────────────── */}
      <CacheManagement />

      {/* ── Section 3: Billing (preserved) ───────────────────────────────── */}
      <section className={styles.billingCard} aria-labelledby="billing-settings-heading">
        {settingsError && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 6,
              padding: '10px 14px',
              color: '#dc2626',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            ⚠ Could not load saved settings: {settingsError}. Showing defaults.
          </div>
        )}

        {!settingsLoaded && (
          <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 12 }}>Loading settings…</p>
        )}

        <h2
          id="billing-settings-heading"
          className={styles.billingTitle}
        >
          Billing
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
          {/* Prep Cost */}
          <div>
            <label htmlFor="prepCost" style={labelStyle}>
              Prep Cost (per order)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 8, color: '#6b7280', fontSize: 14 }}>$</span>
              <input
                id="prepCost"
                type="number"
                min="0"
                step="0.01"
                value={prepCost}
                onChange={(e) => { setPrepCost(e.target.value); }}
                style={{ ...inputStyle, paddingLeft: 22 }}
                placeholder="0.00"
                aria-describedby={fieldErrors.prepCost ? 'prepCost-error' : undefined}
                disabled={saving}
              />
            </div>
            {fieldErrors.prepCost && (
              <p id="prepCost-error" style={errorStyle}>{fieldErrors.prepCost}</p>
            )}
          </div>

          {/* Package Cost Per Oz */}
          <div>
            <label htmlFor="packageCostPerOz" style={labelStyle}>
              Package Cost (per oz)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: 8, color: '#6b7280', fontSize: 14 }}>$</span>
              <input
                id="packageCostPerOz"
                type="number"
                min="0"
                step="0.001"
                value={packageCostPerOz}
                onChange={(e) => { setPackageCostPerOz(e.target.value); }}
                style={{ ...inputStyle, paddingLeft: 22 }}
                placeholder="0.000"
                aria-describedby={fieldErrors.packageCostPerOz ? 'packageCostPerOz-error' : undefined}
                disabled={saving}
              />
            </div>
            {fieldErrors.packageCostPerOz && (
              <p id="packageCostPerOz-error" style={errorStyle}>{fieldErrors.packageCostPerOz}</p>
            )}
          </div>

          {/* Sync Frequency */}
          <div>
            <label htmlFor="syncFrequencyMin" style={labelStyle}>
              Sync Frequency
            </label>
            <select
              id="syncFrequencyMin"
              value={syncFrequencyMin}
              onChange={(e) => { setSyncFrequencyMin(parseInt(e.target.value, 10) as 5 | 10 | 30 | 60); }}
              style={inputStyle}
              disabled={saving}
            >
              <option value={5}>Every 5 minutes</option>
              <option value={10}>Every 10 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
            </select>
          </div>

          {/* Auto-void */}
          <div>
            <label style={labelStyle}>Auto-void orders after</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                id="autoVoidEnabled"
                type="checkbox"
                checked={autoVoidEnabled}
                onChange={(e) => { setAutoVoidEnabled(e.target.checked); }}
                disabled={saving}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <input
                id="autoVoidAfterDays"
                type="number"
                min="1"
                step="1"
                value={autoVoidAfterDays}
                onChange={(e) => { setAutoVoidAfterDays(e.target.value); }}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="e.g. 30"
                disabled={saving || !autoVoidEnabled}
                aria-describedby={fieldErrors.autoVoidAfterDays ? 'autoVoid-error' : undefined}
              />
              <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>days</span>
            </div>
            {fieldErrors.autoVoidAfterDays && (
              <p id="autoVoid-error" style={errorStyle}>{fieldErrors.autoVoidAfterDays}</p>
            )}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>TBD — disabled by default</p>
          </div>
        </div>

        {/* Save button */}
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => { void handleSave(); }}
            disabled={saving || !settingsLoaded || updateBillingSettingsMutation.isPending}
            style={{
              background: saving || updateBillingSettingsMutation.isPending ? '#9ca3af' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '9px 22px',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Save Billing Settings'}
          </button>
        </div>
      </section>

      {/* Toast notification */}
      {toast && (
        <ToastNotification
          toast={toast}
          onDismiss={() => { setToast(null); }}
        />
      )}
    </div>
  );
}
