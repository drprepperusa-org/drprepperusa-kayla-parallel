/**
 * useHealth — polls the /health endpoint every interval ms.
 * Fallback: returns last successful response on network failure.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Data contracts
// ──────────────────────────────────────────────────────────────────────────────

export interface Health {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime_seconds: number;
  last_sync: {
    discord_channels: string; // ISO timestamp
    cost_trends: string;
    test_results: string;
  };
  error_rate: number;
  active_alerts: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Defaults & helpers
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL = 10_000; // 10 s
const HEALTH_URL = '/health';

export function buildMockHealth(): Health {
  const statuses: Health['status'][] = ['healthy', 'degraded', 'unhealthy'];
  const status = statuses[Math.floor(Math.random() * 3 * 0.7)]; // weighted healthy

  return {
    status: status ?? 'healthy',
    uptime_seconds: Math.floor(Math.random() * 864_000 + 3600),
    last_sync: {
      discord_channels: new Date(Date.now() - Math.random() * 60_000).toISOString(),
      cost_trends: new Date(Date.now() - Math.random() * 120_000).toISOString(),
      test_results: new Date(Date.now() - Math.random() * 300_000).toISOString(),
    },
    error_rate: parseFloat((Math.random() * 0.05).toFixed(4)),
    active_alerts:
      Math.random() > 0.7
        ? ['High error rate on discord sync', 'Cost spike detected in phase 7.3']
        : [],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export interface UseHealthOptions {
  /** Poll interval in ms. Default 10 000 (10 s). */
  interval?: number;
  /** Called on every fetch error (cached data still returned). */
  onError?: (err: Error) => void;
  /** If true, use mock data instead of fetching. Default false. */
  mock?: boolean;
}

export interface UseHealthResult {
  health: Health | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function useHealth(options: UseHealthOptions = {}): UseHealthResult {
  const { interval = DEFAULT_INTERVAL, onError, mock = false } = options;

  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const cacheRef = useRef<Health | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    if (mock) {
      const data = buildMockHealth();
      cacheRef.current = data;
      if (mountedRef.current) {
        setHealth(data);
        setLoading(false);
        setError(null);
        setLastUpdated(new Date());
      }
      return;
    }

    try {
      const res = await fetch(HEALTH_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Health = await res.json();
      cacheRef.current = data;
      if (mountedRef.current) {
        setHealth(data);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e);
      if (mountedRef.current) {
        setError(e);
        if (cacheRef.current) setHealth(cacheRef.current);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mock, onError]);

  const scheduleNext = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      await fetchHealth();
      if (mountedRef.current) scheduleNext();
    }, interval);
  }, [fetchHealth, interval]);

  useEffect(() => {
    mountedRef.current = true;
    fetchHealth().then(() => {
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
    fetchHealth().then(() => {
      if (mountedRef.current) scheduleNext();
    });
  }, [fetchHealth, scheduleNext]);

  return { health, loading, error, lastUpdated, refresh };
}
