import { useEffect, useMemo } from 'react';
import { useOrdersStore } from '../../stores/ordersStore';
import { useStoresStore } from '../../stores/storesStore';
import { useMarkupsStore } from '../../stores/markupsStore';
import { ALL_COLUMNS } from '../Tables/columnDefs';
import type { OrderDTO, OrderStatus } from '../../types/orders';
import {
  ageColor, ageDisplay, fmtDate, fmtWeight, fmtCurrency,
  getOrderWeight, getOrderZip, getPrimarySku, getTotalQty,
} from '../../utils/orders';
import { applyCarrierMarkup } from '../../utils/markups';
import styles from './OrdersView.module.scss';

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

const STATUSES: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled'];

export default function OrdersView() {
  const {
    orders, loading, total, page, pages, currentStatus,
    setStatus, setPage, selectedOrderIds, toggleOrderSelection,
    selectAllOrders, clearSelection, fetchOrders,
  } = useOrdersStore();
  const { stores, statusCounts, fetchStores, fetchStatusCounts } = useStoresStore();
  const { markups } = useMarkupsStore();

  useEffect(() => {
    fetchOrders();
    fetchStores();
    fetchStatusCounts();
  }, [fetchOrders, fetchStores, fetchStatusCounts]);

  const storeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of stores) {
      for (const sid of s.storeIds) map.set(sid, s.name);
    }
    return map;
  }, [stores]);

  const visibleColumns = ALL_COLUMNS.filter(c => c.defaultVisible);
  const allSelected = orders.length > 0 && orders.every(o => selectedOrderIds.has(o.orderId));

  const handleSelectAll = () => {
    if (allSelected) clearSelection();
    else selectAllOrders();
  };

  const renderCell = (order: OrderDTO, key: string) => {
    switch (key) {
      case 'select':
        return (
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selectedOrderIds.has(order.orderId)}
            onChange={() => toggleOrderSelection(order.orderId)}
          />
        );
      case 'date':
        return fmtDate(order.createdAt);
      case 'client':
        return <span className={styles.storeBadge}>{storeMap.get(order.storeId) || `Store ${order.storeId}`}</span>;
      case 'orderNum':
        return order.orderNumber;
      case 'customer':
        return order.shipTo?.name || '—';
      case 'itemname':
        return order.items?.[0]?.name || '—';
      case 'sku':
        return getPrimarySku(order) || '—';
      case 'qty':
        return getTotalQty(order);
      case 'weight':
        return fmtWeight(getOrderWeight(order));
      case 'shipto': {
        const z = getOrderZip(order);
        const st = order.shipTo?.state || '';
        return z ? `${st} ${z}` : st || '—';
      }
      case 'carrier':
        return order.selectedServiceCode || '—';
      case 'custcarrier':
        return order.selectedCarrierCode?.toUpperCase() || '—';
      case 'total':
        return fmtCurrency(order.orderTotal);
      case 'bestrate':
        if (!order.bestRate) return '—';
        return <span className={styles.rateCell}>{fmtCurrency(applyCarrierMarkup(order.bestRate, markups))}</span>;
      case 'margin': {
        if (!order.orderTotal || !order.bestRate) return '—';
        const cost = applyCarrierMarkup(order.bestRate, markups);
        const margin = order.orderTotal - cost;
        return (
          <span className={margin >= 0 ? styles.marginPositive : styles.marginNegative}>
            {fmtCurrency(margin)}
          </span>
        );
      }
      case 'tracking':
        return order.trackingNumber || '—';
      case 'labelcreated':
        return order.labelCreated ? fmtDate(order.labelCreated) : '—';
      case 'age': {
        const color = ageColor(order.createdAt);
        const cls = color === 'green' ? styles.ageGreen : color === 'orange' ? styles.ageOrange : styles.ageRed;
        return <span className={cls}>{ageDisplay(order.createdAt)}</span>;
      }
      default:
        return '—';
    }
  };

  return (
    <div className={styles.container}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <div className={styles.statusTabs}>
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`${styles.statusTab} ${currentStatus === s ? styles.active : ''}`}
                onClick={() => setStatus(s)}
              >
                {STATUS_LABELS[s]} ({statusCounts[s] || 0})
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolbarRight}>
          {selectedOrderIds.size > 0 && (
            <span>{selectedOrderIds.size} selected</span>
          )}
          <span>{total} orders</span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.loading}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className={styles.empty}>No orders found</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    className={`${styles.th} ${col.sortable ? styles.sortable : ''}`}
                    style={{ width: col.width, minWidth: col.width }}
                  >
                    {col.key === 'select' ? (
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={allSelected}
                        onChange={handleSelectAll}
                      />
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.orderId}
                  className={`${styles.tr} ${selectedOrderIds.has(order.orderId) ? styles.selected : ''}`}
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={styles.td}
                      style={{ width: col.width, maxWidth: col.width + 40 }}
                    >
                      {renderCell(order, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className={styles.pagination}>
          <span>Page {page} of {pages} · {total} orders</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Prev
            </button>
            <button className={styles.pageBtn} disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
