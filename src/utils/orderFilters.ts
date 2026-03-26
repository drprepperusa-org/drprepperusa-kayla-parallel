/**
 * @file orderFilters.ts
 * @description Order filtering and merging utilities for the sync pipeline.
 *
 * Design:
 * - Pure functions — no side effects, no store access
 * - Used by syncService to merge incoming API orders with existing store orders
 * - Incoming orders always win (freshest data from ShipStation)
 * - Existing orders not in the incoming set are preserved unchanged
 */

import type { Order } from '../types/orders';

/**
 * Merge incoming orders from the API with the existing store orders.
 *
 * Strategy:
 * - Incoming orders replace existing orders with the same ID (API is source of truth)
 * - Existing orders NOT in the incoming set are preserved (they weren't modified)
 * - New orders (not in existing) are appended
 *
 * O(n + m) via Map lookup — safe for large order sets.
 *
 * @param existing - Current orders in the store
 * @param incoming - Fresh orders from the API (already normalized)
 * @returns Merged orders array: existing (updated) + new
 *
 * @example
 * ```ts
 * const allOrders = mergeOrders(store.allOrders, apiOrders);
 * store.syncComplete(new Date(), allOrders);
 * ```
 */
export function mergeOrders(existing: Order[], incoming: Order[]): Order[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return incoming;

  // Build a map of incoming orders by ID for O(1) lookup
  const incomingMap = new Map<string, Order>(incoming.map((o) => [o.id, o]));

  // Start with existing orders, replacing any that appear in incoming
  const merged: Order[] = existing.map((o) => incomingMap.get(o.id) ?? o);

  // Build a set of existing IDs to find truly new orders
  const existingIds = new Set<string>(existing.map((o) => o.id));

  // Append new orders (in incoming but not in existing)
  for (const order of incoming) {
    if (!existingIds.has(order.id)) {
      merged.push(order);
    }
  }

  return merged;
}

/**
 * Filter orders by status.
 *
 * @param orders - Orders to filter
 * @param status - Status to filter by
 * @returns Orders matching the given status
 */
export function filterOrdersByStatus(
  orders: Order[],
  status: Order['status'],
): Order[] {
  return orders.filter((o) => o.status === status);
}

/**
 * Filter orders by store ID.
 *
 * @param orders - Orders to filter
 * @param storeId - Store ID to filter by
 * @returns Orders belonging to the given store
 */
export function filterOrdersByStore(
  orders: Order[],
  storeId: number,
): Order[] {
  return orders.filter((o) => o.storeId === storeId);
}

/**
 * Filter orders modified after a given date.
 * Uses `lastUpdatedAt` as the modification timestamp.
 *
 * @param orders - Orders to filter
 * @param since - Only return orders updated after this date
 * @returns Orders updated since the given date
 */
export function filterOrdersSince(orders: Order[], since: Date): Order[] {
  return orders.filter((o) => o.lastUpdatedAt > since);
}
