import type { OrderDTO } from '../../types/orders';
import { fmtCurrency, getOrderWeight } from '../../utils/orders';
import styles from './RightPanel.module.scss';

interface Props {
  order: OrderDTO;
}

export default function SingleOrderPanel({ order }: Props) {
  const weight = getOrderWeight(order);
  const dims = order.dimensions;
  const rate = order.enrichedRate?.rate ?? order.bestRate?.amount;
  const carrier = order.enrichedRate?.carrierCode ?? order.selectedCarrierCode ?? '—';
  const service = order.enrichedRate?.serviceCode ?? order.selectedServiceCode ?? '—';

  return (
    <div className={styles.singlePanel}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <span className={styles.panelOrderNum}>{order.orderNumber}</span>
        <div className={styles.panelHeaderActions}>
          <button className={styles.panelBtn}>Batch ▼</button>
          <button className={styles.panelBtn}>Print ▼</button>
          <button className={styles.panelBtn}>▶ SS</button>
          <button className={styles.panelBtnPrimary}>+ Mark as Shipped</button>
        </div>
      </div>

      {/* Fields */}
      <div className={styles.fieldList}>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Requested</span>
          <span className={styles.fieldValue}>{service}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Ship From</span>
          <span className={styles.fieldValue}>
            DR PREPPER USA — Gardena CA
            <button className={styles.inlineIconBtn} title="Pin ship-from">📍</button>
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Ship Acct</span>
          <span className={styles.fieldValue}>{carrier.toUpperCase()}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Service</span>
          <span className={styles.fieldValue}>{service}</span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Weight</span>
          <span className={styles.fieldValue}>
            <span className={styles.weightInputGroup}>
              <input
                type="number"
                className={styles.weightInput}
                defaultValue={weight ? Math.floor(weight / 16) : 0}
                min={0}
              />
              <span className={styles.weightUnit}>lb</span>
              <input
                type="number"
                className={styles.weightInput}
                defaultValue={weight ? weight % 16 : 0}
                min={0}
                max={15}
              />
              <span className={styles.weightUnit}>oz</span>
            </span>
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Size</span>
          <span className={styles.fieldValue}>
            {dims
              ? `${dims.length} × ${dims.width} × ${dims.height} in`
              : '— × — × —'}
          </span>
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>Package</span>
          <span className={styles.fieldValue}>—</span>
        </div>
      </div>

      <button className={styles.browseRatesBtn}>Browse Rates</button>

      {/* Rate display */}
      {rate != null && (
        <div className={styles.rateRow}>
          <span className={styles.rateAmount}>{fmtCurrency(rate)}</span>
          <span className={styles.rateMeta}> · {carrier} · {service}</span>
          <span className={styles.rateScout}>| Scout Review</span>
        </div>
      )}

      {/* Save defaults link */}
      <div className={styles.saveDefaultsLink}>
        <button className={styles.linkBtn}>Save weights and dims as SKU defaults</button>
      </div>

      {/* CTAs */}
      <div className={styles.ctaGroup}>
        <button className={styles.ctaPrimary}>🖨 Create + Print Label</button>
        <button className={styles.ctaSecondary}>➡ Send to Queue</button>
        <button className={styles.ctaSecondary}>Test</button>
      </div>
    </div>
  );
}
