/**
 * @file syncService.ts
 * @description Incremental sync service for ShipStation orders.
 *
 * Design:
 * - Pure service — no store access; caller is responsible for dispatching to store
 * - Stateless: no module-level state (lastSyncTime passed as input)
 * - Incremental: only fetches orders modified since lastSyncTime
 * - External detection: flags orders shipped or cancelled outside the app (Q6 pending)
 * - Returns: { newOrders, updatedOrders, externallyShipped, errors }
 *
 * Q6 PENDING: Definition of "externally shipped/cancelled".
 * Current approach: an order is considered externally shipped if:
 *   - status === 'shipped' AND label field is absent in the store
 * Once Q6 is answered, update detectExternallyShipped() accordingly.
 *
 * @example
 * ```ts
 * const client = createShipStationClientFromEnv();
 *
 * const result = await syncOrders(
 *   { lastSyncTime: new Date(Date.now() - 5 * 60 * 1000) }, // last 5 min
 *   client,
 *   existingOrders,
 * );
 *
 * if (result.ok) {
 *   store.syncComplete(new Date(), result.allOrders);
 *   console.log(`Synced: ${result.newOrders.length} new, ${result.updatedOrders.length} updated`);
 * }
 * ```
 */

import type { ShipStationClient } from '../api/shipstationClient';
import { ShipStationError } from '../api/shipstationClient';
import type { Order } from '../types/orders';
import { mergeOrders } from '../utils/orderFilters';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input for an incremental sync operation. */
export interface SyncRequest {
  /**
   * Only fetch orders modified since this time.
   * Pass null for a full sync (fetches all orders — use sparingly).
   */
  lastSyncTime: Date | null;
  /**
   * Maximum number of orders to fetch per page.
   * Default: 500 (ShipStation max per page).
   */
  pageSize?: number;
  /**
   * Optional store ID filter (multi-tenant).
   * Pass null to fetch all stores.
   */
  storeId?: number | null;
}

/** Result of a single incremental sync. */
export interface SyncResult {
  /** Orders that did not exist in the current store (brand new). */
  newOrders: Order[];
  /** Orders that existed and were updated on ShipStation. */
  updatedOrders: Order[];
  /**
   * Orders that appear to have been shipped outside this app.
   * Q6 PENDING: Definition TBD — see detectExternallyShipped() below.
   */
  externallyShipped: Order[];
  /** Merged final orders array (ready to dispatch to store.syncComplete). */
  allOrders: Order[];
  /** ISO timestamp of this sync (for updating lastSyncTime). */
  syncedAt: Date;
  /** Total orders fetched from API in this sync. */
  fetchedCount: number;
}

export type SyncServiceErrorCode =
  | 'AUTH_ERROR'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PARTIAL_FAILURE'
  | 'API_ERROR';

export class SyncServiceError extends Error {
  constructor(
    message: string,
    public readonly code: SyncServiceErrorCode,
    /** Orders successfully fetched before failure (partial data). */
    public readonly partialOrders?: Order[],
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SyncServiceError';
  }
}

/** Result type — prefer over throwing. */
export type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; error: SyncServiceError };

// ─────────────────────────────────────────────────────────────────────────────
// ShipStation V1 Order Response Shape (simplified)
// ─────────────────────────────────────────────────────────────────────────────

interface ShipStationV1OrderItem {
  lineItemKey: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  weight?: { value: number; units: 'ounces' | 'grams' };
}

interface ShipStationV1Order {
  orderId: number;
  orderNumber: string;
  orderStatus: string;
  orderDate: string;
  createDate: string;
  modifyDate: string;
  customerId?: number;
  customerUsername?: string;
  customerEmail?: string;
  billTo?: { name?: string };
  shipTo?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    residential?: boolean | null;
    phone?: string;
  };
  items?: ShipStationV1OrderItem[];
  amountPaid?: number;
  orderTotal?: number;
  weight?: { value: number; units: 'ounces' | 'grams' };
  dimensions?: { units: 'inches'; length: number; width: number; height: number } | null;
  storeId?: number;
  advancedOptions?: {
    storeId?: number;
    customField1?: string;
    customField2?: string;
    customField3?: string;
    source?: string;
  };
}

