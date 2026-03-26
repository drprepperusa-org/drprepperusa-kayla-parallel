/**
 * @file ControlBar.tsx
 * @description Top control row for the AwaitingShipments page.
 *
 * Controls:
 * - Search input (real-time → setSearchFilter)
 * - SKU dropdown (unique SKUs from allOrders with counts)
 * - Date filter dropdown (preset ranges)
 * - Export CSV button
 * - Columns toggle dropdown
 * - Zoom toggle (100% | 115% | 125%)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import { exportToCSV } from '../utils/exportCsv';
import type { ZoomLevel, DateFilter } from '../types/orders';
import { DATE_RANGE_LABELS, DATE_RANGES } from '../utils/orderConstants';
import styles from '../styles/AwaitingShipments.module.scss';

const ZOOM_LEVELS: ZoomLevel[] = [100, 115, 125];

const ControlBar: React.FC = () => {
  // ── Store state ────────────────────────────────────────────────────────────
  const search = useOrdersStore((s) => s.filters.search);
  const skuId = useOrdersStore((s) => s.filters.skuId);
  const dateRange = useOrdersStore((s) => s.filters.dateRange);
  const zoom = useOrdersStore((s) => s.zoom);
  const allOrders = useOrdersStore((s) => s.allOrders);
  const columns = useOrdersStore((s) => s.columns.columns);
  const visibleColumns = useOrdersStore((s) => s.columns.visibleColumns);

  const setSearchFilter = useOrdersStore((s) => s.setSearchFilter);
  const setSkuFilter = useOrdersStore((s) => s.setSkuFilter);
  const setDateFilter = useOrdersStore((s) => s.setDateFilter);
  const setZoom = useOrdersStore((s) => s.setZoom);
  const toggleColumnVisibility = useOrdersStore((s) => s.toggleColumnVisibility);
  const getFilteredOrdersByStatus = useOrdersStore((s) => s.getFilteredOrdersByStatus);

  // ── Columns dropdown state ─────────────────────────────────────────────────
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!columnsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [columnsOpen]);

  // ── SKU options from allOrders ─────────────────────────────────────────────
  const skuOptions: Array<{ sku: string; count: number }> = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const order of allOrders) {
      for (const sku of order.skus) {
        counts.set(sku, (counts.get(sku) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([sku, count]) => ({ sku, count }));
  }, [allOrders]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const filtered = getFilteredOrdersByStatus();
    exportToCSV(filtered);
  }, [getFilteredOrdersByStatus]);

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setDateFilter(e.target.value as DateFilter);
    },
    [setDateFilter],
  );

  // Resolve dateRange display value (only presets for dropdown)
  const dateRangeValue =
    typeof dateRange === 'string' ? dateRange : 'last-7-days';

  return (
    <div className={styles.controlBar}>
      {/* Search */}
      <input
        type="text"
        className={styles.searchInput}
        placeholder="Search orders, customers, SKUs…"
        value={search}
        onChange={(e) => setSearchFilter(e.target.value)}
        aria-label="Search orders"
      />

      {/* SKU filter */}
      <select
        className={styles.controlSelect}
        value={skuId ?? ''}
        onChange={(e) => setSkuFilter(e.target.value || null)}
        aria-label="Filter by SKU"
      >
        <option value="">All SKUs</option>
        {skuOptions.map(({ sku, count }) => (
          <option key={sku} value={sku}>
            {sku} ({count})
          </option>
        ))}
      </select>

      {/* Date filter */}
      <select
        className={styles.controlSelect}
        value={dateRangeValue}
        onChange={handleDateChange}
        aria-label="Date range filter"
      >
        {DATE_RANGES.map((range) => (
          <option key={range} value={range}>
            {DATE_RANGE_LABELS[range]}
          </option>
        ))}
      </select>

      {/* Export CSV */}
      <button
        className={styles.controlButton}
        onClick={handleExport}
        title="Export visible orders to CSV"
      >
        ⬇ Export CSV
      </button>

      {/* Spacer */}
      <div className={styles.controlSpacer} />

      {/* Columns toggle */}
      <div className={styles.columnsDropdown} ref={columnsRef}>
        <button
          className={styles.controlButton}
          onClick={() => setColumnsOpen((prev) => !prev)}
          aria-haspopup="true"
          aria-expanded={columnsOpen}
        >
          ⚙ Columns
        </button>
        {columnsOpen && (
          <div className={styles.columnsMenu} role="menu">
            {columns.map((col) => {
              // skip 'select' — always visible
              if (col.key === 'select') return null;
              return (
                <label key={col.key} className={styles.columnMenuItem} role="menuitem">
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(col.key)}
                    onChange={() => toggleColumnVisibility(col.key)}
                  />
                  {col.label || col.key}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Zoom toggle */}
      <div className={styles.zoomGroup} role="group" aria-label="Table zoom level">
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level}
            className={[
              styles.zoomButton,
              zoom === level ? styles.zoomButtonActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setZoom(level)}
            aria-pressed={zoom === level}
            aria-label={`Zoom ${level}%`}
          >
            {level}%
          </button>
        ))}
      </div>
    </div>
  );
};

export default ControlBar;
