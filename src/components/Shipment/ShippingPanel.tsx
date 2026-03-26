/**
 * @file ShippingPanel.tsx
 * @description Single-order right-panel view.
 * Shows customer info, items, weight, address, label status, billing, and action buttons.
 * "Fetch Rates" and "Create Label" are disabled for now (API integration pending).
 */

import React from 'react';
import { useOrdersStore } from '../../stores/ordersStore';
import type { Order } from '../../types/orders';
import styles from '../../styles/AwaitingShipments.module.scss';

interface ShippingPanelProps {
  orderId: string;
}

function formatWeight(oz: number): string {
  if (oz >= 16) {
    const lbs = Math.floor(oz / 16);
    const rem = oz % 16;
    return rem > 0 ? `${lbs} lb ${rem} oz` : `${lbs} lb`;
  }
  return `${oz} oz`;
}

function formatAddress(order: Order): string {
  const a = order.shipTo;
  const lines = [
    a.street1,
    a.street2,
    `${a.city}, ${a.state} ${a.postalCode}`,
    a.country !== 'US' ? a.country : undefined,
  ].filter(Boolean);
  return lines.join('\n');
}

const ShippingPanel: React.FC<ShippingPanelProps> = ({ orderId }) => {
  const allOrders = useOrdersStore((s) => s.allOrders);
  const order = allOrders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className={styles.shippingPanel}>
        <p style={{ color: '#999', fontSize: 13 }}>Order not found.</p>
      </div>
    );
  }

  const addressStr = formatAddress(order);

  return (
    <div className={styles.shippingPanel}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>{order.customer}</div>
          <div className={styles.panelOrderNum}>{order.orderNum}</div>
        </div>
        <div
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 10,
            background:
              order.status === 'shipped'
                ? '#e8f5e9'
                : order.status === 'cancelled'
                ? '#fce4ec'
                : '#fff8e1',
            color:
              order.status === 'shipped'
                ? '#2e7d32'
                : order.status === 'cancelled'
                ? '#c62828'
                : '#f57f17',
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          {order.status.replace('_', ' ')}
        </div>
      </div>

      {/* Items */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>
          Items ({order.itemCount})
        </div>
        <div className={styles.panelItemList}>
          {order.items.map((item) => (
            <div key={item.id} className={styles.panelItem}>
              <div>
                <div>{item.name}</div>
                <div className={styles.panelItemSku}>{item.sku}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                <div>× {item.quantity}</div>
                <div style={{ color: '#aaa', fontSize: 11 }}>
                  {formatWeight(item.weightOz * item.quantity)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Weight & Dimensions */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>Package</div>
        <div className={styles.panelRow}>
          <span className={styles.panelLabel}>Total Weight</span>
          <span className={styles.panelValue}>{formatWeight(order.weightOz)}</span>
        </div>
        <div className={styles.panelRow}>
          <span className={styles.panelLabel}>Dimensions</span>
          <span className={styles.panelValue}>
            {order.dimensions.lengthIn}" × {order.dimensions.widthIn}" × {order.dimensions.heightIn}"
          </span>
        </div>
      </div>

      {/* Ship To */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>Ship To</div>
        <div
          style={{ fontSize: 13, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-line' }}
        >
          {addressStr}
        </div>
        {order.shipTo.residential && (
          <div
            style={{
              fontSize: 11,
              color: '#888',
              marginTop: 4,
            }}
          >
            🏠 Residential address
          </div>
        )}
      </div>

      {/* Rates */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>Rates</div>
        <div className={styles.panelRatesPlaceholder}>
          {order.baseRate > 0 ? (
            <>
              <div style={{ marginBottom: 4, fontWeight: 600, color: '#555' }}>
                Base Rate: ${order.baseRate.toFixed(2)}
              </div>
              <div style={{ fontSize: 12 }}>Fetch rates from ShipStation</div>
            </>
          ) : (
            'Fetch rates from ShipStation'
          )}
        </div>
      </div>

      {/* Label (if shipped) */}
      {order.label && (
        <div className={styles.panelSection}>
          <div className={styles.panelSectionTitle}>Label</div>
          <div className={styles.panelTrackingBadge}>
            ✓ Tracking: {order.label.trackingNumber}
          </div>
          <div className={styles.panelRow} style={{ marginTop: 6 }}>
            <span className={styles.panelLabel}>Carrier</span>
            <span className={styles.panelValue}>{order.label.v2CarrierCode}</span>
          </div>
          <div className={styles.panelRow}>
            <span className={styles.panelLabel}>Service</span>
            <span className={styles.panelValue}>
              {order.label.serviceCode.replace(/_/g, ' ')}
            </span>
          </div>
          <div className={styles.panelRow}>
            <span className={styles.panelLabel}>Shipment Cost</span>
            <span className={styles.panelValue}>
              ${order.label.shipmentCost.toFixed(2)}
            </span>
          </div>
          {order.label.voided && (
            <div style={{ fontSize: 12, color: '#e53935', marginTop: 4 }}>
              ⚠ Label voided
            </div>
          )}
        </div>
      )}

      {/* Billing */}
      {order.billing && (
        <div className={styles.panelSection}>
          <div className={styles.panelSectionTitle}>Billing</div>
          <div className={styles.panelBillingBreakdown}>
            {order.billing.breakdown}
          </div>
          <div className={styles.panelRow} style={{ marginTop: 6 }}>
            <span className={styles.panelLabel}>Total</span>
            <span
              className={styles.panelValue}
              style={{ fontWeight: 700, color: '#222' }}
            >
              ${order.billing.totalCost.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.panelActions}>
        <button disabled title="API integration pending">
          Fetch Rates
        </button>
        <button className={styles.primaryBtn} disabled title="API integration pending">
          Create Label
        </button>
      </div>
    </div>
  );
};

export default ShippingPanel;