interface ShipStationV1OrdersResponse {
  orders: ShipStationV1Order[];
  total: number;
  page: number;
  pages: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization: ShipStation V1 → Order domain type
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN_ADDRESS = {
  name: 'DrPrepper USA',
  street1: '123 Warehouse Blvd',
  city: 'San Diego',
  state: 'CA',
  postalCode: '92101',
  country: 'US',
};

function mapStatus(ssStatus: string): Order['status'] {
  switch (ssStatus.toLowerCase()) {
    case 'awaiting_shipment':
    case 'awaiting_payment':
    case 'on_hold':
    case 'pending_fulfillment':
      return 'awaiting_shipment';
    case 'shipped':
    case 'cancelled':
      return ssStatus as Order['status'];
    default:
      return 'awaiting_shipment';
  }
}

/**
 * Normalize a ShipStation V1 order to the canonical Order domain type.
 * Called at the API boundary — never trust raw data.
 */
function normalizeV1Order(raw: ShipStationV1Order): Order {
  const itemsList = raw.items ?? [];
  const items = itemsList.map((item) => ({
    id: item.lineItemKey ?? `${raw.orderId}-${item.sku}`,
    sku: item.sku,
    name: item.name ?? item.sku,
    quantity: item.quantity,
    weightOz: item.weight?.value ?? 0,
  }));

  const weightOz = raw.weight?.value ?? items.reduce((sum, i) => sum + i.weightOz * i.quantity, 0);

  const shipTo = raw.shipTo;
  // Q6: residential detection — conservative default (true = residential)
  // shipTo?.residential is boolean | null | undefined from ShipStation
  const residential: boolean =
    shipTo?.residential === true ? true :
    shipTo?.residential === false ? false :
    !shipTo?.company; // No company = residential

  return {
    id: String(raw.orderId),
    orderNum: raw.orderNumber,
    orderId: raw.orderId,
    clientId: String(raw.advancedOptions?.storeId ?? raw.storeId ?? 'unknown'),
    storeId: raw.storeId ?? raw.advancedOptions?.storeId,

    orderDate: new Date(raw.orderDate),
    createdAt: new Date(raw.createDate),
    lastUpdatedAt: new Date(raw.modifyDate),

    customer: shipTo?.name ?? raw.billTo?.name ?? 'Unknown',
    customerId: raw.customerId ? String(raw.customerId) : undefined,

    shipTo: {
      name: shipTo?.name ?? '',
      company: shipTo?.company,
      street1: shipTo?.street1 ?? '',
      street2: shipTo?.street2,
      city: shipTo?.city ?? '',
      state: shipTo?.state ?? '',
      postalCode: shipTo?.postalCode ?? '',
      country: shipTo?.country ?? 'US',
      phone: shipTo?.phone,
      residential,
    },
    shipFrom: ORIGIN_ADDRESS,

    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    itemNames: [...new Set(items.map((i) => i.name))],
    skus: items.map((i) => i.sku),

    weightOz,
    dimensions: {
      lengthIn: raw.dimensions?.length ?? 12,
      widthIn: raw.dimensions?.width ?? 8,
      heightIn: raw.dimensions?.height ?? 4,
    },

    baseRate: 0, // Populated after rate fetch
    status: mapStatus(raw.orderStatus),
    externallyShipped: false,

    notes: undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// External Detection (Q6 pending)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect orders that were shipped or cancelled outside this app.
 *
 * Q6 PENDING: Final definition from DJ TBD.
 * Current heuristic: an order is "externally shipped" if:
 *   - API reports status === 'shipped'
 *   - AND no label exists in the current store for this order
 *
 * This is conservative — may produce false positives (e.g. orders shipped
 * before the app was deployed). Q6 resolution may add:
 *   - shipDate before app-launch cutoff
 *   - tracking prefix pattern matching
 *   - external source field
 *
 * @param incoming - Fresh orders from the API
 * @param existing - Current store orders (Map for O(1) lookup)
 * @returns Orders detected as externally shipped
 */
function detectExternallyShipped(
  incoming: Order[],
  existingMap: Map<string, Order>,
): Order[] {
  // Q6 PENDING — current heuristic
  return incoming.filter((order) => {
    if (order.status !== 'shipped') return false;
    const existing = existingMap.get(order.id);
    if (!existing) return true; // New order already marked shipped — external
    return !existing.label; // Had no label in our app
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Response Generator
// ─────────────────────────────────────────────────────────────────────────────

function generateMockSyncOrders(lastSyncTime: Date | null, _storeId?: number | null): ShipStationV1Order[] {
  const now = new Date();
  const cutoff = lastSyncTime ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Simulate 3-5 orders modified since cutoff
  const mockOrders: ShipStationV1Order[] = [
    {
      orderId: 100001,
      orderNumber: 'ORD-100001',
      orderStatus: 'awaiting_shipment',
      orderDate: cutoff.toISOString(),
      createDate: cutoff.toISOString(),
      modifyDate: now.toISOString(),
      billTo: { name: 'Sarah Chen' },
      shipTo: {
        name: 'Sarah Chen',
        street1: '456 Oak Ave',
        city: 'Brooklyn',
        state: 'NY',
        postalCode: '11201',
        country: 'US',
        residential: true,
      },
      items: [
        { lineItemKey: 'li-1', sku: 'PREP-001', name: '72-Hour Emergency Kit', quantity: 2 },
      ],
      weight: { value: 48, units: 'ounces' },
      storeId: 101,
    },
    {
      orderId: 100002,
      orderNumber: 'ORD-100002',
      orderStatus: 'awaiting_shipment',
      orderDate: cutoff.toISOString(),
      createDate: cutoff.toISOString(),
      modifyDate: now.toISOString(),
      billTo: { name: 'Mike Wilson' },
      shipTo: {
        name: 'Mike Wilson',
        street1: '789 Pine St',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
        residential: false,
      },
      items: [
        { lineItemKey: 'li-2', sku: 'SURV-101', name: 'Water Purification Kit', quantity: 1 },
      ],
      weight: { value: 24, units: 'ounces' },
      storeId: 201,
    },
  ];

  return mockOrders;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Sync Orders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform an incremental sync of ShipStation orders.
 *
 * Strategy:
 * 1. Fetch all orders modified since lastSyncTime (paginated)
 * 2. Normalize API responses to Order domain type
 * 3. Detect externally shipped orders (Q6 heuristic)
 * 4. Merge with existing store orders via mergeOrders utility
 * 5. Return { newOrders, updatedOrders, externallyShipped, allOrders }
 *
 * Error handling:
 * - Returns { ok: false, error } with partial data if pagination fails mid-sync
 * - Never throws — callers get typed error results
 *
 * @param req - Sync request parameters
 * @param client - ShipStation client (v1/v2)
 * @param existingOrders - Current orders in the store (for diffing and merge)
 * @returns SyncOutcome — ok=true with result, or ok=false with typed error
 */
export async function syncOrders(
  req: SyncRequest,
  client: ShipStationClient,
  existingOrders: Order[],
): Promise<SyncOutcome> {
  const syncedAt = new Date();
  const pageSize = req.pageSize ?? 500;
  const existingMap = new Map<string, Order>(existingOrders.map((o) => [o.id, o]));

  const fetchedRaw: ShipStationV1Order[] = [];
  let page = 1;
  let totalPages = 1;

  try {
    // Paginate through all modified orders
    while (page <= totalPages) {
      // Build query params for ShipStation V1 /orders endpoint
      const query: Record<string, string | number | boolean> = {
        pageSize,
        page,
        sortBy: 'ModifyDate',
        sortDir: 'ASC',
      };

      if (req.lastSyncTime) {
        // ISO 8601 date string for modifyDateStart
        query['modifyDateStart'] = req.lastSyncTime.toISOString();
      }
      if (req.storeId) {
        query['storeId'] = req.storeId;
      }

      // TODO: Replace mock with real call:
      //   const response = await client.v1.get<ShipStationV1OrdersResponse>('/orders', { query });
      //   fetchedRaw.push(...response.orders);
      //   totalPages = response.pages;

      void client; // Suppress until real wiring
      const mockResponse = generateMockSyncOrders(req.lastSyncTime, req.storeId);
      fetchedRaw.push(...mockResponse);
      totalPages = 1; // Mock: single page

      page++;
    }
  } catch (err) {
    if (err instanceof ShipStationError) {
      const code: SyncServiceErrorCode =
        err.code === 'AUTH_ERROR' ? 'AUTH_ERROR' :
        err.code === 'RATE_LIMITED' ? 'RATE_LIMITED' :
        err.code === 'NETWORK_ERROR' ? 'NETWORK_ERROR' :
        err.code === 'TIMEOUT' ? 'TIMEOUT' :
        'API_ERROR';

      const partialOrders = fetchedRaw.map(normalizeV1Order);
      return {
        ok: false,
        error: new SyncServiceError(
          `Sync failed at page ${page}: ${err.message}`,
          fetchedRaw.length > 0 ? 'PARTIAL_FAILURE' : code,
          partialOrders,
          err,
        ),
      };
    }
    return {
      ok: false,
      error: new SyncServiceError(
        `Unexpected sync error: ${err instanceof Error ? err.message : String(err)}`,
        'API_ERROR',
        undefined,
        err,
      ),
    };
  }

  // Normalize all fetched orders
  const fetchedOrders = fetchedRaw.map(normalizeV1Order);

  // Diff: find new vs updated
  const newOrders: Order[] = [];
  const updatedOrders: Order[] = [];

  for (const order of fetchedOrders) {
    if (existingMap.has(order.id)) {
      updatedOrders.push(order);
    } else {
      newOrders.push(order);
    }
  }

  // Detect externally shipped (Q6 heuristic)
  const externallyShipped = detectExternallyShipped(fetchedOrders, existingMap);

  // Mark externally shipped orders
  const markedOrders = fetchedOrders.map((o) => ({
    ...o,
    externallyShipped: externallyShipped.some((e) => e.id === o.id),
  }));

  // Merge with existing store orders
  const allOrders = mergeOrders(existingOrders, markedOrders);

  return {
    ok: true,
    result: {
      newOrders,
      updatedOrders,
      externallyShipped,
      allOrders,
      syncedAt,
      fetchedCount: fetchedOrders.length,
    },
  };
}
