/**
 * @file exportCsv.ts
 * @description CSV export utility for the orders table.
 * Stub implementation — builds a CSV string from filtered orders and triggers download.
 */

import type { Order } from '../types/orders';

/**
 * Convert an array of orders to a CSV string and trigger a browser download.
 * Fields exported: orderNum, customer, status, itemCount, weightOz, baseRate, orderDate
 */
export function exportToCSV(orders: Order[], filename = 'orders-export.csv'): void {
  if (orders.length === 0) {
    console.warn('[exportToCSV] No orders to export.');
    return;
  }

  const headers = [
    'Order #',
    'Customer',
    'Status',
    'Items',
    'Weight (oz)',
    'Base Rate',
    'Order Date',
    'Client',
    'Ship To City',
    'Ship To State',
    'Tracking',
  ];

  const escape = (val: string | number | undefined | null): string => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = orders.map((o) => [
    escape(o.orderNum),
    escape(o.customer),
    escape(o.status),
    escape(o.itemCount),
    escape(o.weightOz),
    escape(o.baseRate.toFixed(2)),
    escape(o.orderDate.toLocaleDateString()),
    escape(o.clientId),
    escape(o.shipTo.city),
    escape(o.shipTo.state),
    escape(o.label?.trackingNumber ?? ''),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
