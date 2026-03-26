/**
 * @file useSync.ts
 * @description React hook for manual and scheduled sync of ShipStation orders.
 *
 * Wires to:
 * - src/services/syncService.ts (syncOrders)
 * - src/api/shipstationClient.ts (createShipStationClient)
 * - OrdersStore.startSync / syncComplete / syncError (state management)
 *
 * Usage in ControlBar (Sync button):
 * ```tsx
 * const { sync, loading, error, lastSyncTime } = useSync();
 *
 * return (
 *   <button onClick={sync} disabled={loading}>
 *     {loading ? 'Syncing...' : `Sync (${lastSyncTime ? fmtDate(lastSyncTime) : 'Never'})`}
 *   </button>
 * );
 * ```
 *
 * The hook reads lastSyncTime from the store, so it reflects the true last sync
 * time even across re-mounts.
 */

import { useState, useCallback } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { syncOrders, type SyncServiceError } from '../services/syncService';
import { createShipStationClient } from '../api/shipstationClient';

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseSyncReturn {
  /**
   * Trigger a manual incremental sync.
   * Uses lastSyncTime from the store for the incremental window.
   * Updates OrdersStore on success.
   */
  sync: () => Promise<void>;
  /** True while sync is in progress. */
  loading: boolean;
  /** Error from the last failed sync, or null. */
  error: SyncServiceError | null;
  /** Timestamp of the last successful sync (from store). */
  lastSyncTime: Date | null;
  /** Stats from the last sync (null if never synced or on error). */
  lastSyncStats: SyncStats | null;
}

export interface SyncStats {
  newOrders: number;
  updatedOrders: number;
  externallyShipped: number;
  fetchedCount: number;
  syncedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// useSync hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manual sync trigger for ShipStation orders.
 *
 * Behavior:
 * - Reads lastSyncTime from store (incremental sync window)
 * - Calls syncOrders service (pure, no side effects)
 * - On success: calls store.syncComplete() which merges orders + updates sync state
 * - On error: calls store.syncError() to surface error in sync state
 * - Prevents concurrent syncs (no-op if loading)
 *
 * KEY FIX: allOrders is read from store.getState() at call time — NOT from the
 * useCallback closure. This prevents stale closure bugs where the callback
 * captures a snapshot of allOrders that becomes outdated between renders.
 *
 * @returns { sync, loading, error, lastSyncTime, lastSyncStats }
 *
 * @example
 * ```tsx
 * function ControlBar() {
 *   const { sync, loading, error, lastSyncTime } = useSync();
 *
 *   return (
 *     <div className="control-bar">
 *       <button onClick={sync} disabled={loading}>
 *         {loading ? '↺ Syncing...' : '↺ Sync'}
 *       </button>
 *       {lastSyncTime && (
 *         <span className="last-sync">
 *           Last synced: {lastSyncTime.toLocaleTimeString()}
 *         </span>
 *       )}
 *       {error && <span className="sync-error">{error.message}</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSync(): UseSyncReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SyncServiceError | null>(null);
  const [lastSyncStats, setLastSyncStats] = useState<SyncStats | null>(null);

  // Store state — subscription for reactive re-renders
  const lastSyncTime = useOrdersStore((state) => state.sync.lastSyncTime);
  const startSync = useOrdersStore((state) => state.startSync);
  const syncComplete = useOrdersStore((state) => state.syncComplete);
  const syncError = useOrdersStore((state) => state.syncError);

  const sync = useCallback(async (): Promise<void> => {
    if (loading) {
      console.warn('[useSync] Sync already in progress — skipping');
      return;
    }

    setLoading(true);
    setError(null);

    // Signal store that sync started
    startSync();

    // NOTE: PENDING — move to server-side proxy so keys are never in the browser bundle.
    // See shipstationClient.ts for the security tracking comment.
    const keyV1 = (import.meta.env['SHIPSTATION_API_KEY_V1'] as string | undefined) ?? '';
    const secretV1 = (import.meta.env['SHIPSTATION_API_SECRET_V1'] as string | undefined) ?? '';
    const keyV2 = (import.meta.env['SHIPSTATION_API_KEY_V2'] as string | undefined) ?? '';

    const client = createShipStationClient({
      v1ApiKey: `${keyV1}:${secretV1}`,
      v2ApiKey: keyV2,
    });

    // KEY FIX: Read allOrders from store.getState() at call time — NOT from the
    // useCallback closure. Closures capture a snapshot; getState() always returns
    // the current store value, preventing stale-closure bugs in rapid sync scenarios.
    const currentAllOrders = useOrdersStore.getState().allOrders;
    const currentLastSyncTime = useOrdersStore.getState().sync.lastSyncTime;

    const outcome = await syncOrders(
      { lastSyncTime: currentLastSyncTime },
      client,
      currentAllOrders,
    );

    setLoading(false);

    if (outcome.ok) {
      const { result } = outcome;

      // Update the store — merges orders + sets lastSyncTime
      syncComplete(result.syncedAt, result.allOrders);

      setError(null);
      setLastSyncStats({
        newOrders: result.newOrders.length,
        updatedOrders: result.updatedOrders.length,
        externallyShipped: result.externallyShipped.length,
        fetchedCount: result.fetchedCount,
        syncedAt: result.syncedAt,
      });

      if (result.externallyShipped.length > 0) {
        console.warn('[useSync] Detected externally shipped orders (Q6 pending)', {
          count: result.externallyShipped.length,
          orderIds: result.externallyShipped.map((o) => o.id),
        });
      }

      console.info('[useSync] Sync complete', {
        newOrders: result.newOrders.length,
        updatedOrders: result.updatedOrders.length,
        externallyShipped: result.externallyShipped.length,
        fetchedCount: result.fetchedCount,
      });
    } else {
      const serviceError = outcome.error;
      setError(serviceError);

      // Signal store of error
      syncError(serviceError.message);

      // If we got partial data, still update the store
      if (serviceError.partialOrders && serviceError.partialOrders.length > 0) {
        // Re-read current allOrders at this point (may have changed)
        const latestOrders = useOrdersStore.getState().allOrders;
        console.warn('[useSync] Partial sync — updating store with partial data', {
          partialCount: serviceError.partialOrders.length,
          error: serviceError.message,
        });
        syncComplete(new Date(), [...latestOrders, ...serviceError.partialOrders]);
      }

      console.error('[useSync] Sync failed', {
        code: serviceError.code,
        message: serviceError.message,
      });
    }
  }, [loading, startSync, syncComplete, syncError]);
  // NOTE: allOrders and lastSyncTime intentionally NOT in deps — read from getState() at call time.

  return {
    sync,
    loading,
    error,
    lastSyncTime,
    lastSyncStats,
  };
}
