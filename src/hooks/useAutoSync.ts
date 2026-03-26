/**
 * @file useAutoSync.ts
 * @description Background auto-sync hook — runs sync every 5 minutes.
 *
 * Q6 (DJ, LOCKED): "All orders must be checked to see if it's been shipped
 * either through ss or externally every few minutes."
 *
 * Behavior:
 * - Runs syncOrders every AUTO_SYNC_INTERVAL_MS (5 minutes)
 * - Non-blocking: sync runs in background, does NOT block UI
 * - Retry on failure with exponential backoff (max MAX_RETRY_DELAY_MS)
 * - Shows notification when external shipments are detected
 * - Cleans up interval on unmount (no memory leaks)
 * - Skips sync if one is already in progress
 *
 * Usage:
 * ```tsx
 * function App() {
 *   useAutoSync(); // Mount once at the app root
 *   return <Router />;
 * }
 * ```
 */

import { useEffect, useRef, useCallback } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { syncOrders } from '../services/syncService';
import { createShipStationClient } from '../api/shipstationClient';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Q6: "All orders must be checked... every few minutes."
 * DJ defined: 5 minutes.
 */
export const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Base delay for exponential backoff on failure. */
export const AUTO_SYNC_BASE_RETRY_MS = 30_000; // 30 seconds

/** Maximum retry delay (caps exponential growth). */
export const AUTO_SYNC_MAX_RETRY_MS = 5 * 60 * 1000; // 5 minutes (match normal interval)

/** Maximum consecutive failures before giving up (until next normal interval tick). */
export const AUTO_SYNC_MAX_CONSECUTIVE_FAILURES = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoSyncState {
  /** True while auto-sync is actively running a sync cycle. */
  running: boolean;
  /** Number of consecutive failures since last success. */
  consecutiveFailures: number;
  /** Timestamp of last successful auto-sync. */
  lastAutoSyncAt: Date | null;
  /** Last error from auto-sync (null if last sync was successful). */
  lastError: string | null;
}

