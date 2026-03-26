/**
 * @file AwaitingShipments.tsx
 * @description Main AwaitingShipments page.
 *
 * Layout:
 *   [SelectionBanner (sticky, conditional)]
 *   [Status Tabs]
 *   [ControlBar]
 *   [Body: OrdersTable + RightPanel]
 *   [Pagination]
 *
 * All state lives in useOrdersStore.
 * Mock data is loaded on first mount via setAllOrders.
 * Zoom applies only to the table content area (perimeter elements are fixed).
 */

import React, { useEffect } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { MOCK_ORDERS } from '../data/mockOrders';
import type { OrderStatus } from '../types/orders';
import ControlBar from '../components/ControlBar';
import OrdersTable from '../components/OrdersTable';
import RightPanel from '../components/RightPanel';
import Pagination from '../components/Pagination';
import SelectionBanner from '../components/SelectionBanner';
import styles from '../styles/AwaitingShipments.module.scss';

// ─────────────────────────────────────────────────────────────────────────────
// Tab config
// ─────────────────────────────────────────────────────────────────────────────

interface StatusTab {
  status: OrderStatus;
  label: string;
}

const STATUS_TABS: StatusTab[] = [
  { status: 'awaiting_shipment', label: 'Awaiting Shipment' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'cancelled', label: 'Cancelled' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const AwaitingShipments: React.FC = () => {
  const allOrders = useOrdersStore((s) => s.allOrders);
  const setAllOrders = useOrdersStore((s) => s.setAllOrders);
  const currentStatus = useOrdersStore((s) => s.currentStatus);
  const setStatus = useOrdersStore((s) => s.setStatus);
  const zoom = useOrdersStore((s) => s.zoom);

  // ── Load mock data once on mount ──────────────────────────────────────────
  useEffect(() => {
    if (allOrders.length === 0) {
      setAllOrders(MOCK_ORDERS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Zoom transform for table content only ─────────────────────────────────
  // scale() changes layout — use transform + origin to only scale the data area
  const zoomScale = zoom / 100;
  const zoomStyle: React.CSSProperties =
    zoom !== 100
      ? {
          transform: `scale(${zoomScale})`,
          transformOrigin: 'top left',
          width: `${(1 / zoomScale) * 100}%`,
        }
      : {};

  return (
    <div className={styles.page}>
      {/* Sticky selection banner (2+ checkboxes) */}
      <SelectionBanner />

      {/* Status tabs */}
      <div className={styles.tabs} role="tablist" aria-label="Order status tabs">
        {STATUS_TABS.map(({ status, label }) => (
          <button
            key={status}
            role="tab"
            aria-selected={currentStatus === status}
            className={[
              styles.tab,
              currentStatus === status ? styles.tabActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setStatus(status)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Control bar (perimeter — does NOT zoom) */}
      <div className={styles.header}>
        <ControlBar />
      </div>

      {/* Body: zoomable table + sticky right panel */}
      <div className={styles.body}>
        <div className={styles.tableArea}>
          <div style={zoomStyle}>
            <OrdersTable />
          </div>
        </div>

        {/* Right panel — perimeter-fixed, does NOT zoom */}
        <RightPanel />
      </div>

      {/* Footer: pagination (perimeter — does NOT zoom) */}
      <div className={styles.footer}>
        <Pagination />
      </div>
    </div>
  );
};

export default AwaitingShipments;
