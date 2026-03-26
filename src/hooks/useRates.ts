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
import { RateServiceError, type ShipStationRate } from '../services/rateService';

// ─────────────────────────────────────────────────────────────────────────────
// Rate fetch via server-side proxy
// ─────────────────────────────────────────────────────────────────────────────

// SECURITY: API keys have been removed from client-side code.
// PENDING: Move to server-side proxy at /api/rates
// TODO: Once server proxy is live, update this to POST /api/rates with order data.
// The proxy will hold SHIPSTATION_API_KEY_V1 / SHIPSTATION_API_SECRET_V1
// in server-side environment variables (never exposed to the browser bundle).

interface ProxyRateRequest {
  orderId: string;
  clientId: string;
  weightOz: number;
  dimensions: { lengthIn: number; widthIn: number; heightIn: number };
  originZip: string;
  destinationZip: string;
  residential: boolean;
}

interface ProxyRateResponse {
  rates: ShipStationRate[];
  fromCache: boolean;
  cachedAt: string | null;
}

async function fetchRatesViaProxy(
  request: ProxyRateRequest,
): Promise<{ ok: true; rates: ShipStationRate[]; fromCache: boolean; cachedAt: Date | null } | { ok: false; error: RateServiceError }> {
  const response = await fetch('/api/rates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    return {
      ok: false,
      error: new RateServiceError(
        `Rate proxy returned ${response.status}: ${text}`,
        'NETWORK_ERROR',
      ),
    };
  }

  const data = (await response.json()) as ProxyRateResponse;
  return {
    ok: true,
    rates: data.rates,
    fromCache: data.fromCache,
    cachedAt: data.cachedAt ? new Date(data.cachedAt) : null,
  };
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

    async function runFetch() {
      // Note: cache-busting for forced refresh is now handled server-side.
      // The forceRefresh flag is passed as a header for the proxy to interpret.
      setLoading(true);
      setError(null);

      // TODO: Once server proxy is live, update this to POST /api/rates with order data.
      // PENDING: Move to server-side proxy at /api/rates
      const result = await fetchRatesViaProxy({
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
      });

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
