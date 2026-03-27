/**
 * TestReliability page — scatter plot of flakiness, trend line, heatmap by agent type.
 */

import React, { useMemo, useState } from 'react';
import { ScatterPlot, Heatmap, Alert, type ScatterPoint } from '../components/Charts';
import type { Metrics } from '../hooks/useMetrics';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface TestReliabilityProps {
  metrics: Metrics | null;
  loading: boolean;
  error: Error | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Alert badge list
// ──────────────────────────────────────────────────────────────────────────────

function FlakyTestBadges({ tests }: { tests: Array<{ test: string; score: number }> }) {
  const flaky = tests.filter((t) => t.score > 0.05);
  if (!flaky.length) {
    return (
      <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
        ✓ No tests exceed 5% flakiness threshold
      </p>
    );
  }
  return (
    <div role="list" aria-label="Flaky test alerts" className="flex flex-wrap gap-2">
      {flaky.map((t) => (
        <span
          key={t.test}
          role="listitem"
          aria-label={`${t.test}: ${(t.score * 100).toFixed(1)}% flakiness`}
          className="inline-flex items-center gap-1 bg-red-50 border border-red-300 text-red-700 text-xs px-2 py-1 rounded-full"
        >
          <span aria-hidden="true">⚠</span>
          {t.test}
          <span className="font-bold ml-1">{(t.score * 100).toFixed(1)}%</span>
        </span>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pass-rate trend line (simplified — uses test_success_rate history if available)
// ──────────────────────────────────────────────────────────────────────────────

function PassRateTrend({ successRate }: { successRate: number }) {
  // Without historical data, show current rate with a descriptive label
  const pct = (successRate * 100).toFixed(2);
  const color =
    successRate >= 0.99 ? '#22c55e' : successRate >= 0.95 ? '#eab308' : '#ef4444';
  const label =
    successRate >= 0.99 ? 'Production-grade' : successRate >= 0.95 ? 'Acceptable' : 'Needs attention';

  return (
    <div
      className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4"
      aria-label={`Overall pass rate: ${pct}%`}
    >
      <div
        className="flex flex-col items-center justify-center w-16 h-16 rounded-full border-4"
        style={{ borderColor: color }}
      >
        <span className="text-lg font-bold" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">Overall Pass Rate</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        <p className="text-xs text-gray-400 mt-1">
          Failure rate: {((1 - successRate) * 100).toFixed(2)}% — target &lt;1%
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function TestReliabilityPage({ metrics, loading, error }: TestReliabilityProps) {
  const [sortBy, setSortBy] = useState<'score' | 'count'>('score');

  const scatterPoints: ScatterPoint[] = useMemo(() => {
    if (!metrics?.test_flakiness_scores) return [];
    return metrics.test_flakiness_scores.map((t) => ({
      id: t.test,
      x: t.score,
      y: t.count ?? 50,
      isAlert: t.score > 0.05,
    }));
  }, [metrics]);

  const sortedTests = useMemo(() => {
    if (!metrics?.test_flakiness_scores) return [];
    return [...metrics.test_flakiness_scores].sort((a, b) =>
      sortBy === 'score' ? b.score - a.score : (b.count ?? 0) - (a.count ?? 0),
    );
  }, [metrics, sortBy]);

  const flakyCount = useMemo(
    () => sortedTests.filter((t) => t.score > 0.05).length,
    [sortedTests],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" aria-hidden="true" />
        <span className="ml-3 text-gray-500">Loading test data…</span>
      </div>
    );
  }

  return (
    <section aria-labelledby="test-reliability-heading" className="flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <h2 id="test-reliability-heading" className="text-lg font-semibold text-gray-900">
          Test Reliability
        </h2>
        {flakyCount > 0 && (
          <span
            className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full"
            aria-label={`${flakyCount} flaky tests detected`}
          >
            {flakyCount} flaky
          </span>
        )}
      </div>

      {error && <Alert severity="warn" message={`Data may be stale: ${error.message}`} />}

      {/* Pass rate */}
      <PassRateTrend successRate={metrics?.test_success_rate ?? 0} />

      {/* Flaky test alerts */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Tests Exceeding 5% Flakiness
        </h3>
        <FlakyTestBadges tests={sortedTests} />
      </div>

      {/* Scatter plot */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-1">
          Flakiness vs Test Count
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Red dashed line = 5% alert threshold · Purple dashed = trend · Red dots = alerts
        </p>
        <ScatterPlot points={scatterPoints} alertThreshold={0.05} />
      </div>

      {/* Agent type heatmap */}
      {metrics?.agent_type_pass_rates && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Pass Rate by Agent Type
          </h3>
          <Heatmap data={metrics.agent_type_pass_rates} />
          <p className="text-xs text-gray-400 mt-2">
            Green ≥95% · Yellow 85–95% · Orange 70–85% · Red &lt;70%
          </p>
        </div>
      )}

      {/* Test table */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-medium text-gray-700">All Tests</h3>
          <div className="flex gap-2">
            <label className="text-xs text-gray-500">Sort:</label>
            <button
              onClick={() => setSortBy('score')}
              aria-pressed={sortBy === 'score'}
              className={`text-xs px-2 py-0.5 rounded border focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                sortBy === 'score'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              Flakiness
            </button>
            <button
              onClick={() => setSortBy('count')}
              aria-pressed={sortBy === 'count'}
              className={`text-xs px-2 py-0.5 rounded border focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                sortBy === 'count'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              Run Count
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm border-collapse" aria-label="Test flakiness scores">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-gray-600 text-left">
                <th scope="col" className="px-3 py-2 border-b border-gray-200 font-medium">Test</th>
                <th scope="col" className="px-3 py-2 border-b border-gray-200 font-medium">Flakiness</th>
                <th scope="col" className="px-3 py-2 border-b border-gray-200 font-medium">Runs</th>
                <th scope="col" className="px-3 py-2 border-b border-gray-200 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedTests.map((t) => (
                <tr key={t.test} className={`hover:bg-gray-50 ${t.score > 0.05 ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono text-xs">{t.test}</td>
                  <td className="px-3 py-2 border-b border-gray-100 font-mono">
                    <span className={t.score > 0.05 ? 'text-red-600 font-bold' : 'text-gray-700'}>
                      {(t.score * 100).toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-gray-600">
                    {t.count ?? '—'}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    {t.score > 0.05 ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        Alert
                      </span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!sortedTests.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-sm">
                    No test data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
