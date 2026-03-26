/**
 * SettingsPage.tsx — Application settings, including billing configuration.
 *
 * Phase 3 Week 3 (final Phase 3 component).
 *
 * Q7 (DJ, LOCKED): "Billing should be stored in database."
 * Settings are loaded from /api/settings/billing on mount and persisted on save.
 *
 * Billing Settings section:
 *  - Prep Cost per order ($X.XX)
 *  - Package Cost per oz ($X.XXX)
 *  - Sync Frequency (5 / 10 / 30 / 60 min)
 *  - Auto-void after N days (TBD — disabled by default)
 *
 * UX:
 *  - Load current values on mount (from billingStore.loadSettingsFromApi)
 *  - Save button persists to /api/settings/billing via billingStore.updateSettings
 *  - Success toast on save
 *  - Error toast on failure
 *  - Loading indicator while fetching
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useBillingStore, type BillingSettings } from '../stores/billingStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';

interface Toast {
  type: ToastType;
  message: string;
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
// Toast component (inline — no external dependency)
// ─────────────────────────────────────────────────────────────────────────────

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
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
// SettingsPage
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage(): React.ReactElement {
  const { settings, settingsLoaded, settingsError, loadSettingsFromApi, updateSettings } = useBillingStore();

  // ── Local form state (mirrors settings until saved) ───────────────────────
  const [prepCost, setPrepCost] = useState<string>('0.00');
  const [packageCostPerOz, setPackageCostPerOz] = useState<string>('0.000');
  const [syncFrequencyMin, setSyncFrequencyMin] = useState<5 | 10 | 30 | 60>(5);
  const [autoVoidAfterDays, setAutoVoidAfterDays] = useState<string>('');
  const [autoVoidEnabled, setAutoVoidEnabled] = useState<boolean>(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ── Load settings on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!settingsLoaded) {
      void loadSettingsFromApi();
    }
  }, [settingsLoaded, loadSettingsFromApi]);

  // ── Sync form fields from store when settings load ────────────────────────
  useEffect(() => {
    setPrepCost(settings.prepCost.toFixed(2));
    setPackageCostPerOz(settings.packageCostPerOz.toFixed(3));
    setSyncFrequencyMin(settings.syncFrequencyMin ?? 5);
    setAutoVoidEnabled(settings.autoVoidAfterDays !== null);
    setAutoVoidAfterDays(settings.autoVoidAfterDays !== null ? String(settings.autoVoidAfterDays) : '');
  }, [settings]);

  // ── Validate and save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const errors: Record<string, string> = {};

    const parsedPrepCost = parsePositiveFloat(prepCost);
    if (parsedPrepCost === null) errors.prepCost = 'Must be a valid amount (≥ $0.00)';

    const parsedPkgCost = parsePositiveFloat(packageCostPerOz);
    if (parsedPkgCost === null) errors.packageCostPerOz = 'Must be a valid amount (≥ $0.000)';

    let parsedAutoVoid: number | null = null;
    if (autoVoidEnabled) {
      parsedAutoVoid = parsePositiveInt(autoVoidAfterDays);
      if (parsedAutoVoid === null) errors.autoVoidAfterDays = 'Must be a positive number of days';
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
      await updateSettings(newSettings);
      setToast({ type: 'success', message: 'Billing settings saved.' });
    } catch (_err: unknown) {
      setToast({ type: 'error', message: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  }, [prepCost, packageCostPerOz, syncFrequencyMin, autoVoidEnabled, autoVoidAfterDays, updateSettings]);

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
    <div style={{ padding: '24px 32px', maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 28 }}>
        Configure PrepShip billing defaults and sync behavior.
      </p>

      {/* Load error banner */}
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
            marginBottom: 20,
          }}
        >
          ⚠ Could not load saved settings: {settingsError}. Showing defaults.
        </div>
      )}

      {/* Loading indicator */}
      {!settingsLoaded && (
        <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 16 }}>Loading settings…</p>
      )}

      {/* ── Billing Settings Section ───────────────────────────────────────── */}
      <section aria-labelledby="billing-settings-heading">
        <h2
          id="billing-settings-heading"
          style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}
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
            <label style={labelStyle}>
              Auto-void orders after
            </label>
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
            disabled={saving || !settingsLoaded}
            style={{
              background: saving ? '#9ca3af' : '#2563eb',
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
