/**
 * @file orderFilters.ts
 * @description Pure utility functions for order filtering, date range calculation,
 * order merging, and validation.
 *
 * All functions here are pure (no side effects, no store access).
 * They can be unit-tested without any store setup.
 */

import type {
  Order,
  OrderId,
  OrderLabel,
  FilterState,
  DateFilter,
} from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// DateRange
// ─────────────────────────────────────────────────────────────────────────────

/** Resolved date range with explicit start and end bounds. */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Resolve a DateFilter into an explicit { start, end } DateRange.
 *
 * Preset filters are computed relative to the current wall-clock time.
 * Custom ranges are passed through unchanged.
 *
 * Notes:
 * - "today" means the full calendar day: 00:00:00.000 → 23:59:59.999
 * - "last-7-days" = today + previous 6 days (7 calendar days inclusive)
 * - All presets end at 23:59:59.999 of today
 *
 * @param filter - A DateFilter preset string or a custom { start, end } object
 * @returns Resolved DateRange with concrete Date objects
 */
export function getDateRange(filter: DateFilter): DateRange {
  // Custom range — pass through as-is
  if (typeof filter === 'object') {
    return filter;
  }

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0, 0, 0, 0,
  );
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 59, 59, 999,
  );

  switch (filter) {
    case 'today':
      return { start: startOfToday, end: endOfToday };

    case 'yesterday': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      const end = new Date(endOfToday);
      end.setDate(end.getDate() - 1);
      return { start, end };
    }

    case 'last-7-days': {
      // 6 days ago + today = 7 days inclusive
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }

    case 'last-14-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 13);
      return { start, end: endOfToday };
    }

    case 'last-30-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }

    case 'last-90-days': {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 89);
      return { start, end: endOfToday };
    }

    default: {
      // TypeScript exhaustiveness guard
      const _exhaustive: never = filter;
      throw new Error(`[orderFilters] Unknown DateFilter: ${String(_exhaustive)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// filterOrders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply search + SKU + date filters to an array of orders.
 *
 * Does NOT apply status filtering — status is a separate concern handled
 * by `getFilteredOrdersByStatus` in the store selector.
 *
 * All active filters are AND-stacked: every active filter must match.
 *
 * Search fields (case-insensitive substring):
 * - customer name
 * - order number
 * - client ID
 * - shipTo postalCode
 * - all itemNames
 * - all skus
 *
 * @param orders - Full order array (typically allOrders from the store)
 * @param filters - Current FilterState from the store
 * @returns Filtered array — new array reference, originals unchanged
 */
export function filterOrders(orders: Order[], filters: FilterState): Order[] {
  let result = orders;

  // ── Search filter ─────────────────────────────────────────────────────────
  const trimmed = filters.search.trim();
  if (trimmed !== '') {
    const term = trimmed.toLowerCase();
    result = result.filter((order) => {
      const searchTarget = [
        order.customer,
        order.orderNum,
        order.clientId,
        order.shipTo.postalCode,
        ...order.itemNames,
        ...order.skus,
      ]
        .join(' ')
        .toLowerCase();
      return searchTarget.includes(term);
    });
  }

  // ── SKU filter — exact match ──────────────────────────────────────────────
  if (filters.skuId !== null) {
    const targetSku = filters.skuId; // Narrow: string | null → string
    result = result.filter((order) => order.skus.includes(targetSku));
  }

  // ── Date filter — uses orderDate, not createdAt ───────────────────────────
  const range = getDateRange(filters.dateRange);
  result = result.filter(
    (order) => order.orderDate >= range.start && order.orderDate <= range.end,
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// mergeOrders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merge incoming orders from an incremental sync into the existing store.
 *
 * Strategy: upsert by `id` — update if exists, append if new.
 *
 * Preservation rule: local-only fields (`label`, `billing`) that the API
 * doesn't return are preserved from the existing order when doing an update.
 * This prevents sync from erasing a label that was created in this session.
 *
 * @param existing - Current allOrders array from the store
 * @param incoming - New orders from the sync response
 * @returns New array with all orders merged — existing order map rebuilt
 *
 * @example
 * // 100 existing orders, sync returns 95 unchanged + 5 updated
 * const merged = mergeOrders(state.allOrders, syncResponse);
 * // merged.length >= 100; updated orders have fresh API fields;
 * // labels and billing on existing orders are preserved
 */
export function mergeOrders(existing: Order[], incoming: Order[]): Order[] {
  const existingMap = new Map<OrderId, Order>(
    existing.map((o) => [o.id, o]),
  );

  for (const newOrder of incoming) {
    const current = existingMap.get(newOrder.id);
    if (current) {
      // Upsert: spread new order fields, preserve local-only fields
      existingMap.set(newOrder.id, {
        ...newOrder,
        label: current.label ?? newOrder.label,
        billing: current.billing ?? newOrder.billing,
      });
    } else {
      existingMap.set(newOrder.id, newOrder);
    }
  }

  return Array.from(existingMap.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// validateOrder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a raw order object from the API before storing.
 *
 * Call this at the API boundary — never trust raw API data.
 * Returns an array of error strings — empty array means valid.
 *
 * @param raw - Unknown value from API response
 * @returns Array of validation error strings (empty = valid)
 */
export function validateOrder(raw: unknown): string[] {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return ['Order is not an object'];
  }

  const o = raw as Record<string, unknown>;

  if (!o['id'] || typeof o['id'] !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!o['orderNum'] || typeof o['orderNum'] !== 'string') {
    errors.push('Missing orderNum');
  }
  if (typeof o['orderId'] !== 'number') {
    errors.push('Missing or invalid orderId (must be number)');
  }
  if (!o['clientId'] || typeof o['clientId'] !== 'string') {
    errors.push('Missing clientId');
  }
  if (!Array.isArray(o['items'])) {
    errors.push('Missing items array');
  }
  if (
    !['awaiting_shipment', 'shipped', 'cancelled'].includes(
      o['status'] as string,
    )
  ) {
    errors.push(`Invalid status: ${String(o['status'])}`);
  }
  if (typeof o['weightOz'] !== 'number' || (o['weightOz'] as number) < 0) {
    errors.push('Invalid weightOz (must be non-negative number)');
  }
  if (!o['orderDate'] || !(o['orderDate'] instanceof Date)) {
    errors.push('Missing or invalid orderDate (must be Date object)');
  }
  if (!o['customer'] || typeof o['customer'] !== 'string') {
    errors.push('Missing customer');
  }
  if (
    !o['shipTo'] ||
    typeof o['shipTo'] !== 'object' ||
    !('postalCode' in (o['shipTo'] as object))
  ) {
    errors.push('Missing or invalid shipTo address');
  }
  if (typeof o['itemCount'] !== 'number' || (o['itemCount'] as number) < 0) {
    errors.push('Missing or invalid itemCount');
  }
  if (!Array.isArray(o['itemNames'])) {
    errors.push('Missing itemNames array');
  }
  if (!Array.isArray(o['skus'])) {
    errors.push('Missing skus array');
  }

  return errors;
}

/**
 * Type guard: confirms an unknown value is a structurally valid Order.
 *
 * @param raw - Unknown value to test
 * @returns true if raw passes all validateOrder checks
 */
export function isValidOrder(raw: unknown): raw is Order {
  return validateOrder(raw).length === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateOrderLabel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an OrderLabel before attaching it to an order.
 *
 * Enforces the immutable label contract — only accept labels with
 * all required fields present and correct types.
 *
 * @param raw - Unknown value from label creation response
 * @returns Array of validation error strings (empty = valid)
 */
export function validateOrderLabel(raw: unknown): string[] {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return ['Label is not an object'];
  }

  const l = raw as Record<string, unknown>;

  if (!l['trackingNumber'] || typeof l['trackingNumber'] !== 'string') {
    errors.push('Missing trackingNumber');
  }
  if (
    typeof l['shipmentCost'] !== 'number' ||
    (l['shipmentCost'] as number) < 0
  ) {
    errors.push('Invalid shipmentCost (must be non-negative number)');
  }
  if (!l['v2CarrierCode'] || typeof l['v2CarrierCode'] !== 'string') {
    errors.push('Missing v2CarrierCode');
  }
  if (!l['serviceCode'] || typeof l['serviceCode'] !== 'string') {
    errors.push('Missing serviceCode');
  }
  if (!l['v1CarrierCode'] || typeof l['v1CarrierCode'] !== 'string') {
    errors.push('Missing v1CarrierCode');
  }
  if (typeof l['v1ShippingProviderId'] !== 'number') {
    errors.push(
      'Missing or invalid v1ShippingProviderId (must be number)',
    );
  }
  if (!l['createdAt'] || !(l['createdAt'] instanceof Date)) {
    errors.push('Missing or invalid createdAt (must be Date)');
  }
  if (typeof l['voided'] !== 'boolean') {
    errors.push('Missing voided field (must be boolean)');
  }

  return errors;
}

/**
 * Type guard: confirms an unknown value is a valid OrderLabel.
 *
 * @param raw - Unknown value to test
 * @returns true if raw passes all validateOrderLabel checks
 */
export function isValidOrderLabel(raw: unknown): raw is OrderLabel {
  return validateOrderLabel(raw).length === 0;
}
