/**
 * useMetrics — polls the /metrics endpoint (Prometheus-compatible JSON) every interval ms.
 * Fallback: returns last successful response on network failure.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Data contracts
// ──────────────────────────────────────────────────────────────────────────────

export interface Metrics {
  cost_total_usd: number;
  cost_by_phase: Record<string, number>;
  /** Historical cost entries for charting */
  cost_history?: Array<{ date: string; phase: string; cost: number }>;
  test_success_rate: number; // 0-1
  test_flakiness_scores: Array<{ test: string; score: number; count?: number }>;
  discord_sync_latency_ms: {
    p50: number;
    p95: number;
    p99: number;
  };
  discord_api_rate_limit_remaining: number;
  heartbeat_checks_total: number;
  /** Per-channel status for Discord page */
  discord_channels?: Array<{
    id: string;
    name: string;
    last_sync: string; // ISO timestamp
    error_count: number;
    errors?: string[];
  }>;
  /** Agent type → pass rate mapping for heatmap */
  agent_type_pass_rates?: Record<string, number>;
  /** Sparkline history: last N data points */
  sparklines?: {
    cost_rate: number[];
    test_pass_pct: number[];
    discord_latency: number[];
    api_errors: number[];
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Defaults & helpers
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL = 30_000; // 30 s
const METRICS_URL = '/metrics';

/**
 * Build mock fallback data so the UI renders even when the backend is down.
 * Useful during local development / Phase 7.4 not yet deployed.
 */
export function buildMockMetrics(): Metrics {
  const now = Date.now();
  const phases = ['7.0', '7.1', '7.2', '7.3'];

  const cost_history: Metrics['cost_history'] = [];
  for (let d = 89; d >= 0; d--) {
    const date = new Date(now - d * 86_400_000).toISOString().slice(0, 10);
    for (const phase of phases) {
      cost_history.push({
        date,
        phase,
        cost: parseFloat((Math.random() * 0.8 + 0.05).toFixed(4)),
      });
    }
  }

  const AGENT_TYPES = ['code-reviewer', 'debugger', 'planner', 'tester', 'deployer'];
  const agent_type_pass_rates: Record<string, number> = {};
  for (const t of AGENT_TYPES) {
    agent_type_pass_rates[t] = parseFloat((Math.random() * 0.3 + 0.7).toFixed(3));
  }

  const discord_channels: NonNullable<Metrics['discord_channels']> = Array.from(
    { length: 21 },
    (_, i) => {
      const minsAgo = Math.floor(Math.random() * 60);
      return {
        id: `ch-${i + 1}`,
        name: `channel-${String(i + 1).padStart(2, '0')}`,
        last_sync: new Date(now - minsAgo * 60_000).toISOString(),
        error_count: Math.random() > 0.8 ? Math.floor(Math.random() * 5) : 0,
        errors:
          Math.random() > 0.85
            ? ['Rate limit hit', 'Timeout after 5s']
            : [],
      };
    },
  );

  const sparkLen = 20;
  const sparklines: NonNullable<Metrics['sparklines']> = {
    cost_rate: Array.from({ length: sparkLen }, () =>
      parseFloat((Math.random() * 2).toFixed(3)),
    ),
    test_pass_pct: Array.from({ length: sparkLen }, () =>
      parseFloat((80 + Math.random() * 20).toFixed(1)),
    ),
    discord_latency: Array.from({ length: sparkLen }, () =>
      parseFloat((100 + Math.random() * 400).toFixed(0)),
    ),
    api_errors: Array.from({ length: sparkLen }, () =>
      Math.floor(Math.random() * 10),
    ),
  };

  return {
    cost_total_usd: parseFloat((Math.random() * 50 + 10).toFixed(2)),
    cost_by_phase: Object.fromEntries(
      phases.map((p) => [p, parseFloat((Math.random() * 15 + 2).toFixed(2))]),
    ),
    cost_history,
    test_success_rate: parseFloat((0.88 + Math.random() * 0.1).toFixed(4)),
    test_flakiness_scores: Array.from({ length: 15 }, (_, i) => ({
      test: `test-suite-${String.fromCharCode(65 + i)}`,
      score: parseFloat((Math.random() * 0.15).toFixed(4)),
      count: Math.floor(Math.random() * 200 + 20),
    })),
    discord_sync_latency_ms: {
      p50: Math.floor(Math.random() * 200 + 100),
      p95: Math.floor(Math.random() * 400 + 300),
      p99: Math.floor(Math.random() * 600 + 500),
    },
    discord_api_rate_limit_remaining: Math.floor(Math.random() * 100 + 10),
    heartbeat_checks_total: Math.floor(Math.random() * 5000 + 1000),
    discord_channels,
    agent_type_pass_rates,
    sparklines,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export interface UseMetricsOptions {
  /** Poll interval in ms. Default 30 000 (30 s). */
  interval?: number;
  /** Called on every fetch error (cached data still returned). */
  onError?: (err: Error) => void;
  /** If true, use mock data instead of fetching. Default false. */
  mock?: boolean;
}

export interface UseMetricsResult {
  metrics: Metrics | null;
  loading: boolean;
  error: Error | null;
  /** Trigger an immediate refresh outside the polling cycle. */
  refresh: () => void;
}

export function useMetrics(options: UseMetricsOptions = {}): UseMetricsResult {
  const { interval = DEFAULT_INTERVAL, onError, mock = false } = options;

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Cache last-good response for fallback on error
  const cacheRef = useRef<Metrics | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchMetrics = useCallback(async () => {
    if (mock) {
      const data = buildMockMetrics();
      cacheRef.current = data;
      if (mountedRef.current) {
        setMetrics(data);
        setLoading(false);
        setError(null);
      }
      return;
    }

    try {
      const res = await fetch(METRICS_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Metrics = await res.json();
      cacheRef.current = data;
      if (mountedRef.current) {
        setMetrics(data);
        setError(null);
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e);
      // Return cached data on failure
      if (mountedRef.current) {
        setError(e);
        if (cacheRef.current) {
          setMetrics(cacheRef.current); // keep stale data visible
        }
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mock, onError]);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      await fetchMetrics();
      if (mountedRef.current) scheduleNext();
    }, interval);
  }, [fetchMetrics, interval]);

  useEffect(() => {
    mountedRef.current = true;
    fetchMetrics().then(() => {
      if (mountedRef.current) scheduleNext();
    });
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, mock]);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    fetchMetrics().then(() => {
      if (mountedRef.current) scheduleNext();
    });
  }, [fetchMetrics, scheduleNext]);

  return { metrics, loading, error, refresh };
}
