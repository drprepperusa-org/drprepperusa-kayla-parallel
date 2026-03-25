/**
 * OrderDetail — slide-out panel (desktop) / bottom sheet (mobile)
 * Displays full order info: customer, shipping, items, totals, tracking, actions.
 */

import { useEffect, useCallback } from 'react';
import { useOrderDetailStore } from '../../stores/orderDetailStore';
import { useUIStore } from '../../stores/uiStore';
import { fmtDate, fmtCurrency, fmtWeight, getOrderWeight } from '../../utils/orders';
import type { OrderDTO } from '../../types/orders';
import PrintLabelButton from '../PrintLabelButton';
import styles from './OrderDetail.module.scss';

// ─── Demo credentials (replace with real multi-tenant credential lookup) ──────
const DEMO_CREDENTIALS = {
  apiKey: import.meta.env.VITE_SHIPSTATION_API_KEY ?? '',
  apiSecret: import.meta.env.VITE_SHIPSTATION_API_SECRET ?? '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeClass(status: OrderDTO['status']): string {
  switch (status) {
    case 'awaiting_shipment': return styles.awaiting;
    case 'shipped': return styles.shipped;
    case 'cancelled': return styles.cancelled;
    default: return styles.pending;
  }
}

function statusLabel(status: OrderDTO['status']): string {
  switch (status) {
    case 'awaiting_shipment': return 'Awaiting Shipment';
    case 'shipped': return 'Shipped';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoItem}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={mono ? styles.infoValueMono : styles.infoValue}>{value || '—'}</span>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionContent}>{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrderDetail() {
  const { isOpen, selectedOrder, loading, error, closeDetail } = useOrderDetailStore();
  const { addToast } = useUIStore();

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDetail();
  }, [closeDetail]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // ── Loading state ──
  if (loading) {
    return (
      <div className={styles.overlay} onClick={closeDetail}>
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <span className={styles.orderNumber}>Loading…</span>
            <button className={styles.closeBtn} onClick={closeDetail} aria-label="Close">✕</button>
          </div>
          <div className={styles.stateContainer}>Loading order details…</div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !selectedOrder) {
    return (
      <div className={styles.overlay} onClick={closeDetail}>
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <span className={styles.orderNumber}>Error</span>
            <button className={styles.closeBtn} onClick={closeDetail} aria-label="Close">✕</button>
          </div>
          <div className={styles.stateContainer}>
            <span className={styles.errorText}>{error || 'Order not found'}</span>
          </div>
        </div>
      </div>
    );
  }

  const order = selectedOrder;
  const shipTo = order.shipTo;
  const items = order.items ?? [];
  const weight = getOrderWeight(order);
  const isShipped = order.status === 'shipped';
  const isCancelled = order.status === 'cancelled';

  // ── Action handlers (stubs with toast feedback) ──
  const handleRefund = () => addToast(`Refund initiated for ${order.orderNumber}`, 'info');
  const handleCancel = () => addToast(`Cancel requested for ${order.orderNumber}`, 'info');
  const handleCopyTracking = () => {
    if (order.trackingNumber) {
      navigator.clipboard.writeText(order.trackingNumber).catch(() => undefined);
      addToast('Tracking number copied!', 'success');
    }
  };

  return (
    <div className={styles.overlay} onClick={closeDetail}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.orderNumber}>{order.orderNumber}</span>
            <span className={`${styles.statusBadge} ${statusBadgeClass(order.status)}`}>
              {statusLabel(order.status)}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={closeDetail} aria-label="Close panel">✕</button>
        </div>

        {/* ── Scrollable body ── */}
        <div className={styles.body}>

          {/* Customer Info */}
          <SectionBlock title="Customer">
            <div className={styles.infoGrid}>
              <InfoItem label="Name" value={shipTo?.name ?? ''} />
              <InfoItem label="Order Date" value={fmtDate(order.createdAt)} />
              <InfoItem label="Order ID" value={String(order.orderId)} mono />
              <InfoItem label="Store" value={`Store ${order.storeId}`} />
            </div>
          </SectionBlock>

          {/* Shipping Address */}
          {shipTo && (
            <SectionBlock title="Ship To">
              <div className={styles.addressBlock}>
                {shipTo.name && <span className={styles.addressName}>{shipTo.name}</span>}
                {shipTo.company && <span>{shipTo.company}</span>}
                {shipTo.street1 && <span>{shipTo.street1}</span>}
                {shipTo.street2 && <span>{shipTo.street2}</span>}
                {(shipTo.city || shipTo.state || shipTo.postalCode) && (
                  <span>
                    {[shipTo.city, shipTo.state, shipTo.postalCode].filter(Boolean).join(', ')}
                  </span>
                )}
                {shipTo.country && <span>{shipTo.country}</span>}
                {order.residential !== undefined && (
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    {order.residential ? '🏠 Residential' : '🏢 Commercial'}
                  </span>
                )}
              </div>
            </SectionBlock>
          )}

          {/* Items */}
          {items.length > 0 && (
            <SectionBlock title={`Items (${items.length})`}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th className={styles.itemsTh}>Item</th>
                    <th className={styles.itemsTh} style={{ width: 50, textAlign: 'center' }}>Qty</th>
                    <th className={styles.itemsTh} style={{ width: 80, textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={`${item.sku}-${idx}`}>
                      <td className={styles.itemsTd}>
                        <div className={styles.itemName}>{item.name || 'Unknown Item'}</div>
                        <div className={styles.itemSku}>{item.sku}</div>
                      </td>
                      <td className={styles.itemsTd} style={{ textAlign: 'center' }}>{item.quantity}</td>
                      <td className={styles.itemsTd} style={{ textAlign: 'right' }}>
                        {item.price !== undefined ? fmtCurrency(item.price) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionBlock>
          )}

          {/* Totals */}
          <SectionBlock title="Order Totals">
            <div className={styles.totalsGrid}>
              {order.bestRate && (
                <div className={styles.totalRow}>
                  <span>Best Rate ({order.bestRate.serviceName})</span>
                  <span className={styles.rateValue}>{fmtCurrency(order.bestRate.amount)}</span>
                </div>
              )}
              {order.selectedServiceCode && (
                <div className={styles.totalRow}>
                  <span>Selected Carrier</span>
                  <span className={styles.totalValue}>{order.selectedServiceCode}</span>
                </div>
              )}
              {weight && (
                <div className={styles.totalRow}>
                  <span>Package Weight</span>
                  <span className={styles.totalValue}>{fmtWeight(weight)}</span>
                </div>
              )}
              {order.dimensions && (
                <div className={styles.totalRow}>
                  <span>Dimensions (L×W×H)</span>
                  <span className={styles.totalValue}>
                    {order.dimensions.length}×{order.dimensions.width}×{order.dimensions.height} in
                  </span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.totalRowBold}`}>
                <span>Order Total</span>
                <span>{fmtCurrency(order.orderTotal)}</span>
              </div>
            </div>
          </SectionBlock>

          {/* Tracking */}
          <SectionBlock title="Tracking & Shipping">
            <div className={styles.infoGrid}>
              <InfoItem
                label="Carrier"
                value={order.selectedCarrierCode?.toUpperCase() ?? order.selectedServiceCode ?? ''}
              />
              <InfoItem
                label="Label Created"
                value={order.labelCreated ? fmtDate(order.labelCreated) : ''}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <div className={styles.infoLabel}>Tracking Number</div>
              {order.trackingNumber ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span className={styles.trackingNumber}>{order.trackingNumber}</span>
                  <button
                    className={`${styles.actionBtn} ${styles.secondary}`}
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={handleCopyTracking}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <span className={styles.noTracking}>No tracking number yet</span>
              )}
            </div>
          </SectionBlock>

        </div>

        {/* ── Actions Footer ── */}
        <div className={styles.footer}>
          <PrintLabelButton
            order={order}
            credentials={DEMO_CREDENTIALS}
            className={`${styles.actionBtn} ${styles.primary}`}
          />
          <button
            className={`${styles.actionBtn} ${styles.secondary}`}
            onClick={() => addToast(`Viewing order ${order.orderNumber}`, 'info')}
          >
            👁 View in Store
          </button>
          {isShipped && (
            <button
              className={`${styles.actionBtn} ${styles.secondary}`}
              onClick={() => addToast(`Resending confirmation for ${order.orderNumber}`, 'info')}
            >
              📧 Resend Confirmation
            </button>
          )}
          {!isCancelled && (
            <button
              className={`${styles.actionBtn} ${styles.danger}`}
              onClick={handleRefund}
            >
              ↩ Refund
            </button>
          )}
          {!isShipped && !isCancelled && (
            <button
              className={`${styles.actionBtn} ${styles.danger}`}
              onClick={handleCancel}
            >
              ✕ Cancel Order
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
