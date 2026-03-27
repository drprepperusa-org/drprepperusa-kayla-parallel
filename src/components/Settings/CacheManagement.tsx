/**
 * CacheManagement.tsx
 *
 * Settings section: clears rate cache and triggers refetch for
 * awaiting_shipment orders.
 *
 * Currently logs intent to console; API integration is future work.
 */

import React, { useState, useCallback } from 'react';
import styles from './CacheManagement.module.scss';

const SIMULATED_DURATION_MS = 2000;

export default function CacheManagement(): React.ReactElement {
  const [loading, setLoading] = useState(false);

  const handleRefresh = useCallback(() => {
    if (loading) return;

    console.log('[CacheManagement] clear + refetch triggered');
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
    }, SIMULATED_DURATION_MS);
  }, [loading]);

  return (
    <section className={styles.section} aria-labelledby="cache-management-heading">
      <h3 id="cache-management-heading" className={styles.sectionTitle}>
        Cache Management
      </h3>
      <p className={styles.sectionSubtitle}>
        Clear rate cache and refetch all rates for awaiting_shipment orders.
      </p>

      <div className={styles.row}>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={handleRefresh}
          disabled={loading}
          aria-label={loading ? 'Refreshing cache…' : 'Clear cache and refetch rates'}
        >
          <span className={`${styles.icon}${loading ? ` ${styles.spinning}` : ''}`} aria-hidden="true">
            ↻
          </span>
          {loading ? 'Refreshing…' : 'Clear & Refetch Rates'}
        </button>

        {loading && (
          <span className={styles.statusText} role="status" aria-live="polite">
            Clearing cache and fetching rates…
          </span>
        )}
      </div>
    </section>
  );
}
