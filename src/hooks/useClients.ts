/**
 * useClients — React Query hook for the clients list API.
 *
 * GET /api/clients — returns list of client records with display names.
 *
 * Gracefully degrades: if the backend is unavailable or returns an error,
 * callers fall back to existing store-derived names (no regression).
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client';

export interface ClientRecord {
  clientId: number;
  name: string;
  storeIds: number[];
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => apiRequest<ClientRecord[]>('GET', '/clients'),
    staleTime: 30 * 60 * 1000,
    // Don't throw on error — callers fall back to existing behavior
    retry: 1,
  });
}
