import type { OrderDTO } from '../../types/orders';
import { fmtCurrency, getTotalQty } from '../../utils/orders';
import styles from './RightPanel.module.scss';

interface Props {
  orders: OrderDTO[];
  onRemove: (orderId: number) => void;
  onClearAll: () => void;
}

export default function BatchPanel({ orders, onRemove, onClearAll }: Props) {
  const totalUnits = orders.reduce((sum, o) => sum + getTotalQty(o), 0);
  const totalCost = orders.reduce(
    (sum, o) => sum + (o.enrichedRate?.rate ?? o.bestRate?.amount ?? 0),
    0,
  );

  // Count distinct SKUs across all selected orders
  const allSkus = new Set(
    orders.flatMap((o) => (o.items ?? []).map((item) => item.sku)),
  );
  const isMultiSku = allSkus.size > 1;

  // Destinations: count by state
  const destMap: Record<string, number> = {};
  for (const o of orders) {
    const state = o.shipTo?.state ?? '??';
    destMap[state] = (destMap[state] ?? 0) + 1;
  }

  return (
    <div className={styles.batchPanel}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <span className={styles.batchTitle}>📦 Batch Ship</span>
        <span className={styles.batchMeta}>
          {orders.length} orders · {totalUnits} units · {fmtCurrency(totalCost)}
        </span>
      </div>

      {/* Multi-SKU warning */}
      {isMultiSku && (
        <div className={styles.multiSkuWarning}>
          ⚠ Multi-SKU — {allSkus.size} different products
        </div>
      )}

      {/* Destinations */}
      <div className={styles.destinationsRow}>
        {Object.entries(destMap).map(([state, count]) => (
          <span key={state} className={styles.destChip}>
            {state} ({count})
          </span>
        ))}
      </div>

      {/* Selected orders list */}
      <div className={styles.batchOrderList}>
        {orders.map((o) => (
          <div key={o.orderId} className={styles.batchOrderRow}>
            <span className={styles.batchOrderNum}>{o.orderNumber}</span>
            <span className={styles.batchOrderZip}> · {o.shipTo?.postalCode ?? '—'}</span>
            <span className={styles.batchOrderSep}> — </span>
            <button
              className={styles.removeBtn}
              onClick={() => onRemove(o.orderId)}
              title="Remove from batch"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div className={styles.ctaGroup}>
        <button className={styles.ctaPrimary}>🖨 Print Labels</button>
        <button className={styles.ctaSecondary}>➡ Send to Queue</button>
      </div>

      {/* Test mode */}
      <div className={styles.testModeRow}>
        <label className={styles.testModeLabel}>
          <input type="checkbox" className={styles.testModeCheck} />
          Test mode (no charges)
        </label>
      </div>

      {/* Clear selection */}
      <div className={styles.clearRow}>
        <button className={styles.clearLink} onClick={onClearAll}>
          × Clear Selection
        </button>
      </div>

      {/* Footer note */}
      <div className={styles.batchFooterNote}>
        Dimensions, weight, package type, and carrier all come from each order's settings. Click
        individual orders to edit before shipping.
      </div>
    </div>
  );
}
