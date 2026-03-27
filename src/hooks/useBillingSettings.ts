/**
 * useBillingSettings — React Query hooks for billing settings API.
 *
 * GET  /api/settings/billing — load settings on mount
 * PUT  /api/settings/billing — persist settings changes
 *
 * These hooks gracefully degrade: if the backend is unavailable, the
 * billingStore defaults are used as fallback (no regression).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';

export interface BillingSettings {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}

export function useBillingSettings() {
  return useQuery({
    queryKey: ['settings', 'billing'],
    queryFn: () => apiRequest<BillingSettings>('GET', '/settings/billing'),
    staleTime: 10 * 60 * 1000,
    // Don't throw on error — SettingsPage falls back to store defaults
    retry: 1,
  });
}

export function useUpdateBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<BillingSettings>) =>
      apiRequest<BillingSettings>('PUT', '/settings/billing', { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', 'billing'] });
    },
  });
}
