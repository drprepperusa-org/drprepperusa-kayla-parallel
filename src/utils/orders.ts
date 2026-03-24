/**
 * Order utility functions — ported from prepship-v3
 */

import type { OrderDTO, OrderDimensions } from '../types/orders';

export function ageHours(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
}

export function ageColor(createdAt: string): 'red' | 'orange' | 'green' {
  const hours = ageHours(createdAt);
  if (hours > 48) return 'red';
  if (hours > 24) return 'orange';
  return 'green';
}

export function ageDisplay(createdAt: string): string {
  const hours = Math.floor(ageHours(createdAt));
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function isResidential(order: OrderDTO): boolean {
  if (typeof order.residential === 'boolean') return order.residential;
  if (order.sourceResidential) return true;
  return !order.shipTo?.company;
}

export function getPrimarySku(order: OrderDTO): string {
  const items = order.items ?? [];
  if (items.length === 0) return '';
  const skuCounts = new Map<string, number>();
  for (const item of items) {
    if (item.adjustment) continue;
    skuCounts.set(item.sku, (skuCounts.get(item.sku) ?? 0) + item.quantity);
  }
  let maxSku = '';
  let maxQty = 0;
  for (const [sku, qty] of skuCounts) {
    if (qty > maxQty) { maxSku = sku; maxQty = qty; }
  }
  return maxSku;
}

export function getTotalQty(order: OrderDTO): number {
  return (order.items ?? []).reduce((sum, item) => sum + (item.quantity ?? 1), 0);
}

export function getOrderWeight(order: OrderDTO): number {
  const weight = order._enrichedWeight || order.weight;
  return weight?.value ?? 0;
}

export function getOrderDimensions(order: OrderDTO): OrderDimensions | null {
  const dims = order._enrichedDims || order.dimensions;
  if (!dims || dims.length <= 0 || dims.width <= 0 || dims.height <= 0) return null;
  return dims;
}

export function getOrderZip(order: OrderDTO): string {
  return (order.shipTo?.postalCode || '').replace(/\D/g, '').slice(0, 5);
}

export function fmtWeight(ounces: number): string {
  if (ounces < 16) return `${ounces.toFixed(1)}oz`;
  return `${(ounces / 16).toFixed(2)}lbs`;
}

export function fmtDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function fmtCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '-';
  return `$${amount.toFixed(2)}`;
}
