/**
 * CostTrends page — line chart of cost over last 90 days, filtered by phase.
 */

import React, { useMemo, useState } from 'react';
import { LineChart, ChartLegend, Alert, type LineChartSeries } from '../components/Charts';
import type { Metrics } from '../hooks/useMetrics';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface CostTrendsProps {
  metrics: Metrics | null;
  loading: boolean;
  error: Error | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  '7.0': '#3b82f6',
  '7.1': '#8b5cf6',
  '7.2': '#f59e0b',
  '7.3': '#10b981',
};

const DAY_RANGES = [30, 60, 90] as const;
type DayRange = (typeof DAY_RANGES)[number];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function computeStats(values: number[]): { total: number; avg: number; trend: 'up' | 'down' | 'flat' } {
  if (!values.length) return { total: 0, avg: 0, trend: 'flat' };
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / values.length;
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
  const delta = secondAvg - firstAvg;
  const trend = Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'up' : 'down';
  return { total, avg, trend };
}

const TREND_ICONS = { up: '↑', down: '↓', flat: '→' };
const TREND_COLORS = { up: 'text-red-500', down: 'text-green-600', flat: 'text-gray-500' };

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function CostTrendsPage({ metrics, loading, error }: CostTrendsProps) {
  const [dayRange, setDayRange] = useState<DayRange>(90);
  const [selectedPhases, setSelectedPhases] = useState<Set<string>>(
    new Set(['7.0', '7.1', '7.2', '7.3']),
  );

  const allPhases = useMemo(
    () => (metrics ? Object.keys(metrics.cost_by_phase) : ['7.0', '7.1', '7.2', '7.3']),
    [metrics],
  );

  const togglePhase = (phase: string) => {
    setSelectedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        if (next.size > 1) next.delete(phase); // keep at least one
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  const cutoff = useMemo(
    () => Date.now() - dayRange * 24 * 60 * 60 * 1000,
    [dayRange],
  );

  const series: LineChartSeries[] = useMemo(() => {
    if (!metrics?.cost_history) return [];

    return Array.from(selectedPhases).map((phase) => {
      const filtered = metrics.cost_history!.filter(
        (e) => e.phase === phase && new Date(e.date).getTime() >= cutoff,
      );
      // Group by date, sum per date
      const byDate = new Map<string, number>();
      for (const e of filtered) {
        byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.cost);
      }
      const points = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, cost]) => ({ x: new Date(date).getTime(), y: cost }));

      return {
        label: `Phase ${phase}`,
        color: PHASE_COLORS[phase] ?? '#6b7280',
        points,
      };
    });
  }, [metrics, selectedPhases, cutoff]);

  const statsPerPhase = useMemo(() => {
    return Array.from(selectedPhases).map((phase) => {
      const s = series.find((s) => s.label === `Phase ${phase}`);
      const vals = s?.points.map((p) => p.y) ?? [];
      return { phase, ...computeStats(vals) };
    });
  }, [series, selectedPhases]);

  const overallStats = useMemo(() => {
    const allVals = series.flatMap((s) => s.points.map((p) => p.y));
    return computeStats(allVals);
  }, [series]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" aria-live="polite" aria-label="Loading cost trends">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" aria-hidden="true" />
        <span className="ml-3 text-gray-500">Loading cost data…</span>
      </div>
    );
  }

  return (
    <section aria-labelledby="cost-trends-heading" className="flex flex-col gap-4">
      <h2 id="cost-trends-heading" className="text-lg font-semibold text-gray-900">
        Cost Trends
      </h2>

      {error && <Alert severity="warn" message={`Data may be stale: ${error.message}`} />}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Date range */}
        <fieldset className="flex gap-2 items-center">
          <legend className="text-sm text-gray-600 mr-2">Range:</legend>
          {DAY_RANGES.map((d) => (
            <button
              key={d}
              onClick={() => setDayRange(d)}
              aria-pressed={dayRange === d}
              className={`px-3 py-1 text-sm rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                dayRange === d
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {d}d
            </button>
          ))}
        </fieldset>

        {/* Phase selection */}
        <fieldset className="flex gap-2 items-center">
          <legend className="text-sm text-gray-600 mr-2">Phases:</legend>
          {allPhases.map((phase) => (
            <button
              key={phase}
              onClick={() => togglePhase(phase)}
              aria-pressed={selectedPhases.has(phase)}
              className={`px-2 py-1 text-xs rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                selectedPhases.has(phase)
                  ? 'text-white border-transparent'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
              }`}
              style={
                selectedPhases.has(phase)
                  ? { background: PHASE_COLORS[phase] ?? '#6b7280', borderColor: 'transparent' }
                  : {}
              }
            >
              {phase}
            </button>
          ))}
        </fieldset>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Cost summary statistics">
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs text-blue-600 uppercase tracking-wide">Total (all phases)</p>
          <p className="text-xl font-bold text-blue-900">${overallStats.total.toFixed(2)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg / day</p>
          <p className="text-xl font-bold text-gray-900">${overallStats.avg.toFixed(3)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Trend</p>
          <p className={`text-xl font-bold ${TREND_COLORS[overallStats.trend]}`}>
            {TREND_ICONS[overallStats.trend]}
          </p>
        </div>
      </div>

      {/* Line chart */}
      {series.length > 0 && series.some((s) => s.points.length > 0) ? (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <LineChart series={series} width={560} height={260} yLabel="Cost (USD)" xLabel="Date" />
          <ChartLegend series={series.map((s) => ({ label: s.label, color: s.color }))} />
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
          No cost data available for selected filters
        </div>
      )}

      {/* Per-phase breakdown */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Per-Phase Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" aria-label="Per-phase cost breakdown">
            <thead>
              <tr className="bg-gray-50 text-gray-600 text-left">
                <th scope="col" className="px-3 py-2 border border-gray-200 font-medium">Phase</th>
                <th scope="col" className="px-3 py-2 border border-gray-200 font-medium">Total</th>
                <th scope="col" className="px-3 py-2 border border-gray-200 font-medium">Avg/day</th>
                <th scope="col" className="px-3 py-2 border border-gray-200 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {statsPerPhase.map(({ phase, total, avg, trend }) => (
                <tr key={phase} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border border-gray-200">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ background: PHASE_COLORS[phase] ?? '#6b7280' }}
                      aria-hidden="true"
                    />
                    Phase {phase}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 font-mono">${total.toFixed(2)}</td>
                  <td className="px-3 py-2 border border-gray-200 font-mono">${avg.toFixed(4)}</td>
                  <td className={`px-3 py-2 border border-gray-200 font-bold ${TREND_COLORS[trend]}`}>
                    {TREND_ICONS[trend]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
