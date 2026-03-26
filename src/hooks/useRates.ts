/**
 * @file useRates.ts
 * @description React hook for fetching shipping rates for an order.
 *
 * Wires to:
 * - src/services/rateService.ts (fetchRates)
 * - src/api/shipstationClient.ts (createShipStationClientFromEnv)
 * - OrdersStore (read order by ID)
 *
 * Usage in ShippingPanel (Fetch Rates button):
 * ```tsx
 * const { rates, loading, error, refresh } = useRates(orderId);
 *
 * return (
 *   <button onClick={refresh} disabled={loading}>
 *     {loading ? 'Fetching...' : 'Fetch Rates'}
 *   </button>
 *   {rates.map(r => <RateRow key={r.serviceCode} rate={r} />)}
 * );
 * ```
 *
 * Cache: 30min in-memory TTL via rateService cache.
 * Fetch on mount: yes (when orderId is provided and order has required data).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { fetchRates, clearRateServiceCache, type ShipStationRate, type RateServiceError } from '../services/rateService';
import { createShipStationClient } from '../api/shipstationClient';

// ─────────────────────────────────────────────────────────────────────────────
// Client singleton (module-level, created once per session)
// ─────────────────────────────────────────────────────────────────────────────

function getShipStationClient() {
  // Use mock credentials for development — real creds from env in production
  const keyV1 = (import.meta.env['PUBLIC_SHIPSTATION_API_KEY_V1'] as string | undefined) ?? '';
  const secretV1 = (import.meta.env['PUBLIC_SHIPSTATION_API_SECRET_V1'] as string | undefined) ?? '';
  const keyV2 = (import.meta.env['PUBLIC_SHIPSTATION_API_KEY_V2'] as string | undefined) ?? '';

  return createShipStationClient({
    v1ApiKey: `${keyV1}:${secretV1}`,
    v2ApiKey: keyV2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseRatesReturn {
  /** Fetched rates. Empty until loaded. Sorted by totalCost ascending. */
  rates: ShipStationRate[];
  /** True while a fetch is in progress. */
  loading: boolean;
  /** Error from the last failed fetch, or null if no error. */
  error: RateServiceError | null;
  /** Whether rates came from cache (vs fresh fetch). */
  fromCache: boolean;
  /** ISO timestamp when rates were cached. */
  cachedAt: Date | null;
  /** Manually trigger a rate refresh (bypasses cache). */
  refresh: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// useRates hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch shipping rates for an order.
 *
 * Behavior:
 * - Fetches on mount when orderId is provided
 * - Returns cached rates immediately if available (30min TTL)
 * - Exposes refresh() to force a re-fetch (clears rate cache entry)
 * - Returns sorted rates (cheapest first)
 * - Aborts in-flight fetch if orderId changes or component unmounts
 *
 * Origin ZIP: Uses default 92101 (San Diego warehouse).
 * TODO: Pull from store/config once warehouse address is configurable.
 *
 * @param orderId - Internal order ID string (from Order.id)
 * @returns { rates, loading, error, fromCache, cachedAt, refresh }
 *
 * @example
 * ```tsx
 * function ShippingPanel({ orderId }: { orderId: string }) {
 *   const { rates, loading, error, refresh } = useRates(orderId);
 *
 *   return (
 *     <>
 *       <button onClick={refresh} disabled={loading}>
 *         {loading ? 'Fetching Rates...' : 'Fetch Rates'}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *       {rates.map(r => <RateRow key={r.serviceCode} rate={r} />)}
 *     </>
 *   );
 * }
 * ```
 */
export function useRates(orderId: string | null): UseRatesReturn {
  const [rates, setRates] = useState<ShipStationRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RateServiceError | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  // Track refresh trigger without adding it to effect deps
  const refreshCountRef = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Read order from store
  const order = useOrdersStore((state) =>
    orderId ? state.allOrders.find((o) => o.id === orderId) ?? null : null,
  );

  const doFetch = useCallback(
    async (forceRefresh: boolean, abortSignal: AbortSignal) => {
      if (!orderId || !order) return;

      if (forceRefresh) {
        clearRateServiceCache();
      }

      setLoading(true);
      setError(null);

      const client = getShipStationClient();

      const result = await fetchRates(
        {
          orderId: order.id,
          clientId: order.clientId,
          weightOz: order.weightOz,
          dimensions: {
            lengthIn: order.dimensions.lengthIn,
            widthIn: order.dimensions.widthIn,
            heightIn: order.dimensions.heightIn,
          },
          originZip: order.shipFrom.postalCode,
          destinationZip: order.shipTo.postalCode,
          residential: order.shipTo.residential,
        },
        client,
      );

      if (abortSignal.aborted) return;

      if (result.ok) {
        // Sort cheapest first
        const sorted = [...result.rates].sort((a, b) => a.totalCost - b.totalCost);
        setRates(sorted);
        setFromCache(result.fromCache);
        setCachedAt(result.cachedAt);
        setError(null);
      } else {
        setError(result.error);
        setRates([]);
      }

      setLoading(false);
    },
    [orderId, order],
  );

  useEffect(() => {
    if (!orderId || !order) {
      setRates([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const isRefresh = refreshCountRef.current > 0;
    void doFetch(isRefresh, controller.signal);

    return () => {
      controller.abort();
    };
  }, [orderId, order, doFetch, refreshTick]);

  const refresh = useCallback(() => {
    refreshCountRef.current += 1;
    setRefreshTick((t) => t + 1);
  }, []);

  return { rates, loading, error, fromCache, cachedAt, refresh };
}
