/**
 * useSync — React Query mutation hook for triggering a backend sync.
 *
 * POST /api/sync — sends last sync time, receives sync result.
 *
 * Wires into ordersStore sync state machine:
 *   startSync()    → onMutate (signals UI loading state)
 *   syncComplete() → onSuccess (updates allOrders + timestamp)
 *   syncError()    → onError (surfaces error message)
 *
 * Gracefully degrades: if the backend is unavailable, syncError() is called
 * and the UI shows the error without crashing.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client';
import { useOrdersStore } from '../stores/ordersStore';

interface SyncResult {
  synced: number;
  lastSyncTime: string;
}

export function useSync() {
  const queryClient = useQueryClient();
  const startSync = useOrdersStore((s) => s.startSync);
  const syncComplete = useOrdersStore((s) => s.syncComplete);
  const syncError = useOrdersStore((s) => s.syncError);

  const mutation = useMutation({
    mutationFn: (lastSyncTime: Date | null) =>
      apiRequest<SyncResult>('POST', '/sync', {
        body: { lastSyncTime: lastSyncTime?.toISOString() ?? null },
      }),
    onMutate: () => startSync(),
    onSuccess: (result) => {
      // Pass existing allOrders — backend sync returns a count, not the order data.
      // allOrders will be refreshed separately when the orders query is invalidated.
      const existingOrders = useOrdersStore.getState().allOrders;
      syncComplete(new Date(result.lastSyncTime), existingOrders);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) => {
      syncError(err instanceof Error ? err.message : 'Sync failed');
    },
  });

  return {
    sync: () => mutation.mutate(useOrdersStore.getState().sync.lastSyncTime),
    syncing: mutation.isPending,
  };
}
