/**
 * OrdersView — virtualized orders table with inline sub-rows.
 *
 * Column order (exact per DJ screenshots):
 *   ☐ | AGE | CLIENT | ORDER# | RECIPIENT | ITEM/SKU | QTY | WEIGHT | SHIP TO | CARRIER
 *
 * Visual requirements:
 *   1. Color-coded client badges — derived from client name hash (NOT hardcoded)
 *   2. Age badge — green dot <24h, orange 24–48h, red >48h + relative time
 *   3. Multi-item inline sub-rows — always visible for orders with >1 item
 *   4. Carrier badge chip
 *   5. Clickable order number
 *   6. Row states: default / hover / checked / row-clicked
 *   7. Checkbox = batch intent (independent of panel open)
 *      Row click = panel view (independent of checkbox)
 */

import { Fragment, useEffect, useMemo } from 'react';
import { useOrdersStore } from '../../stores/ordersStore';
import { useSync } from '../../hooks/useSync';
import { useStoresStore } from '../../stores/storesStore';
import { useMarkupsStore } from '../../stores/markupsStore';
import { useOrderDetailStore } from '../../stores/orderDetailStore';
import { ALL_COLUMNS } from '../Tables/columnDefs';
import RightPanel from '../RightPanel/RightPanel';
import StatsBar from '../StatsBar/StatsBar';
import SyncIndicator from '../shared/SyncIndicator';
import AgeBadge from './cells/AgeBadge';
import ClientBadge from './cells/ClientBadge';
import CarrierBadge from './cells/CarrierBadge';
import OrderNumberLink from './cells/OrderNumberLink';
import ItemSkuCell from './cells/ItemSkuCell';
import type { OrderDTO, OrderStatus } from '../../types/orders';
import {
  fmtDate, fmtWeight, fmtCurrency,
  getOrderWeight, getOrderZip, getPrimarySku, getTotalQty,
} from '../../utils/orders';
import { applyCarrierMarkup } from '../../utils/markups';
import styles from './OrdersView.module.scss';

// ─── Types & constants ────────────────────────────────────────────────────────

type ZoomLevel = '100%' | '115%' | '125%';

const ZOOM_SCALE: Record<ZoomLevel, number> = {
  '100%': 1,
  '115%': 1.15,
  '125%': 1.25,
};

const ZOOM_LEVELS: ZoomLevel[] = ['100%', '115%', '125%'];

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

