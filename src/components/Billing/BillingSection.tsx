/**
 * BillingSection.tsx — Billing page (Phase 3 Week 2).
 *
 * Q7 (DJ, LOCKED): "The billing should show only in the billing section,
 * nowhere else." / "Show only for orders with status == 'shipped'."
 *
 * Features:
 *  - Table: Order #, Customer, Shipping Cost, Prep Cost, Package Cost,
 *           Total, Voided badge, Last Calculated
 *  - Filters: date range, customer (text), store, voided status
 *  - Sort: date, customer, total (ascending/descending)
 *  - Per-order Recalculate button (blocked on voided orders)
 *  - Bulk "Recalculate All" button
 *  - Export CSV
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useBillingStore } from '../../stores/billingStore';
import { useOrdersStore } from '../../stores/ordersStore';
import { useStoresStore } from '../../stores/storesStore';
import { VoidedBadge } from './VoidedBadge';
import type { BillingCalculation } from '../../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SortField = 'date' | 'customer' | 'total';
type SortDir = 'asc' | 'desc';

type VoidedFilter = 'all' | 'active' | 'voided';

interface BillingRow {
  orderId: string;
  orderNum: string;
  customer: string;
  storeId?: number;
  storeName: string;
  orderDate: Date;
  billing: BillingCalculation;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Escape a CSV field value. */
