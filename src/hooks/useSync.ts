/**
 * @file useSync.ts
 * @description React hook for manual and scheduled sync of ShipStation orders.
 *
 * Wires to:
 * - src/api/proxyClient.ts (syncViaProxy) — server handles ShipStation V1 /orders
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
import { SyncServiceError, type SyncServiceErrorCode } from '../services/syncService';
import { syncViaProxy } from '../api/proxyClient';

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

    // Read lastSyncTime at call time — not from closure (stale-closure prevention)
    const currentLastSyncTime = useOrdersStore.getState().sync.lastSyncTime;

    const outcome = await syncViaProxy(currentLastSyncTime);

    setLoading(false);

    if (outcome.ok) {
      const { data } = outcome;
      const syncedAt = new Date(data.syncedAt);

      // Update the store — proxy sync returns stats, not full order objects.
      // Pass current allOrders unchanged (server handles merge on real integration).
      const currentAllOrders = useOrdersStore.getState().allOrders;
      syncComplete(syncedAt, currentAllOrders);

      setError(null);
      setLastSyncStats({
        newOrders: data.newOrders,
        updatedOrders: data.updatedOrders,
        externallyShipped: data.externallyShipped,
        fetchedCount: data.fetchedCount,
        syncedAt,
      });

      if (data.externallyShipped > 0) {
        console.warn('[useSync] Detected externally shipped orders (Q6)', {
          count: data.externallyShipped,
        });
      }

      console.info('[useSync] Sync complete', {
        newOrders: data.newOrders,
        updatedOrders: data.updatedOrders,
        externallyShipped: data.externallyShipped,
        fetchedCount: data.fetchedCount,
      });
    } else {
      const errorCode: SyncServiceErrorCode =
        outcome.status === 401
          ? 'AUTH_ERROR'
          : outcome.status === 429
          ? 'RATE_LIMITED'
          : outcome.status >= 500
          ? 'API_ERROR'
          : 'API_ERROR';

      const serviceError = new SyncServiceError(outcome.error, errorCode);
      setError(serviceError);

      // Signal store of error
      syncError(serviceError.message);

      console.error('[useSync] Sync failed', {
        code: serviceError.code,
        status: outcome.status,
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
