/**
 * SyncIndicator — shared component for displaying sync status.
 *
 * Used in: Sidebar footer, OrdersView toolbar (ControlBar)
 * Pure display — no store deps. Parent wires onManualSync.
 */

import { useState, useEffect } from 'react';
import styles from './SyncIndicator.module.scss';

export interface SyncIndicatorProps {
  syncing: boolean;
  lastSyncTime: Date | null;
  /** Optional: shows a sync button when provided */
  onManualSync?: () => void;
  /** 'compact' shows only spinner/dot; 'full' shows text label too */
  variant?: 'compact' | 'full';
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1m ago';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return '1h ago';
  return `${diffHr}h ago`;
}

export default function SyncIndicator({
  syncing,
  lastSyncTime,
  onManualSync,
  variant = 'full',
}: SyncIndicatorProps) {
  const [, setTick] = useState(0);

  // Re-render every 30s to refresh relative time
  useEffect(() => {
    if (!lastSyncTime || syncing) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncTime, syncing]);

  const label = syncing
    ? 'Syncing…'
    : lastSyncTime
    ? `Last synced ${getRelativeTime(lastSyncTime)}`
    : 'Never synced';

  return (
    <span className={`${styles.syncIndicator} ${styles[variant]}`}>
      {syncing ? (
        <span className={styles.spinner} aria-label="Syncing" role="status" />
      ) : (
        <span
          className={`${styles.dot} ${lastSyncTime ? styles.dotOk : styles.dotNever}`}
          aria-hidden="true"
        />
      )}
      {variant === 'full' && (
        <span className={styles.label}>{label}</span>
      )}
      {onManualSync && (
        <button
          className={styles.syncBtn}
          onClick={onManualSync}
          disabled={syncing}
          title="Sync now"
          aria-label="Sync now"
        >
          ↻
        </button>
      )}
    </span>
  );
}