function csvField(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─────────────────────────────────────────────────────────────────────────────
// BillingSection component
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingSection(): React.ReactElement {
  const { billings, recalculateBilling, settings } = useBillingStore();
  const { allOrders } = useOrdersStore();
  const { stores } = useStoresStore();

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [dateStart, setDateStart] = useState<string>('');
  const [dateEnd, setDateEnd] = useState<string>('');
  const [customerFilter, setCustomerFilter] = useState<string>('');
  const [storeFilter, setStoreFilter] = useState<string>('');
  const [voidedFilter, setVoidedFilter] = useState<VoidedFilter>('all');

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Store map ─────────────────────────────────────────────────────────────
  const storeMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of stores) {
      for (const sid of s.storeIds) map.set(sid, s.name);
    }
    return map;
  }, [stores]);

  // ── Build rows from allOrders × billings ────────────────────────────────
  // Q7: "Show only for orders with status == 'shipped'"
  const rows: BillingRow[] = useMemo(() => {
    return allOrders
      .filter((o) => o.status === 'shipped' && billings[o.id] !== undefined)
      .map((o) => ({
        orderId: o.id,
        orderNum: o.orderNum,
        customer: o.customer,
        storeId: o.storeId,
        storeName: o.storeId ? (storeMap.get(o.storeId) ?? `Store ${o.storeId}`) : '—',
        orderDate: o.orderDate,
        billing: billings[o.id],
      }));
  }, [allOrders, billings, storeMap]);

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (dateStart) {
        const start = new Date(dateStart);
        if (row.orderDate < start) return false;
      }
      if (dateEnd) {
        const end = new Date(dateEnd);
        end.setHours(23, 59, 59, 999);
        if (row.orderDate > end) return false;
      }
      if (customerFilter.trim()) {
        const q = customerFilter.trim().toLowerCase();
        if (!row.customer.toLowerCase().includes(q)) return false;
      }
      if (storeFilter) {
        if (String(row.storeId) !== storeFilter) return false;
      }
      if (voidedFilter === 'active' && row.billing.voided) return false;
      if (voidedFilter === 'voided' && !row.billing.voided) return false;
      return true;
    });
  }, [rows, dateStart, dateEnd, customerFilter, storeFilter, voidedFilter]);

  // ── Apply sort ────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = a.orderDate.getTime() - b.orderDate.getTime();
          break;
        case 'customer':
          cmp = a.customer.localeCompare(b.customer);
          break;
        case 'total':
          cmp = a.billing.totalCost - b.billing.totalCost;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortField, sortDir]);

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  // ── Per-order recalculate ──────────────────────────────────────────────────
  const handleRecalculate = useCallback((row: BillingRow) => {
    const order = allOrders.find((o) => o.id === row.orderId);
    if (!order) return;

    // Q7: Use label shipment cost (NOT fetched rates)
    const shippingCost = order.label?.shipmentCost ?? row.billing.shippingCost;

    recalculateBilling({
      orderId: row.orderId,
      shippingCost,
      weightOz: order.weightOz,
      carrierMarkupPercent: row.billing.carrierMarkupPercent,
      customer: order.customer,
      orderDate: order.orderDate,
      storeId: order.storeId,
    });
  }, [allOrders, recalculateBilling]);

  // ── Bulk recalculate all (non-voided) ─────────────────────────────────────
  const handleRecalculateAll = useCallback(() => {
    for (const row of sorted) {
      if (!row.billing.voided) {
        handleRecalculate(row);
      }
    }
  }, [sorted, handleRecalculate]);

  // ── Export CSV ────────────────────────────────────────────────────────────
  const handleExportCsv = useCallback(() => {
    const headers = [
      'Order #', 'Customer', 'Store', 'Order Date',
      'Shipping Cost', 'Prep Cost', 'Package Cost', 'Total',
      'Voided', 'Last Calculated',
    ];

    const lines: string[] = [headers.map(csvField).join(',')];
    for (const row of sorted) {
      lines.push([
        csvField(row.orderNum),
        csvField(row.customer),
        csvField(row.storeName),
        csvField(fmtDate(row.orderDate)),
        csvField(row.billing.shippingCost.toFixed(2)),
        csvField(row.billing.prepCost.toFixed(2)),
        csvField(row.billing.packageCost.toFixed(2)),
        csvField(row.billing.totalCost.toFixed(2)),
        csvField(row.billing.voided ? 'Yes' : 'No'),
        csvField(fmtDateTime(row.billing.calculatedAt)),
      ].join(','));
    }

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted]);

  // ── Sort indicator ────────────────────────────────────────────────────────
  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  // ── Summary stats ──────────────────────────────────────────────────────────
  const activeRows = sorted.filter((r) => !r.billing.voided);
  const totalRevenue = activeRows.reduce((sum, r) => sum + r.billing.totalCost, 0);
  const totalShipping = activeRows.reduce((sum, r) => sum + r.billing.shippingCost, 0);

  return (
    <div style={{ padding: '16px 24px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Billing</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#666' }}>
            Shipped orders · {sorted.length} records · Prep: {fmtCurrency(settings.prepCost)}/order · Pkg: {fmtCurrency(settings.packageCostPerOz)}/oz
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="bulk-recalculate-btn"
            onClick={handleRecalculateAll}
            style={actionBtnStyle}
          >
            🔄 Recalculate All
          </button>
          <button
            data-testid="export-csv-btn"
            onClick={handleExportCsv}
            style={actionBtnStyle}
          >
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <StatCard label="Active Records" value={String(activeRows.length)} />
        <StatCard label="Total Billing" value={fmtCurrency(totalRevenue)} />
        <StatCard label="Total Shipping" value={fmtCurrency(totalShipping)} />
        <StatCard label="Voided" value={String(sorted.length - activeRows.length)} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={filterLabelStyle}>
          From
          <input
            type="date"
            data-testid="filter-date-start"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={filterLabelStyle}>
          To
          <input
            type="date"
            data-testid="filter-date-end"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={filterLabelStyle}>
          Customer
          <input
            type="text"
            data-testid="filter-customer"
            placeholder="Search customer…"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={filterLabelStyle}>
          Store
          <select
            data-testid="filter-store"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">All stores</option>
            {[...storeMap.entries()].map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          Status
          <select
            data-testid="filter-voided"
            value={voidedFilter}
            onChange={(e) => setVoidedFilter(e.target.value as VoidedFilter)}
            style={inputStyle}
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="voided">Voided only</option>
          </select>
        </label>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>
          No billing records found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <Th>Order #</Th>
                <Th>Customer</Th>
                <Th>Store</Th>
                <SortTh field="date" current={sortField} dir={sortDir} onClick={handleSort}>
                  Date{sortIndicator('date')}
                </SortTh>
                <Th>Shipping</Th>
                <Th>Prep</Th>
                <Th>Package</Th>
                <SortTh field="total" current={sortField} dir={sortDir} onClick={handleSort}>
                  Total{sortIndicator('total')}
                </SortTh>
                <Th>Status</Th>
                <Th>Last Calculated</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.orderId}
                  data-testid={`billing-row-${row.orderId}`}
                  style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: row.billing.voided ? '#fafafa' : 'white',
                    opacity: row.billing.voided ? 0.7 : 1,
                  }}
                >
                  <Td>{row.orderNum}</Td>
                  <Td>{row.customer}</Td>
                  <Td>{row.storeName}</Td>
                  <Td>{fmtDate(row.orderDate)}</Td>
                  <Td>{fmtCurrency(row.billing.shippingCost)}</Td>
                  <Td>{fmtCurrency(row.billing.prepCost)}</Td>
                  <Td>{fmtCurrency(row.billing.packageCost)}</Td>
                  <Td style={{ fontWeight: 600 }}>{fmtCurrency(row.billing.totalCost)}</Td>
                  <Td>
                    {row.billing.voided
                      ? <VoidedBadge voidedAt={row.billing.voidedAt} />
                      : <span style={{ color: '#4caf50', fontWeight: 500 }}>Active</span>
                    }
                  </Td>
                  <Td style={{ color: '#888', fontSize: '0.8rem' }}>
                    {fmtDateTime(row.billing.calculatedAt)}
                  </Td>
                  <Td>
                    {/* Q7: Recalculate button — blocked on voided orders */}
                    <button
                      data-testid={`recalculate-btn-${row.orderId}`}
                      onClick={() => handleRecalculate(row)}
                      disabled={row.billing.voided}
                      title={row.billing.voided ? 'Cannot recalculate a voided record' : 'Recalculate billing'}
                      style={{
                        ...recalcBtnStyle,
                        opacity: row.billing.voided ? 0.4 : 1,
                        cursor: row.billing.voided ? 'not-allowed' : 'pointer',
                      }}
                    >
                      🔄
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small layout helpers (inline styles to keep self-contained, no .scss file)
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{
      padding: '8px 16px',
      borderRadius: 6,
      border: '1px solid #e0e0e0',
      backgroundColor: '#fafafa',
      minWidth: 120,
    }}>
      <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', ...style }}>
      {children}
    </th>
  );
}

interface SortThProps {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onClick: (field: SortField) => void;
  children: React.ReactNode;
}

function SortTh({ field, onClick, children }: SortThProps): React.ReactElement {
  return (
    <th
      onClick={() => onClick(field)}
      style={{
        padding: '8px 12px',
        textAlign: 'left',
        fontSize: '0.8rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return (
    <td style={{ padding: '8px 12px', fontSize: '0.875rem', verticalAlign: 'middle', ...style }}>
      {children}
    </td>
  );
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.875rem',
  border: '1px solid #e0e0e0',
  borderRadius: 6,
};

const actionBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid #ddd',
  backgroundColor: 'white',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
};

const recalcBtnStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid #ddd',
  backgroundColor: 'white',
  fontSize: '0.8rem',
};

const filterLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: '0.8rem',
  color: '#555',
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #ccc',
  fontSize: '0.85rem',
};
