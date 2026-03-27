/**
 * @file server/routes/sync.ts
 * @description POST /api/sync — fetch and sync orders from ShipStation.
 *
 * Flow:
 *   1. Parse optional lastSyncTime from body
 *   2. Paginate through ShipStation V1 /orders (all pages)
 *   3. Return sync result (newOrders count, updatedOrders count, etc.)
 *
 * The sync service normalizes ShipStation orders to the app's Order domain type.
 * The frontend store receives the normalized list and merges/replaces as needed.
 */

import { Router, type Request, type Response } from 'express';
import { createServerShipStationClient, ShipStationError, type SSV1OrderItem } from '../lib/shipstation.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes:sync');

export const syncRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SyncResponse {
  syncedAt: string;
  newOrders: number;
  updatedOrders: number;
  externallyShipped: number;
  fetchedCount: number;
  orders: NormalizedOrder[];
}

interface NormalizedOrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  weightOz: number;
}

interface NormalizedOrder {
  id: string;
  orderNum: string;
  orderId: number;
  clientId: string;
  storeId?: number;
  orderDate: string;
  createdAt: string;
  lastUpdatedAt: string;
  customer: string;
  shipTo: {
    name: string;
    company?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    residential: boolean;
    phone?: string;
  };
  items: NormalizedOrderItem[];
  itemCount: number;
  weightOz: number;
  status: string;
  externallyShipped: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizer: ShipStation V1 order → NormalizedOrder
// ─────────────────────────────────────────────────────────────────────────────

function normalizeOrder(raw: SSV1OrderItem): NormalizedOrder {
  const items = (raw.items ?? []).map((item) => ({
    id: item.lineItemKey ?? `${raw.orderId}-${item.sku}`,
    sku: item.sku,
    name: item.name ?? item.sku,
    quantity: item.quantity,
    weightOz: item.weight?.value ?? 0,
  }));

  const weightOz = raw.weight?.value ?? items.reduce((sum, i) => sum + i.weightOz * i.quantity, 0);
  const shipTo = raw.shipTo;
  const residential = shipTo?.residential === true ? true :
    shipTo?.residential === false ? false :
    !shipTo?.company;

  function mapStatus(ss: string): string {
    switch (ss.toLowerCase()) {
      case 'awaiting_shipment':
      case 'awaiting_payment':
      case 'on_hold':
        return 'awaiting_shipment';
      case 'shipped':
      case 'cancelled':
        return ss;
      default:
        return 'awaiting_shipment';
    }
  }

  return {
    id: String(raw.orderId),
    orderNum: raw.orderNumber,
    orderId: raw.orderId,
    clientId: String(raw.advancedOptions?.storeId ?? raw.storeId ?? 'unknown'),
    storeId: raw.storeId ?? raw.advancedOptions?.storeId,
    orderDate: raw.orderDate,
    createdAt: raw.createDate,
    lastUpdatedAt: raw.modifyDate,
    customer: shipTo?.name ?? raw.billTo?.name ?? 'Unknown',
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
    items,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    weightOz,
    status: mapStatus(raw.orderStatus),
    externallyShipped: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/sync
 * Body: { lastSyncTime?: string | null, storeId?: number }
 * Returns: SyncResponse
 */
syncRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const lastSyncTimeRaw = body['lastSyncTime'] as string | null | undefined;
  const storeId = body['storeId'] as number | null | undefined;

  // Validate lastSyncTime if provided
  let lastSyncTime: Date | null = null;
  if (lastSyncTimeRaw != null) {
    const parsed = new Date(lastSyncTimeRaw);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'lastSyncTime must be a valid ISO timestamp or null', code: 'VALIDATION_ERROR' });
      return;
    }
    lastSyncTime = parsed;
  }

  log.info({ event: 'sync.start', lastSyncTime: lastSyncTime?.toISOString() ?? 'full', storeId }, 'Sync started');

  try {
    const client = createServerShipStationClient();
    const syncedAt = new Date();

    const allRaw: SSV1OrderItem[] = [];
    let page = 1;
    let totalPages = 1;

    // Paginate through all orders
    while (page <= totalPages) {
      const response = await client.getOrders({
        lastSyncTime,
        storeId: storeId ?? null,
        page,
        pageSize: 500,
      });

      allRaw.push(...(response.orders ?? []));
      totalPages = response.pages ?? 1;
      log.debug({ event: 'sync.page', page, totalPages, fetched: response.orders?.length ?? 0 }, 'Sync page fetched');
      page++;
    }

    const orders = allRaw.map(normalizeOrder);
    const fetchedCount = orders.length;

    // Simple diff: orders returned are either new or updated
    // (frontend store handles actual merge/dedup)
    const newOrders = orders.filter((o) => o.status !== 'shipped').length;
    const updatedOrders = orders.filter((o) => o.status === 'shipped').length;
    const externallyShipped = 0; // Detected client-side per Q6 logic

    log.info({
      event: 'sync.complete',
      fetchedCount,
      newOrders,
      updatedOrders,
      syncedAt: syncedAt.toISOString(),
    }, 'Sync complete');

    const resp: SyncResponse = {
      syncedAt: syncedAt.toISOString(),
      newOrders,
      updatedOrders,
      externallyShipped,
      fetchedCount,
      orders,
    };

    res.json(resp);
  } catch (err) {
    if (err instanceof ShipStationError) {
      if (err.code === 'AUTH_ERROR') {
        log.error({ event: 'sync.auth_error' }, 'ShipStation auth failed');
        res.status(401).json({ error: 'ShipStation authentication failed. Check API credentials.', code: 'AUTH_ERROR' });
        return;
      }
      if (err.code === 'RATE_LIMITED') {
        log.warn({ event: 'sync.rate_limited', retryAfter: err.retryAfterSecs }, 'ShipStation rate limited during sync');
        res.status(429).json({ error: 'Rate limited. Please retry shortly.', code: 'RATE_LIMITED', retryAfterSecs: err.retryAfterSecs });
        return;
      }
      log.error({ event: 'sync.upstream_error', code: err.code, status: err.statusCode }, 'ShipStation error during sync');
      res.status(502).json({ error: 'Failed to sync orders from ShipStation.', code: 'UPSTREAM_ERROR' });
      return;
    }

    log.error({ event: 'sync.internal_error', err: err instanceof Error ? err.message : String(err) }, 'Internal error during sync');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});