const STATUSES: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrdersView() {
  const {
    orders, loading, total, page, pages, currentStatus,
    setStatus, setPage, selectedOrderIds, toggleOrderSelection,
    selectAllOrders, clearSelection, fetchOrders,
    sync,
    zoom, setZoom,
  } = useOrdersStore();

  // React Query-backed sync: wires to backend POST /sync.
  // Falls back gracefully (syncError) if backend is unavailable.
  const { sync: triggerSync, syncing: syncMutating } = useSync();
  const { stores, statusCounts, fetchStores, fetchStatusCounts } = useStoresStore();
  const { markups } = useMarkupsStore();
  const { openDetail, selectedOrderId } = useOrderDetailStore();

  useEffect(() => {
    fetchOrders();
    fetchStores();
    fetchStatusCounts();
  }, [fetchOrders, fetchStores, fetchStatusCounts]);

  // Build storeId → client name map for badge display
  const storeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of stores) {
      for (const sid of s.storeIds) map.set(sid, s.name);
    }
    return map;
  }, [stores]);

  const visibleColumns = ALL_COLUMNS.filter(c => c.defaultVisible);
  const allSelected = orders.length > 0 && orders.every(o => selectedOrderIds.has(o.orderId));
  const selectedCount = selectedOrderIds.size;

  const handleSelectAll = () => {
    if (allSelected) clearSelection();
    else selectAllOrders();
  };

  /** Checkbox click: batch intent — does NOT open panel */
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>, orderId: number) => {
    e.stopPropagation();
    toggleOrderSelection(orderId);
  };

  /** Row click: panel view — independent of checkbox state */
  const handleRowClick = (orderId: number) => {
    void openDetail(orderId);
  };

  const handleSync = () => {
    triggerSync();
  };

  const handleZoom = (level: ZoomLevel) => {
    setZoom(ZOOM_SCALE[level] as 1 | 1.15 | 1.25);
  };

  // Derive active zoom level label from store value
  const activeZoomLabel: ZoomLevel = (() => {
    const z = zoom ?? 1;
    if (z >= 1.25) return '125%';
    if (z >= 1.15) return '115%';
    return '100%';
  })();

  const renderCell = (order: OrderDTO, key: string) => {
    switch (key) {
      case 'select':
        return (
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={selectedOrderIds.has(order.orderId)}
            onChange={(e) => handleCheckboxChange(e, order.orderId)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select order ${order.orderNumber}`}
          />
        );

      case 'age':
        return <AgeBadge createdAt={order.createdAt} />;

      case 'client': {
        const clientName = storeMap.get(order.storeId) ?? `Store ${order.storeId}`;
        return <ClientBadge clientName={clientName} />;
      }

      case 'orderNum':
        return (
          <OrderNumberLink
            orderNumber={order.orderNumber}
            onClick={() => void openDetail(order.orderId)}
          />
        );

      case 'customer':
        return <span className={styles.recipientCell}>{order.shipTo?.name || '—'}</span>;

      case 'itemsku': {
        const items = order.items ?? [];
        const primarySku = getPrimarySku(order);
        if (items.length === 0) return <span className={styles.empty}>—</span>;
        return <ItemSkuCell items={items} primarySku={primarySku} />;
      }

      case 'qty':
        return <span className={styles.qtyCell}>{getTotalQty(order)}</span>;

      case 'weight':
        return <span className={styles.weightCell}>{fmtWeight(getOrderWeight(order))}</span>;

      case 'shipto': {
        const z = getOrderZip(order);
        const st = order.shipTo?.state || '';
        return <span className={styles.shipToCell}>{z ? `${st} ${z}` : st || '—'}</span>;
      }

      case 'carrier':
        return (
          <CarrierBadge
            carrierCode={order.selectedCarrierCode}
            serviceCode={order.selectedServiceCode}
          />
        );

      // ── Non-default columns ──────────────────────────────────────────────
      case 'date':
        return fmtDate(order.createdAt);

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

      default:
        return '—';
    }
  };

  return (
    <div className={styles.ordersLayout}>
      {/* LEFT: table area */}
      <div className={styles.container}>
        {/* ── Section 5: Header / Toolbar ──────────────────────────────── */}
        <div className={styles.toolbar}>
          {/* Left: current status title */}
          <div className={styles.toolbarLeft}>
            <h2 className={styles.statusTitle}>{STATUS_LABELS[currentStatus]}</h2>

            {/* Status tabs for switching */}
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

          {/* Right: context-sensitive tools */}
          <div className={styles.toolbarRight}>
            {selectedCount > 0 ? (
              /* ── Selection mode toolbar ── */
              <>
                <span className={styles.selectionPill}>
                  {selectedCount} {selectedCount === 1 ? 'order' : 'orders'} selected
                  <button
                    className={styles.selectionClear}
                    onClick={clearSelection}
                    aria-label="Clear selection"
                  >
                    ×
                  </button>
                </span>
                <button className={styles.toolbarBtn}>Batch ▼</button>
                <button className={styles.toolbarBtn}>Print ▼</button>
              </>
            ) : (
              /* ── Default toolbar ── */
              <>
                <SyncIndicator
                  syncing={sync.syncing}
                  lastSyncTime={sync.lastSyncTime}
                  variant="full"
                />
                <button
                  className={styles.toolbarBtn}
                  onClick={handleSync}
                  disabled={sync.syncing || syncMutating}
                  title="Sync orders now"
                >
                  ↻ Sync
                </button>
                <button className={styles.toolbarBtn}>Export CSV</button>
                <button className={styles.toolbarBtn}>Columns ▼</button>
                <button className={styles.toolbarBtn}>Labels</button>
                <button className={styles.toolbarBtn}>Print Queue</button>
              </>
            )}

            {/* Zoom selector — always visible */}
            <div className={styles.zoomSelector} role="group" aria-label="Zoom level">
              {ZOOM_LEVELS.map((level) => (
                <button
                  key={level}
                  className={`${styles.zoomBtn} ${activeZoomLabel === level ? styles.zoomActive : ''}`}
                  onClick={() => handleZoom(level)}
                  aria-pressed={activeZoomLabel === level}
                >
                  {level}
                </button>
              ))}
            </div>

            {selectedCount === 0 && (
              <button className={styles.toolbarBtn}>Picklist</button>
            )}
          </div>
        </div>

        {/* ── Section 2: Stats Bar ─────────────────────────────────────── */}
        <StatsBar />

        {/* Table */}
        <div
          className={styles.tableWrapper}
          style={{ fontSize: `${(zoom ?? 1) * 14}px` }}
        >
          {loading ? (
            <div className={styles.loading}>Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className={styles.emptyState}>No orders found</div>
          ) : (
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
                          aria-label="Select all orders"
                        />
                      ) : (
                        col.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const items = (order.items ?? []).filter(i => !i.adjustment);
                  const hasMultiItems = items.length > 1;
                  const isChecked = selectedOrderIds.has(order.orderId);
                  const isPanelOpen = selectedOrderId === order.orderId;

                  return (
                    <Fragment key={order.orderId}>
                      {/* Primary row */}
                      <tr
                        className={[
                          styles.tr,
                          isChecked ? styles.checked : '',
                          isPanelOpen ? styles.rowClicked : '',
                          styles.clickableRow,
                        ].filter(Boolean).join(' ')}
                        onClick={() => handleRowClick(order.orderId)}
                        aria-selected={isChecked}
                      >
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className={[
                              styles.td,
                              col.key === 'select' ? styles.tdCheckbox : '',
                              hasMultiItems ? styles.tdHasSubRows : '',
                            ].filter(Boolean).join(' ')}
                            style={{ width: col.width, maxWidth: col.width + 40 }}
                          >
                            {renderCell(order, col.key)}
                          </td>
                        ))}
                      </tr>

                      {/* Multi-item inline sub-rows — always visible for >1 items */}
                      {hasMultiItems && items.map((item, idx) => (
                        <tr
                          key={`${order.orderId}-item-${idx}`}
                          className={[
                            styles.subRow,
                            isChecked ? styles.checked : '',
                            isPanelOpen ? styles.rowClicked : '',
                          ].filter(Boolean).join(' ')}
                          onClick={() => handleRowClick(order.orderId)}
                          aria-hidden="true"
                        >
                          <td
                            className={styles.td}
                            colSpan={visibleColumns.length}
                          >
                            <div className={styles.subRowContent}>
                              <span className={styles.subRowIndent} aria-hidden="true">└</span>
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name ?? item.sku}
                                  className={styles.itemThumb}
                                />
                              ) : (
                                <span className={styles.itemThumbPlaceholder} aria-hidden="true">📦</span>
                              )}
                              <span className={styles.subRowSku}>{item.sku}</span>
                              <span className={styles.subRowSep} aria-hidden="true">·</span>
                              <span className={styles.subRowName} title={item.name ?? undefined}>{item.name ?? '—'}</span>
                              <span className={styles.subRowSep} aria-hidden="true">·</span>
                              <span className={styles.subRowQty}>×{item.quantity}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

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

      {/* RIGHT: selection/shipping panel */}
      <RightPanel />
    </div>
  );
}
