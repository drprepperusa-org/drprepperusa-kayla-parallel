/**
 * SystemHealth page — uptime gauge, sparklines, status indicators, active alerts.
 */

import React from 'react';
import { Gauge, Sparkline, Alert } from '../components/Charts';
import type { Health } from '../hooks/useHealth';
import type { Metrics } from '../hooks/useMetrics';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface SystemHealthProps {
  health: Health | null;
  metrics: Metrics | null;
  healthLoading: boolean;
  healthError: Error | null;
  lastUpdated: Date | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function uptimePct(uptime_seconds: number): number {
  // For display: represent uptime as % of last 30 days (2592000s)
  const maxSeconds = 30 * 24 * 3600;
  return Math.min(100, (uptime_seconds / maxSeconds) * 100);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const STATUS_STYLES: Record<Health['status'], { bg: string; text: string; dot: string }> = {
  healthy: { bg: 'bg-green-50 border-green-300', text: 'text-green-800', dot: 'bg-green-500' },
  degraded: { bg: 'bg-yellow-50 border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  unhealthy: { bg: 'bg-red-50 border-red-300', text: 'text-red-800', dot: 'bg-red-500' },
};

// ──────────────────────────────────────────────────────────────────────────────
// Sparkline card
// ──────────────────────────────────────────────────────────────────────────────

interface SparkCardProps {
  label: string;
  data: number[];
  color: string;
  unit?: string;
  latest?: number;
}

function SparkCard({ label, data, color, unit = '', latest }: SparkCardProps) {
  const val = latest ?? data[data.length - 1] ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-bold text-gray-900">
          {typeof val === 'number' ? val.toFixed(unit === 'ms' ? 0 : 2) : val}
          <span className="text-xs text-gray-400 ml-1">{unit}</span>
        </span>
        <Sparkline data={data} color={color} width={80} height={28} label={label} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Last sync row
// ──────────────────────────────────────────────────────────────────────────────

function LastSyncRow({ label, iso }: { label: string; iso: string }) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const color = mins < 5 ? 'text-green-600' : mins < 30 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono font-medium ${color}`}>
        {mins < 1 ? 'just now' : `${mins}m ago`}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function SystemHealthPage({
  health,
  metrics,
  healthLoading,
  healthError,
  lastUpdated,
}: SystemHealthProps) {
  if (healthLoading) {
    return (
      <div className="flex items-center justify-center h-64" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500" aria-hidden="true" />
        <span className="ml-3 text-gray-500">Loading health data…</span>
      </div>
    );
  }

  const statusStyle = health ? STATUS_STYLES[health.status] : STATUS_STYLES['degraded'];
  const sparklines = metrics?.sparklines;

  return (
    <section aria-labelledby="system-health-heading" className="flex flex-col gap-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <h2 id="system-health-heading" className="text-lg font-semibold text-gray-900">
          System Health
        </h2>
        {lastUpdated && (
          <span className="text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString('en-US', { timeStyle: 'short' })}
          </span>
        )}
      </div>

      {healthError && <Alert severity="warn" message={`Health data may be stale: ${healthError.message}`} />}

      {/* Status badge */}
      {health && (
        <div
          className={`flex items-center gap-3 border rounded-lg px-4 py-3 ${statusStyle.bg}`}
          role="status"
          aria-label={`System status: ${health.status}`}
        >
          <span
            className={`w-3 h-3 rounded-full animate-pulse ${statusStyle.dot}`}
            aria-hidden="true"
          />
          <span className={`font-semibold capitalize ${statusStyle.text}`}>{health.status}</span>
          {health.error_rate > 0 && (
            <span className="ml-auto text-xs text-gray-500">
              Error rate: <strong className={statusStyle.text}>{(health.error_rate * 100).toFixed(2)}%</strong>
            </span>
          )}
        </div>
      )}

      {/* Uptime gauge + sparklines */}
      <div className="grid grid-cols-2 gap-4">
        {/* Uptime gauge */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col items-center gap-2 col-span-1">
          <Gauge
            value={health ? uptimePct(health.uptime_seconds) : 0}
            size={110}
            label="Uptime"
          />
          <p className="text-xs text-gray-500">
            {health ? formatUptime(health.uptime_seconds) : '—'}
          </p>
        </div>

        {/* Active alerts */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 col-span-1 flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">Active Alerts</p>
          {health?.active_alerts && health.active_alerts.length > 0 ? (
            <ul className="space-y-1.5" aria-label="Active alerts">
              {health.active_alerts.map((alert, i) => (
                <li
                  key={i}
                  className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1"
                >
                  ⚠ {alert}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1.5">
              ✓ No active alerts
            </p>
          )}
        </div>
      </div>

      {/* Metric sparklines */}
      <div className="grid grid-cols-2 gap-3">
        <SparkCard
          label="Cost Rate"
          data={sparklines?.cost_rate ?? [0]}
          color="#3b82f6"
          unit="$/h"
        />
        <SparkCard
          label="Test Pass %"
          data={sparklines?.test_pass_pct ?? [0]}
          color="#22c55e"
          unit="%"
        />
        <SparkCard
          label="Discord Latency"
          data={sparklines?.discord_latency ?? [0]}
          color="#f59e0b"
          unit="ms"
        />
        <SparkCard
          label="API Errors"
          data={sparklines?.api_errors ?? [0]}
          color="#ef4444"
          unit=""
        />
      </div>

      {/* Last sync times */}
      {health?.last_sync && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
            Last Sync
          </p>
          <LastSyncRow label="Discord Channels" iso={health.last_sync.discord_channels} />
          <LastSyncRow label="Cost Trends" iso={health.last_sync.cost_trends} />
          <LastSyncRow label="Test Results" iso={health.last_sync.test_results} />
        </div>
      )}
    </section>
  );
}
