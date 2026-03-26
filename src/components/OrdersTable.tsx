/**
 * @file OrdersTable.tsx
 * @description Full-featured orders data table.
 *
 * Renders 24 columns from useOrdersStore().columns (respecting visibility).
 * Row click → selectRow. Checkbox click → toggleCheckbox.
 * Selected rows are highlighted (row-click = blue, checkbox = yellow).
 * Horizontal scroll on mobile. Currency, date, and weight are formatted.
 */

import React, { useCallback } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import type { Order } from '../types/orders';
import styles from '../styles/AwaitingShipments.module.scss';

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatWeight(oz: number): string {
  if (oz >= 16) {
    const lbs = Math.floor(oz / 16);
    const rem = oz % 16;
    return rem > 0 ? `${lbs}lb ${rem}oz` : `${lbs}lb`;
  }
  return `${oz}oz`;
}

function formatCurrency(val: number): string {
  return `$${val.toFixed(2)}`;
}

function formatAge(orderDate: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - orderDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d';
  return `${diffDays}d`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell renderer — maps column key → cell content for an order
// ─────────────────────────────────────────────────────────────────────────────

function renderCell(order: Order, colKey: string): React.ReactNode {
  switch (colKey) {
    case 'select':
      // Rendered separately (checkbox)
      return null;

    case 'date':
      return formatDate(order.orderDate);

    case 'client':
      return order.clientId;

    case 'orderNum':
      return (
        <span style={{ fontWeight: 500, color: '#1a73e8' }}>{order.orderNum}</span>
      );

    case 'customer':
      return order.customer;

    case 'itemname':
      return order.itemNames.join(', ');

    case 'sku':
      return order.skus.join(', ');

    case 'qty':
      return order.itemCount;

    case 'weight':
      return formatWeight(order.weightOz);

    case 'shipto': {
      const a = order.shipTo;
      return `${a.city}, ${a.state} ${a.postalCode}`;
    }

    case 'carrier':
      return order.label?.v2CarrierCode ?? '—';

    case 'custcarrier':
      // Placeholder: no customer-preferred carrier in current schema
      return '—';

    case 'total':
      return order.billing
        ? formatCurrency(order.billing.totalCost)
        : '—';

    case 'bestrate':
      return order.baseRate > 0 ? formatCurrency(order.baseRate) : '—';

    case 'margin':
      if (order.billing) {
        const margin = order.billing.totalCost - order.billing.baseRate;
        return (
          <span style={{ color: margin >= 0 ? '#2e7d32' : '#c62828' }}>
            {formatCurrency(margin)}
          </span>
        );
      }
      return '—';

    case 'age':
      return formatAge(order.orderDate);

    case 'tracking':
      return order.label?.trackingNumber ? (
        <span style={{ fontSize: 11, color: '#1a73e8' }}>
          {order.label.trackingNumber}
        </span>
      ) : (
        '—'
      );

    case 'labelcreated':
      return order.label?.createdAt ? formatDate(order.label.createdAt) : '—';

    // Debug columns
    case 'test_carrierCode':
      return order.label?.v2CarrierCode ?? '—';
    case 'test_shippingProviderId':
      return order.label?.v1ShippingProviderId?.toString() ?? '—';
    case 'test_clientId':
      return order.clientId;
    case 'test_serviceCode':
      return order.label?.serviceCode ?? '—';
    case 'test_bestRate':
      return formatCurrency(order.baseRate);
    case 'test_orderLocal':
      return order.orderId.toString();

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const OrdersTable: React.FC = () => {
  const getPaginatedOrders = useOrdersStore((s) => s.getPaginatedOrders);
  const columns = useOrdersStore((s) => s.columns.columns);
  const visibleColumns = useOrdersStore((s) => s.columns.visibleColumns);
  const columnOrder = useOrdersStore((s) => s.columns.columnOrder);
  const selection = useOrdersStore((s) => s.selection);
  const toggleCheckbox = useOrdersStore((s) => s.toggleCheckbox);
  const selectRow = useOrdersStore((s) => s.selectRow);

  const orders = getPaginatedOrders();

  // Ordered + visible columns (always show 'select' first)
  const visibleCols = React.useMemo(() => {
    const colMap = new Map(columns.map((c) => [c.key, c]));
    const ordered = columnOrder
      .map((key) => colMap.get(key))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);

    return ordered.filter(
      (col) => col.key === 'select' || visibleColumns.has(col.key),
    );
  }, [columns, columnOrder, visibleColumns]);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, orderId: string) => {
      // Don't trigger row-click when clicking the checkbox cell
      const target = e.target as HTMLElement;
      if (target.closest(`.${styles.tdSelect}`)) return;
      selectRow(orderId);
    },
    [selectRow],
  );

  const handleCheckbox = useCallback(
    (e: React.MouseEvent | React.ChangeEvent, orderId: string) => {
      e.stopPropagation();
      toggleCheckbox(orderId);
    },
    [toggleCheckbox],
  );

  const isRowSelected = useCallback(
    (orderId: string): boolean => {
      return (
        selection.mode === 'row-click' && selection.rowSelectedId === orderId
      );
    },
    [selection],
  );

  const isCheckboxSelected = useCallback(
    (orderId: string): boolean => {
      return selection.checkboxSelectedIds.has(orderId);
    },
    [selection],
  );

  if (orders.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
        <div>No orders match the current filters.</div>
      </div>
    );
  }

  return (
    <table className={styles.table} aria-label="Orders table">
      <thead className={styles.thead}>
        <tr>
          {visibleCols.map((col) =>
            col.key === 'select' ? (
              <th key="select" className={`${styles.th} ${styles.thSelect}`}>
                {/* No select-all for now; per spec checkboxes are individual */}
              </th>
            ) : (
              <th
                key={col.key}
                className={styles.th}
                style={{ width: col.widthPx, minWidth: col.widthPx }}
              >
                {col.label}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const rowSelected = isRowSelected(order.id);
          const checkSelected = isCheckboxSelected(order.id);

          const rowClass = [
            styles.tr,
            rowSelected ? styles.trSelected : '',
            checkSelected ? styles.trCheckboxSelected : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <tr
              key={order.id}
              className={rowClass}
              onClick={(e) => handleRowClick(e, order.id)}
              aria-selected={rowSelected || checkSelected}
            >
              {visibleCols.map((col) => {
                if (col.key === 'select') {
                  return (
                    <td
                      key="select"
                      className={`${styles.td} ${styles.tdSelect}`}
                      onClick={(e) => handleCheckbox(e, order.id)}
                    >
                      <input
                        type="checkbox"
                        checked={checkSelected}
                        onChange={(e) => handleCheckbox(e, order.id)}
                        aria-label={`Select order ${order.orderNum}`}
                        style={{ cursor: 'pointer', accentColor: '#1a73e8' }}
                      />
                    </td>
                  );
                }

                return (
                  <td
                    key={col.key}
                    className={styles.td}
                    style={{ width: col.widthPx, maxWidth: col.widthPx }}
                    title={typeof renderCell(order, col.key) === 'string'
                      ? (renderCell(order, col.key) as string)
                      : undefined}
                  >
                    {renderCell(order, col.key)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default OrdersTable;
