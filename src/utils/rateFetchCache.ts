/**
 * rateFetchCache.ts — Rate Fetch Cache Layer
 *
 * SCAFFOLD STATUS: Rate Enrichment Pipeline (Feature 6)
 * -------------------------------------------------------
 * Provides in-memory caching for fetched ShipStation rates.
 * Uses the canonical Tier 1 cache key format from rateCache.ts.
 *
 * CACHE STRATEGY
 * - In-memory Map (no TTL — manual invalidation via clearRateCache())
 * - Key format: Tier 1 canonical format (locked in rateCache.ts)
 * - One cached entry = the best rate (already selected before storing)
 * - Thread-safe for JS single-thread model; not safe for SSR/workers
 *
 * DELIBERATE DESIGN DECISIONS
 * - No TTL: rates from ShipStation change infrequently during a session;
 *   manual cache bust (per-order or per-batch) is the right lever.
 * - Store best rate only: we select before caching; the full rate array
 *   is not stored to keep memory footprint minimal.
 * - WeightUnit.Ounces: all requests are normalised to ounces upstream;
 *   this module always passes WeightUnit.Ounces to buildRateCacheKey.
 *
 * INTEGRATION POINT (when Markup Chain ships):
 * Once markups are applied, the cache key should stay the same (markups
 * are a function of carrier, not of the rate lookup params). The cached
 * value will be the post-markup best rate.
 */

import {
  buildRateCacheKey,
  RateCacheKeyError,
  WeightUnit,
} from './rateCache';
import {
  fetchRatesFromShipStation,
  selectBestRate,
  type RateFetchRequest,
  type ClientCredentials,
  type ShipStationRate,
} from '../api/rateService';

// ---------------------------------------------------------------------------
// Module-level cache (singleton per module instance)
// ---------------------------------------------------------------------------

const rateCache = new Map<string, ShipStationRate>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up or fetch the best rate for a request.
 *
 * Steps:
 *   1. Build canonical Tier 1 cache key from request params
 *   2. Return cached best rate if present (cache hit)
 *   3. On miss: call fetchRatesFromShipStation(), select best rate
 *   4. Store in cache (only if a rate was found)
 *   5. Return best rate (or null if no rates available)
 *
 * @param request - Rate fetch parameters (weight in ounces)
 * @param clientCredentials - Per-tenant ShipStation API credentials
 * @param serviceCode - ShipStation service code for cache key (e.g. 'usps_priority_mail')
 * @returns Best ShipStationRate or null if unavailable
 */
export async function getCachedOrFetchedRate(
  request: RateFetchRequest,
  clientCredentials: ClientCredentials,
  serviceCode: string,
): Promise<ShipStationRate | null> {
  let cacheKey: string;

  try {
    cacheKey = buildRateCacheKey({
      carrier: request.carrierCode,
      service: serviceCode,
      weight: request.weight,
      weightUnit: WeightUnit.Ounces,
      dimensions: request.dimensions,
      originZip: request.originZip,
      destinationZip: request.destinationZip,
      residential: request.residential,
    });
  } catch (err) {
    if (err instanceof RateCacheKeyError) {
      console.warn('[rateFetchCache] getCachedOrFetchedRate: invalid cache key params', {
        orderId: request.orderId,
        error: err.message,
      });
      return null;
    }
    throw err;
  }

  // Cache hit
  if (rateCache.has(cacheKey)) {
    console.debug('[rateFetchCache] cache HIT', { cacheKey, orderId: request.orderId });
    return rateCache.get(cacheKey)!;
  }

  // Cache miss — fetch from ShipStation
  console.debug('[rateFetchCache] cache MISS — fetching', { cacheKey, orderId: request.orderId });

  const rates = await fetchRatesFromShipStation(request, clientCredentials);
  const bestRate = selectBestRate(rates);

  if (bestRate !== null) {
    rateCache.set(cacheKey, bestRate);
    console.debug('[rateFetchCache] cached best rate', {
      cacheKey,
      orderId: request.orderId,
      rate: bestRate.rate,
      serviceCode: bestRate.serviceCode,
    });
  } else {
    console.info('[rateFetchCache] no rates returned — not caching null', {
      cacheKey,
      orderId: request.orderId,
    });
  }

  return bestRate;
}

/**
 * Manually invalidate a specific cache entry.
 * Use when order params change (weight, dims, address) mid-session.
 *
 * @param cacheKey - Exact canonical key from buildRateCacheKey()
 */
export function invalidateRateCacheEntry(cacheKey: string): void {
  const deleted = rateCache.delete(cacheKey);
  console.debug('[rateFetchCache] invalidateRateCacheEntry', { cacheKey, deleted });
}

/**
 * Flush the entire rate cache.
 * Use at session end, after rate list refresh, or in tests.
 */
export function clearRateCache(): void {
  const size = rateCache.size;
  rateCache.clear();
  console.debug('[rateFetchCache] clearRateCache', { entriesCleared: size });
}

/**
 * Return current cache size (for diagnostics and tests).
 */
export function getRateCacheSize(): number {
  return rateCache.size;
}

/**
 * Expose the raw cache map for testing.
 * Do NOT use in production code.
 *
 * @internal
 */
export function _getRateCacheForTesting(): Map<string, ShipStationRate> {
  return rateCache;
}
