/**
 * @file BatchPanel.tsx
 * @description Multi-order selection panel (2+ orders checked).
 * Shows summary: X orders, Y items, $Z total + selected order numbers.
 * Batch action features are placeholders for future implementation.
 */

import React from 'react';
import { useOrdersStore } from '../../stores/ordersStore';
import type { OrderId } from '../../types/orders';
import styles from '../../styles/AwaitingShipments.module.scss';

interface BatchPanelProps {
  orderIds: OrderId[];
}

const BatchPanel: React.FC<BatchPanelProps> = ({ orderIds }) => {
  const allOrders = useOrdersStore((s) => s.allOrders);

  const selectedOrders = allOrders.filter((o) => orderIds.includes(o.id));
  const totalItems = selectedOrders.reduce((sum, o) => sum + o.itemCount, 0);
  const totalBaseRate = selectedOrders.reduce((sum, o) => sum + o.baseRate, 0);

  return (
    <div className={styles.batchPanel}>
      {/* Summary card */}
      <div className={styles.batchSummary}>
        <div className={styles.batchSummaryTitle}>
          {orderIds.length} Orders Selected
        </div>
        <div className={styles.batchSummaryMeta}>
          {totalItems} item{totalItems !== 1 ? 's' : ''} total
        </div>
        <div className={styles.batchSummaryMeta}>
          Est. base rates: ${totalBaseRate.toFixed(2)}
        </div>
      </div>

      {/* Order list */}
      <div className={styles.panelSection}>
        <div className={styles.panelSectionTitle}>Selected Orders</div>
        <div className={styles.batchOrderList}>
          {selectedOrders.map((order) => (
            <div key={order.id} className={styles.batchOrderItem}>
              <span style={{ fontWeight: 500 }}>{order.orderNum}</span>
              <span style={{ color: '#999', marginLeft: 8 }}>{order.customer}</span>
            </div>
          ))}
          {selectedOrders.length === 0 && (
            <div style={{ color: '#bbb', fontSize: 12 }}>No matching orders found.</div>
          )}
        </div>
      </div>

      {/* Placeholder for batch actions */}
      <div className={styles.batchPlaceholder}>
        🚀 Batch features coming soon
        <div style={{ marginTop: 6, fontSize: 12 }}>
          Batch label creation, bulk export, and more.
        </div>
      </div>
    </div>
  );
};

export default BatchPanel;