export interface UseAutoSyncReturn {
  /** Current auto-sync state (for debugging/status display). */
  state: AutoSyncState;
  /** Manually trigger an immediate auto-sync cycle (e.g. from UI). */
  triggerNow: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create ShipStation client from env
// ─────────────────────────────────────────────────────────────────────────────

function createClientFromEnv() {
  const keyV1 = (import.meta.env['SHIPSTATION_API_KEY_V1'] as string | undefined) ?? '';
  const secretV1 = (import.meta.env['SHIPSTATION_API_SECRET_V1'] as string | undefined) ?? '';
  const keyV2 = (import.meta.env['SHIPSTATION_API_KEY_V2'] as string | undefined) ?? '';

  return createShipStationClient({
    v1ApiKey: `${keyV1}:${secretV1}`,
    v2ApiKey: keyV2,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// useAutoSync hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Background auto-sync hook. Mount once at App root.
 *
 * Per DJ's Q6: syncs every 5 minutes to detect external shipments.
 * Retries with exponential backoff on failure.
 * Fires toast notification when externally shipped orders are detected.
 */
export function useAutoSync(): UseAutoSyncReturn {
  const stateRef = useRef<AutoSyncState>({
    running: false,
    consecutiveFailures: 0,
    lastAutoSyncAt: null,
    lastError: null,
  });

  // Stable ref to always have latest state for re-renders
  const forceUpdate = useRef<(() => void) | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Store actions (stable references) ──
  const startSync = useOrdersStore((state) => state.startSync);
  const syncComplete = useOrdersStore((state) => state.syncComplete);
  const syncError = useOrdersStore((state) => state.syncError);
  const markExternallyShipped = useOrdersStore((state) => state.markExternallyShipped);

  // ── Notification helper ──
  // Uses console.warn as a lightweight notification for now.
  // Production: wire to UIStore.addToast or a notification system.
  const notifyExternalShipments = useCallback((count: number, orderIds: string[]) => {
    console.warn(
      `[useAutoSync] ⚠️ ${count} order(s) detected as externally shipped. ` +
      `Creating labels for these will result in double-shipping. IDs: ${orderIds.join(', ')}`,
    );

    // Try to add toast via UIStore if available
    // (import dynamically to avoid circular deps)
    try {
      const { useUIStore } = require('../stores/uiStore') as typeof import('../stores/uiStore');
      const addToast = useUIStore.getState().addToast;
      if (addToast) {
        addToast(
          `⚠️ ${count} order(s) shipped externally — label creation disabled to prevent double-shipping.`,
          'error',
        );
      }
    } catch {
      // UIStore not available in test environment — that's fine
    }
  }, []);

  // ── Core sync function ──
  const runSync = useCallback(async (): Promise<void> => {
    const state = stateRef.current;

    // Skip if already running
    if (state.running) {
      console.debug('[useAutoSync] Skipping — sync already in progress');
      return;
    }

    stateRef.current = { ...state, running: true };

    // Signal store (for global syncing indicator)
    startSync();

    try {
      const client = createClientFromEnv();

      // Read current state at call time (avoid stale closure)
      const currentOrders = useOrdersStore.getState().allOrders;
      const lastSyncTime = useOrdersStore.getState().sync.lastSyncTime;

      const outcome = await syncOrders(
        { lastSyncTime },
        client,
        currentOrders,
      );

      if (outcome.ok) {
        const { result } = outcome;

        // Update store
        syncComplete(result.syncedAt, result.allOrders);

        // Reset failure count on success
        stateRef.current = {
          running: false,
          consecutiveFailures: 0,
          lastAutoSyncAt: result.syncedAt,
          lastError: null,
        };

        // Q6: wire external shipments into store + notify
        if (result.externallyShipped.length > 0) {
          // Mark each externally shipped order in the store (moves to shipped section)
          for (const order of result.externallyShipped) {
            const detectedAt = order.externallyShippedAt ?? result.syncedAt;
            markExternallyShipped(order.id, detectedAt);
          }

          notifyExternalShipments(
            result.externallyShipped.length,
            result.externallyShipped.map((o) => o.id),
          );
        }

        console.info('[useAutoSync] Sync complete', {
          newOrders: result.newOrders.length,
          updatedOrders: result.updatedOrders.length,
          externallyShipped: result.externallyShipped.length,
          fetchedCount: result.fetchedCount,
        });
      } else {
        const { error } = outcome;
        const failures = state.consecutiveFailures + 1;

        // Exponential backoff: 30s, 60s, 120s, 240s, 300s (max)
        const backoffMs = Math.min(
          AUTO_SYNC_BASE_RETRY_MS * Math.pow(2, failures - 1),
          AUTO_SYNC_MAX_RETRY_MS,
        );

        stateRef.current = {
          running: false,
          consecutiveFailures: failures,
          lastAutoSyncAt: state.lastAutoSyncAt,
          lastError: error.message,
        };

        syncError(error.message);

        console.error('[useAutoSync] Sync failed', {
          code: error.code,
          message: error.message,
          consecutiveFailures: failures,
          retryInMs: backoffMs,
        });

        // Schedule retry with backoff (if under max failures)
        if (failures < AUTO_SYNC_MAX_CONSECUTIVE_FAILURES) {
          retryTimeoutRef.current = setTimeout(() => {
            void runSync();
          }, backoffMs);
        } else {
          console.error(
            `[useAutoSync] Max consecutive failures (${AUTO_SYNC_MAX_CONSECUTIVE_FAILURES}) reached. ` +
            'Waiting for next scheduled interval tick.',
          );
        }
      }
    } catch (err) {
      // Unexpected error (shouldn't happen — syncOrders doesn't throw)
      const message = err instanceof Error ? err.message : String(err);
      stateRef.current = {
        running: false,
        consecutiveFailures: stateRef.current.consecutiveFailures + 1,
        lastAutoSyncAt: stateRef.current.lastAutoSyncAt,
        lastError: message,
      };
      syncError(message);
      console.error('[useAutoSync] Unexpected error', err);
    }
  // Stable deps only — store actions are stable Zustand refs
  }, [startSync, syncComplete, syncError, markExternallyShipped, notifyExternalShipments]);

  // ── Set up interval on mount ──
  useEffect(() => {
    // Run immediately on mount (don't wait 5 min for first sync)
    void runSync();

    // Then every 5 minutes per DJ's Q6
    intervalRef.current = setInterval(() => {
      // Reset failure count on each new interval tick (fresh start)
      stateRef.current = {
        ...stateRef.current,
        consecutiveFailures: 0,
      };
      void runSync();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      // Cleanup on unmount
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  // runSync is stable (useCallback with stable deps) — mount-only effect intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expose manual trigger (for UI "sync now" button or testing)
  const triggerNow = useCallback(() => {
    // Clear any pending retry before triggering
    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    void runSync();
  }, [runSync]);

  // Dummy ref for forceUpdate (not needed unless we make state reactive)
  forceUpdate.current = () => { /* no-op — callers read from store */ };

  return {
    state: stateRef.current,
    triggerNow,
  };
}
