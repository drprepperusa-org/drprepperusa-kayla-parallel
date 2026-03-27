/**
 * @file server/routes/rates.ts
 * @description GET /api/rates/:orderId — fetch shipping rates with 30-min cache.
 *
 * Flow:
 * 1. Check in-memory cache (30min TTL) → return cached if hit
 * 2. Call ShipStation V2 /rates/estimate
 * 3. Normalize response → ProxyRate[]
 * 4. Cache result → return
 *
 * Error handling:
 *   - 400: missing orderId or required query params
 *   - 401: ShipStation auth failed
 *   - 429: ShipStation rate limited (passes through with Retry-After)
 *   - 502: ShipStation unreachable or server error
 *   - 500: unexpected internal error
 */

import { Router, type Request, type Response } from 'express';
import { createServerShipStationClient, ShipStationError } from '../lib/shipstation.js';
import { getRatesCache } from '../lib/cache.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes:rates');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ProxyRate {
  carrierCode: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  totalCost: number;
  shipmentCost: number;
  otherCost: number;
  deliveryDays: number | null;
  estimatedDelivery: string | null;
  guaranteedDelivery: boolean;
  residential: boolean;
}

export interface RatesResponse {
  rates: ProxyRate[];
  fromCache: boolean;
  cachedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const ratesRouter = Router();

/**
 * GET /api/rates/:orderId
 *
 * Query params:
 *   fromZip       — origin postal code (required)
 *   toZip         — destination postal code (required)
 *   weightOz      — weight in ounces (required)
 *   lengthIn      — length in inches (optional)
 *   widthIn       — width in inches (optional)
 *   heightIn      — height in inches (optional)
 *   residential   — 'true' | 'false' (optional, default false)
 *   carrierCode   — carrier filter (optional)
 */
ratesRouter.get('/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params as { orderId: string };

  if (!orderId || orderId.trim() === '') {
    res.status(400).json({ error: 'orderId is required', code: 'VALIDATION_ERROR' });
    return;
  }

  const { fromZip, toZip, weightOz, lengthIn, widthIn, heightIn, residential, carrierCode } = req.query as Record<string, string | undefined>;

  // Validate required params
  if (!fromZip || !toZip || !weightOz) {
    res.status(400).json({
      error: 'Required query params: fromZip, toZip, weightOz',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const weightOzNum = parseFloat(weightOz);
  if (!Number.isFinite(weightOzNum) || weightOzNum <= 0) {
    res.status(400).json({ error: 'weightOz must be a positive number', code: 'VALIDATION_ERROR' });
    return;
  }

  // Build cache key — includes all rate-determining params
  const cacheKey = `${orderId}:${fromZip}:${toZip}:${weightOzNum}:${lengthIn ?? ''}:${widthIn ?? ''}:${heightIn ?? ''}:${residential ?? 'false'}:${carrierCode ?? ''}`;

  const cache = getRatesCache();
  const cached = cache.get(cacheKey);

  if (cached) {
    const resp: RatesResponse = {
      rates: cached.value,
      fromCache: true,
      cachedAt: cached.cachedAt.toISOString(),
    };
    log.info({ orderId, event: 'rates.cache_hit' }, 'Returning cached rates');
    res.json(resp);
    return;
  }

  try {
    const client = createServerShipStationClient();

    const rawResponse = await client.getRates(orderId, {
      carrierCode: carrierCode,
      fromPostalCode: fromZip,
      toPostalCode: toZip,
      toCountry: 'US',
      weightOz: weightOzNum,
      dimensions: (lengthIn && widthIn && heightIn) ? {
        lengthIn: parseFloat(lengthIn),
        widthIn: parseFloat(widthIn),
        heightIn: parseFloat(heightIn),
      } : undefined,
      residential: residential === 'true',
    });

    const rates: ProxyRate[] = (rawResponse.rates ?? []).map((r) => ({
      carrierCode: r.carrier_code,
      carrierName: r.carrier_friendly_name ?? r.carrier_code,
      serviceCode: r.service_code,
      serviceName: r.service_type ?? r.service_code,
      totalCost: r.shipping_amount.amount + r.other_amount.amount,
      shipmentCost: r.shipping_amount.amount,
      otherCost: r.other_amount.amount,
      deliveryDays: r.delivery_days ?? null,
      estimatedDelivery: r.estimated_delivery_date ?? null,
      guaranteedDelivery: r.guaranteed_service ?? false,
      residential: residential === 'true',
    }));

    const cacheEntry = cache.set(cacheKey, rates);

    const resp: RatesResponse = {
      rates,
      fromCache: false,
      cachedAt: cacheEntry.cachedAt.toISOString(),
    };

    log.info({ orderId, event: 'rates.fetched', count: rates.length }, 'Rates fetched and cached');
    res.json(resp);
  } catch (err) {
    if (err instanceof ShipStationError) {
      if (err.code === 'AUTH_ERROR') {
        log.error({ orderId, event: 'rates.auth_error' }, 'ShipStation authentication failed');
        res.status(401).json({ error: 'ShipStation authentication failed. Check API credentials.', code: 'AUTH_ERROR' });
        return;
      }
      if (err.code === 'RATE_LIMITED') {
        log.warn({ orderId, event: 'rates.rate_limited', retryAfter: err.retryAfterSecs }, 'ShipStation rate limit');
        res.status(429).json({ error: 'Rate limited. Please retry shortly.', code: 'RATE_LIMITED', retryAfterSecs: err.retryAfterSecs });
        return;
      }
      log.error({ orderId, event: 'rates.upstream_error', code: err.code, status: err.statusCode }, 'ShipStation error');
      res.status(502).json({ error: 'Failed to fetch rates from ShipStation.', code: 'UPSTREAM_ERROR' });
      return;
    }

    log.error({ orderId, event: 'rates.internal_error', err: err instanceof Error ? err.message : String(err) }, 'Internal error');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/rates/cache/stats — cache diagnostics for DJ debugging
 */
ratesRouter.get('/cache/stats', (_req: Request, res: Response): void => {
  const stats = getRatesCache().stats();
  log.info({ event: 'cache.stats', ...stats }, 'Cache stats requested');
  res.json(stats);
});
