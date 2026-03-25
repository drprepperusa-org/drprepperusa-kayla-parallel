/**
 * rateFetchCache.test.ts — Rate Fetch Cache Layer Tests
 *
 * Coverage:
 *   1. Cache hit behaviour (returns stored rate without calling fetch)
 *   2. Cache miss behaviour (calls fetchRatesFromShipStation, caches result)
 *   3. Null rate — not cached, returns null
 *   4. Cache invalidation (clearRateCache, invalidateRateCacheEntry)
 *   5. Invalid params — returns null, doesn't throw
 *   6. Size tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCachedOrFetchedRate,
  clearRateCache,
  invalidateRateCacheEntry,
  getRateCacheSize,
  _getRateCacheForTesting,
} from './rateFetchCache';
import * as rateService from '../api/rateService';
import type { RateFetchRequest, ShipStationRate } from '../api/rateService';
import { buildRateCacheKey, WeightUnit } from './rateCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REQUEST: RateFetchRequest = {
  orderId: 'order-100',
  clientId: 'client-1',
  carrierCode: 'stamps_com',
  weight: 16,
  dimensions: { length: 12, width: 8, height: 4 },
  originZip: '92101',
  destinationZip: '10001',
  residential: true,
};

const CREDENTIALS = { apiKey: 'key', apiSecret: 'secret' };
const SERVICE_CODE = 'usps_priority_mail';

const BEST_RATE: ShipStationRate = {
  carrierCode: 'stamps_com',
  serviceCode: 'usps_priority_mail',
  rate: 7.50,
};

function buildKey(req: RateFetchRequest, serviceCode: string): string {
  return buildRateCacheKey({
    carrier: req.carrierCode,
    service: serviceCode,
    weight: req.weight,
    weightUnit: WeightUnit.Ounces,
    dimensions: req.dimensions,
    originZip: req.originZip,
    destinationZip: req.destinationZip,
    residential: req.residential,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearRateCache();
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  clearRateCache();
});

// ---------------------------------------------------------------------------
// 1. Cache miss → fetch → cache result
// ---------------------------------------------------------------------------

describe('getCachedOrFetchedRate — cache miss', () => {
  it('calls fetchRatesFromShipStation on cache miss', async () => {
    const fetchSpy = vi
      .spyOn(rateService, 'fetchRatesFromShipStation')
      .mockResolvedValue([BEST_RATE]);

    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('returns best rate on cache miss', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([
      { carrierCode: 'stamps_com', serviceCode: 'usps_priority_mail', rate: 9.00 },
      BEST_RATE, // 7.50 — should be selected
    ]);

    const result = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(result).toEqual(BEST_RATE);
  });

  it('stores the best rate in cache after fetch', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([BEST_RATE]);

    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    const cacheKey = buildKey(VALID_REQUEST, SERVICE_CODE);
    expect(_getRateCacheForTesting().has(cacheKey)).toBe(true);
    expect(_getRateCacheForTesting().get(cacheKey)).toEqual(BEST_RATE);
  });

  it('increments cache size after first fetch', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([BEST_RATE]);
    expect(getRateCacheSize()).toBe(0);

    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(getRateCacheSize()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Cache hit — should NOT call fetchRatesFromShipStation
// ---------------------------------------------------------------------------

describe('getCachedOrFetchedRate — cache hit', () => {
  it('returns cached rate without calling fetch', async () => {
    // Use a single spy for the whole test — track call count
    const fetchSpy = vi
      .spyOn(rateService, 'fetchRatesFromShipStation')
      .mockResolvedValue([BEST_RATE]);

    // First call — cache miss, primes cache (1 call)
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — cache hit, no additional fetch (still 1 call total)
    const result = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual(BEST_RATE);
  });

  it('returns same rate reference on multiple cache hits', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([BEST_RATE]);
    const r1 = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    const r2 = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(r1).toBe(r2); // Same object reference
  });
});

// ---------------------------------------------------------------------------
// 3. Null rate — API returns nothing
// ---------------------------------------------------------------------------

describe('getCachedOrFetchedRate — no rates returned', () => {
  it('returns null when fetch returns empty array', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([]);

    const result = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(result).toBeNull();
  });

  it('does not cache null result', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([]);
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    expect(getRateCacheSize()).toBe(0);
  });

  it('retries fetch if cache is empty and rates were previously unavailable', async () => {
    const fetchSpy = vi
      .spyOn(rateService, 'fetchRatesFromShipStation')
      .mockResolvedValue([]);

    // First call — no rates
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    // Second call — no cache entry, so fetch again
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Cache invalidation
// ---------------------------------------------------------------------------

describe('clearRateCache', () => {
  it('clears all cache entries', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([BEST_RATE]);
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    expect(getRateCacheSize()).toBe(1);

    clearRateCache();
    expect(getRateCacheSize()).toBe(0);
  });

  it('forces re-fetch after clearRateCache', async () => {
    const fetchSpy = vi
      .spyOn(rateService, 'fetchRatesFromShipStation')
      .mockResolvedValue([BEST_RATE]);

    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);
    clearRateCache();
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateRateCacheEntry', () => {
  it('removes a specific cache entry', async () => {
    vi.spyOn(rateService, 'fetchRatesFromShipStation').mockResolvedValue([BEST_RATE]);
    await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, SERVICE_CODE);

    const cacheKey = buildKey(VALID_REQUEST, SERVICE_CODE);
    invalidateRateCacheEntry(cacheKey);

    expect(_getRateCacheForTesting().has(cacheKey)).toBe(false);
  });

  it('does not throw when key does not exist', () => {
    expect(() => invalidateRateCacheEntry('nonexistent-key')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Invalid params — should return null gracefully
// ---------------------------------------------------------------------------

describe('getCachedOrFetchedRate — invalid params', () => {
  it('returns null when carrier code is empty (invalid cache key)', async () => {
    const result = await getCachedOrFetchedRate(
      { ...VALID_REQUEST, carrierCode: '' },
      CREDENTIALS,
      SERVICE_CODE,
    );
    expect(result).toBeNull();
  });

  it('returns null when service code is empty (invalid cache key)', async () => {
    const result = await getCachedOrFetchedRate(VALID_REQUEST, CREDENTIALS, '');
    expect(result).toBeNull();
  });

  it('returns null when weight is negative (invalid cache key)', async () => {
    const result = await getCachedOrFetchedRate(
      { ...VALID_REQUEST, weight: -5 },
      CREDENTIALS,
      SERVICE_CODE,
    );
    expect(result).toBeNull();
  });
});
