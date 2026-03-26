/**
 * @file RightPanel.tsx
 * @description Persistent right-side panel. Always visible (400px wide).
 * Switches content based on getPanelState():
 *   'empty'          → placeholder
 *   'shipping-panel' → ShippingPanel (1 order selected)
 *   'batch-panel'    → BatchPanel (2+ orders selected)
 */

import React from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import ShippingPanel from './Shipment/ShippingPanel';
import BatchPanel from './Shipment/BatchPanel';
import styles from '../styles/AwaitingShipments.module.scss';

const RightPanel: React.FC = () => {
  const getPanelState = useOrdersStore((s) => s.getPanelState);
  const panelState = getPanelState();

  if (panelState.type === 'shipping-panel' && panelState.selectedOrderIds.length === 1) {
    return (
      <div className={styles.rightPanelArea}>
        <ShippingPanel orderId={panelState.selectedOrderIds[0]!} />
      </div>
    );
  }

  if (panelState.type === 'batch-panel' && panelState.selectedOrderIds.length >= 2) {
    return (
      <div className={styles.rightPanelArea}>
        <BatchPanel orderIds={panelState.selectedOrderIds} />
      </div>
    );
  }

  // Empty state
  return (
    <div className={styles.rightPanelArea}>
      <div className={styles.rightPanelEmpty}>
        <span className={styles.emptyIcon}>📦</span>
        <span>Select an order to view details</span>
        <span style={{ fontSize: 12, color: '#ccc' }}>
          Click a row or check multiple orders
        </span>
      </div>
    </div>
  );
};

export default RightPanel;
