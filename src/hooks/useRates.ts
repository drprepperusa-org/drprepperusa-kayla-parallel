/**
 * @file useRates.ts
 * @description React hook for fetching shipping rates for an order.
 *
 * Wires to:
 * - src/services/rateService.ts (fetchRates)
 * - src/api/shipstationClient.ts (createShipStationClient)
 * - OrdersStore (read order by ID from allOrders)
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
 *
 * FIX: doFetch logic is inlined directly into useEffect — no useCallback wrapper.
 * This eliminates the diamond dependency pattern (useCallback depends on orderId/order,
 * useEffect depends on doFetch, which effectively means both depend on orderId/order
 * through two hops). Inlining is cleaner and avoids the intermediate cache miss.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { fetchRates, clearRateServiceCache, type ShipStationRate, type RateServiceError } from '../services/rateService';
import { createShipStationClient } from '../api/shipstationClient';

// ─────────────────────────────────────────────────────────────────────────────
// Client factory (creates a new client per fetch — keys may change)
// ─────────────────────────────────────────────────────────────────────────────

function getShipStationClient() {
  // NOTE: PENDING — move to server-side proxy so keys are never in the browser bundle.
  // See shipstationClient.ts for the security tracking comment.
  const keyV1 = (import.meta.env['SHIPSTATION_API_KEY_V1'] as string | undefined) ?? '';
  const secretV1 = (import.meta.env['SHIPSTATION_API_SECRET_V1'] as string | undefined) ?? '';
  const keyV2 = (import.meta.env['SHIPSTATION_API_KEY_V2'] as string | undefined) ?? '';

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
 * Origin ZIP: Uses order.shipFrom.postalCode (set from warehouse address).
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

  // Track refresh trigger — increment to re-run the effect
  const refreshCountRef = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);

  // Read order from allOrders (canonical Order domain type)
  const order = useOrdersStore((state) =>
    orderId ? state.allOrders.find((o) => o.id === orderId) ?? null : null,
  );

  // FIX: doFetch logic is inlined in useEffect — no useCallback diamond dependency.
  // Previously: useCallback(doFetch, [orderId, order]) → useEffect([doFetch, refreshTick])
  // This created a two-hop dependency chain. Inlining removes the intermediate node.
  useEffect(() => {
    if (!orderId || !order) {
      setRates([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const forceRefresh = refreshCountRef.current > 0;

    async function runFetch() {
      if (forceRefresh) {
        clearRateServiceCache();
      }

      setLoading(true);
      setError(null);

      const client = getShipStationClient();

      const result = await fetchRates(
        {
          orderId: order!.id,
          clientId: order!.clientId,
          weightOz: order!.weightOz,
          dimensions: {
            lengthIn: order!.dimensions.lengthIn,
            widthIn: order!.dimensions.widthIn,
            heightIn: order!.dimensions.heightIn,
          },
          originZip: order!.shipFrom.postalCode,
          destinationZip: order!.shipTo.postalCode,
          residential: order!.shipTo.residential ?? false,
        },
        client,
      );

      if (controller.signal.aborted) return;

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
    }

    void runFetch();

    return () => {
      controller.abort();
    };
  }, [orderId, order, refreshTick]);

  const refresh = useCallback(() => {
    refreshCountRef.current += 1;
    setRefreshTick((t) => t + 1);
  }, []);

  return { rates, loading, error, fromCache, cachedAt, refresh };
}
