/**
 * useRates.ts — React Query hooks for rate enrichment
 *
 * SCAFFOLD STATUS: Rate Enrichment Pipeline (Feature 6)
 * -------------------------------------------------------
 * These hooks are wired but non-functional until:
 *   1. ShipStation API stub in rateService.ts is replaced with real call
 *   2. Client credential storage strategy is resolved
 *
 * NOTE: Requires @tanstack/react-query v5 (QueryClientProvider in app root).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrdersStore } from '../stores/ordersStore';
import { getCachedOrFetchedRate, clearRateCache } from '../utils/rateFetchCache';
import { buildRateFetchRequest, type ShipStationRate, type ClientCredentials } from '../api/rateService';

// Credential resolver placeholder
// TODO: Replace with real lookup from auth store or backend
function getClientCredentials(_clientId: string): ClientCredentials {
  return { apiKey: '', apiSecret: '' };
}

const DEFAULT_ORIGIN_ZIP = '92101';
const DEFAULT_CARRIER_CODE = 'stamps_com';
const DEFAULT_SERVICE_CODE = 'usps_priority_mail';

/**
 * Fetch (or return cached) best shipping rate for a single order.
 * staleTime: 30 minutes | retry: 3
 */
export function useOrderRates(orderId: number, clientId: number) {
  const orders = useOrdersStore((state) => state.orders);

  return useQuery<ShipStationRate | null>({
    queryKey: ['rates', orderId],
    queryFn: async (): Promise<ShipStationRate | null> => {
      const order = orders.find((o) => o.orderId === orderId);
      if (!order) {
        console.warn('[useRates] order not found', { orderId });
        return null;
      }
      const request = buildRateFetchRequest(
        order,
        order.selectedCarrierCode ?? DEFAULT_CARRIER_CODE,
        DEFAULT_ORIGIN_ZIP,
      );
      if (!request) {
        console.warn('[useRates] cannot build rate request', { orderId });
        return null;
      }
      return getCachedOrFetchedRate(
        request,
        getClientCredentials(String(clientId)),
        order.selectedServiceCode ?? DEFAULT_SERVICE_CODE,
      );
    },
    staleTime: 1000 * 60 * 30,
    retry: 3,
    enabled: orderId > 0 && clientId > 0,
  });
}

/**
 * Force-refresh rates for a specific order.
 * Clears in-memory cache + invalidates React Query cache.
 */
export function useRefreshRates(orderId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => { clearRateCache(); },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['rates', orderId] }); },
    onError: (err: unknown) => {
      console.error('[useRates] useRefreshRates failed', { orderId, error: err instanceof Error ? err.message : String(err) });
    },
  });
}

/**
 * Batch-enrich all current store orders with rates.
 */
export function useEnrichOrdersWithRates(clientId: number) {
  const enrichOrdersWithRates = useOrdersStore((state) => state.enrichOrdersWithRates);
  const orders = useOrdersStore((state) => state.orders);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      await enrichOrdersWithRates(orders, String(clientId));
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['rates'] }); },
    onError: (err: unknown) => {
      console.error('[useRates] useEnrichOrdersWithRates failed', { clientId, error: err instanceof Error ? err.message : String(err) });
    },
  });
}
