/**
 * StatsBar — Section 2
 *
 * Displays aggregate order statistics derived from allOrders in ordersStore.
 * No props — reads directly from store. All counts computed via useMemo.
 *
 * Layout:
 *   [Date range: "All Orders"] | [Total (N)] | [Need to Ship (N)] | [Upcoming (N)] | [Progress: N of M shipped]
 */

import { useMemo } from 'react';
import { useOrdersStore } from '../../stores/ordersStore';
import styles from './StatsBar.module.scss';

export default function StatsBar() {
  const allOrders = useOrdersStore((s) => s.allOrders);

  const stats = useMemo(() => {
    const total = allOrders.length;
    const needToShip = allOrders.filter((o) => o.status === 'awaiting_shipment').length;
    // shipByDate doesn't exist on Order type — use 0 per spec
    const upcoming = 0;
    const shipped = allOrders.filter((o) => o.status === 'shipped').length;
    return { total, needToShip, upcoming, shipped };
  }, [allOrders]);

  const progress = stats.total > 0 ? (stats.shipped / stats.total) * 100 : 0;

  return (
    <div className={styles.statsBar} role="region" aria-label="Order statistics">
      {/* Date range (static for now) */}
      <div className={styles.dateRange}>
        <span className={styles.dateIcon} aria-hidden="true">📅</span>
        <span className={styles.dateLabel}>All Orders</span>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Stat chips */}
      <div className={styles.chips}>
        <div className={styles.chip}>
          <span className={styles.chipValue}>{stats.total}</span>
          <span className={styles.chipLabel}>Total</span>
        </div>
        <div className={styles.chipSep} aria-hidden="true">|</div>
        <div className={`${styles.chip} ${stats.needToShip > 0 ? styles.chipWarn : ''}`}>
          <span className={styles.chipValue}>{stats.needToShip}</span>
          <span className={styles.chipLabel}>Need to Ship</span>
        </div>
        <div className={styles.chipSep} aria-hidden="true">|</div>
        <div className={styles.chip}>
          <span className={styles.chipValue}>{stats.upcoming}</span>
          <span className={styles.chipLabel}>Upcoming</span>
        </div>
      </div>

      <div className={styles.divider} aria-hidden="true" />

      {/* Shipped progress */}
      <div className={styles.progressSection}>
        <div
          className={styles.progressBar}
          role="progressbar"
          aria-valuenow={stats.shipped}
          aria-valuemin={0}
          aria-valuemax={stats.total}
          aria-label={`${stats.shipped} of ${stats.total} shipped`}
        >
          <div
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={styles.progressLabel}>
          {stats.shipped} of {stats.total} shipped
        </span>
      </div>
    </div>
  );
}
