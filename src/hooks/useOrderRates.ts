/**
 * @file useOrderRates.ts
 * @description React Query hook for fetching shipping rates for an order.
 *
 * This is the React Query v5 pattern hook — the template for all future
 * server-state hooks. It replaces the manual useState/useEffect pattern in
 * useRates.ts for new code going forward.
 *
 * Cache: 30min staleTime matches the server-side rate cache TTL.
 * Deduplication: React Query deduplicates concurrent fetches by queryKey.
 *
 * Usage:
 * ```tsx
 * const { data, isLoading, error, refetch } = useOrderRates(orderId);
 * const rates = data?.rates ?? [];
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import type { Rate } from '../types/orders';

interface RatesResponse {
  rates: Rate[];
  fromCache: boolean;
  cachedAt: string | null;
}

export function useOrderRates(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['rates', orderId],
    queryFn: () => apiRequest<RatesResponse>('GET', `/rates/${orderId}`),
    enabled: enabled && orderId !== null,
    staleTime: 30 * 60 * 1000, // 30 min — matches server-side cache TTL
    gcTime: 35 * 60 * 1000,
  });
}
