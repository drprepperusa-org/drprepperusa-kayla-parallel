/**
 * rateCache.test.ts — Rate Cache Key Validation Suite
 *
 * Tests cover:
 *   1. Canonical key generation (golden path)
 *   2. Collision prevention (different inputs → different keys)
 *   3. Consistency (same inputs → same key regardless of input ordering variants)
 *   4. Invariant enforcement (bad inputs → RateCacheKeyError)
 *   5. Parse round-trip
 *   6. Edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  buildRateCacheKey,
  parseRateCacheKey,
  RateCacheKeyError,
  WeightUnit,
  KnownCarrier,
  KnownService,
} from './rateCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PARAMS = {
  carrier: KnownCarrier.StampsCom,
  service: KnownService.USPSPriorityMail,
  weight: 16,
  weightUnit: WeightUnit.Ounces,
  dimensions: { length: 12, width: 8, height: 4 },
  originZip: '92101',
  destinationZip: '10001',
  residential: true,
};

// ---------------------------------------------------------------------------
// 1. Canonical key generation (golden path)
// ---------------------------------------------------------------------------

describe('buildRateCacheKey — canonical format', () => {
  it('produces the expected canonical key string', () => {
    const key = buildRateCacheKey(BASE_PARAMS);
    expect(key).toBe('stamps_com-usps_priority_mail-16.0000-12x8x4-92101-10001-1');
  });

  it('encodes residential=false as "0"', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, residential: false });
    expect(key).toMatch(/-0$/);
  });

  it('encodes residential=true as "1"', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, residential: true });
    expect(key).toMatch(/-1$/);
  });

  it('lowercases carrier code', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, carrier: 'STAMPS_COM' });
    expect(key).toMatch(/^stamps_com-/);
  });

  it('lowercases service code', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, service: 'USPS_PRIORITY_MAIL' });
    expect(key).toMatch(/^stamps_com-usps_priority_mail-/);
  });

  it('formats weight to 4 decimal places', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, weight: 8, weightUnit: WeightUnit.Ounces });
    expect(key).toContain('-8.0000-');
  });

  it('strips non-digit characters from ZIP codes', () => {
    const key = buildRateCacheKey({
      ...BASE_PARAMS,
      originZip: '921-01',
      destinationZip: '10001 ',
    });
    expect(key).toContain('-92101-10001-');
  });

  it('pads short ZIP codes with leading zeros', () => {
    // e.g. "1234" → "01234"
    const key = buildRateCacheKey({
      ...BASE_PARAMS,
      originZip: '1234',
      destinationZip: '0100',
    });
    expect(key).toContain('-01234-00100-');
  });
});

// ---------------------------------------------------------------------------
// 2. Collision prevention
// ---------------------------------------------------------------------------

describe('buildRateCacheKey — collision prevention', () => {
  it('different carriers produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, carrier: KnownCarrier.StampsCom });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, carrier: KnownCarrier.FedEx });
    expect(k1).not.toBe(k2);
  });

  it('different services produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, service: KnownService.USPSPriorityMail });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, service: KnownService.USPSFirstClass });
    expect(k1).not.toBe(k2);
  });

  it('different weights produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, weight: 8 });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, weight: 16 });
    expect(k1).not.toBe(k2);
  });

  it('different dimensions produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 12, width: 8, height: 4 } });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 10, width: 6, height: 4 } });
    expect(k1).not.toBe(k2);
  });

  it('different origin ZIPs produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, originZip: '92101' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, originZip: '90210' });
    expect(k1).not.toBe(k2);
  });

  it('different destination ZIPs produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, destinationZip: '10001' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, destinationZip: '30301' });
    expect(k1).not.toBe(k2);
  });

  it('residential vs non-residential produce different keys', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, residential: true });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, residential: false });
    expect(k1).not.toBe(k2);
  });

  it('weight unit conversion: 16 oz vs 454 grams are NOT the same (same oz value, different grams)', () => {
    // 16 oz = 453.592 g; 454 g is slightly more than 16 oz
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, weight: 16, weightUnit: WeightUnit.Ounces });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, weight: 454, weightUnit: WeightUnit.Grams });
    expect(k1).not.toBe(k2);
  });

  it('1 lb == 16 oz after normalisation (no collision for equivalent weights)', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, weight: 16, weightUnit: WeightUnit.Ounces });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, weight: 1, weightUnit: WeightUnit.Pounds });
    expect(k1).toBe(k2);
  });

  it('origin ZIP != destination ZIP of same value produce different keys', () => {
    // Ensure origin and destination positions are not swapped silently
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, originZip: '92101', destinationZip: '10001' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, originZip: '10001', destinationZip: '92101' });
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// 3. Consistency (same inputs → same key)
// ---------------------------------------------------------------------------

describe('buildRateCacheKey — consistency', () => {
  it('produces identical keys for identical inputs called twice', () => {
    const k1 = buildRateCacheKey(BASE_PARAMS);
    const k2 = buildRateCacheKey(BASE_PARAMS);
    expect(k1).toBe(k2);
  });

  it('dimension ordering does not change the key (sorted descending)', () => {
    // 12x8x4 vs 4x12x8 vs 8x4x12 — all should produce same key
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 12, width: 8, height: 4 } });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 4, width: 12, height: 8 } });
    const k3 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 8, width: 4, height: 12 } });
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  it('carrier code case does not change the key', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, carrier: 'stamps_com' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, carrier: 'STAMPS_COM' });
    const k3 = buildRateCacheKey({ ...BASE_PARAMS, carrier: 'Stamps_Com' });
    expect(k1).toBe(k2);
    expect(k2).toBe(k3);
  });

  it('service code case does not change the key', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, service: 'usps_priority_mail' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, service: 'USPS_PRIORITY_MAIL' });
    expect(k1).toBe(k2);
  });

  it('ZIP with dashes or spaces normalises identically to plain ZIP', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, originZip: '92101' });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, originZip: ' 92101 ' });
    expect(k1).toBe(k2);
  });

  it('weight in grams equivalent to ounces produces same key', () => {
    const ozKey = buildRateCacheKey({ ...BASE_PARAMS, weight: 8, weightUnit: WeightUnit.Ounces });
    const gKey = buildRateCacheKey({
      ...BASE_PARAMS,
      weight: 8 * 28.3495,
      weightUnit: WeightUnit.Grams,
    });
    // both resolve to 8.0000 oz
    expect(ozKey).toBe(gKey);
  });
});

// ---------------------------------------------------------------------------
// 4. Invariant enforcement
// ---------------------------------------------------------------------------

describe('buildRateCacheKey — invariant enforcement', () => {
  it('throws RateCacheKeyError for empty carrier', () => {
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, carrier: '' })).toThrow(RateCacheKeyError);
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, carrier: '   ' })).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for empty service', () => {
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, service: '' })).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for negative weight', () => {
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, weight: -1 })).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for NaN weight', () => {
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, weight: NaN })).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for Infinity weight', () => {
    expect(() => buildRateCacheKey({ ...BASE_PARAMS, weight: Infinity })).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for zero dimension (length)', () => {
    expect(() =>
      buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 0, width: 8, height: 4 } })
    ).toThrow(RateCacheKeyError);
  });

  it('throws RateCacheKeyError for negative dimension', () => {
    expect(() =>
      buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 12, width: -1, height: 4 } })
    ).toThrow(RateCacheKeyError);
  });

  it('allows zero weight (0 oz is valid — massless e-product)', () => {
    // weight=0 is theoretically valid (e-commerce digital goods) — should not throw
    expect(() =>
      buildRateCacheKey({ ...BASE_PARAMS, weight: 0, weightUnit: WeightUnit.Ounces })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Parse round-trip
// ---------------------------------------------------------------------------

describe('parseRateCacheKey — round-trip', () => {
  it('parses a canonical key back to components', () => {
    const key = 'stamps_com-usps_priority_mail-16.0000-12x8x4-92101-10001-1';
    const parsed = parseRateCacheKey(key);
    expect(parsed.carrier).toBe('stamps_com');
    expect(parsed.service).toBe('usps_priority_mail');
    expect(parsed.weightOunces).toBeCloseTo(16, 4);
    expect(parsed.dimensions).toBe('12x8x4');
    expect(parsed.originZip).toBe('92101');
    expect(parsed.destinationZip).toBe('10001');
    expect(parsed.residential).toBe(true);
  });

  it('parses residential=0 correctly', () => {
    const key = 'fedex-fedex_ground-8.0000-10x6x4-92101-30301-0';
    const parsed = parseRateCacheKey(key);
    expect(parsed.residential).toBe(false);
  });

  it('throws RateCacheKeyError for a key with too few parts', () => {
    expect(() => parseRateCacheKey('only-five-parts-here-x')).toThrow(RateCacheKeyError);
  });

  it('build → parse is consistent for BASE_PARAMS', () => {
    const key = buildRateCacheKey(BASE_PARAMS);
    const parsed = parseRateCacheKey(key);
    expect(parsed.carrier).toBe(BASE_PARAMS.carrier);
    expect(parsed.service).toBe(BASE_PARAMS.service);
    expect(parsed.weightOunces).toBeCloseTo(BASE_PARAMS.weight, 4);
    expect(parsed.originZip).toBe(BASE_PARAMS.originZip);
    expect(parsed.destinationZip).toBe(BASE_PARAMS.destinationZip);
    expect(parsed.residential).toBe(BASE_PARAMS.residential);
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases
// ---------------------------------------------------------------------------

describe('buildRateCacheKey — edge cases', () => {
  it('handles a carrier code with internal dashes (e.g. dhl-express)', () => {
    // "dhl_express" uses underscores, but ensure dashes in carrier don't break key structure
    // The key format uses '-' as separator; dhl_express uses underscores so this is fine
    const key = buildRateCacheKey({ ...BASE_PARAMS, carrier: 'dhl_express', service: 'dhl_express_worldwide' });
    expect(key).toMatch(/^dhl_express-dhl_express_worldwide-/);
  });

  it('handles very small weights (under 1 oz)', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, weight: 0.5, weightUnit: WeightUnit.Ounces });
    expect(key).toContain('-0.5000-');
  });

  it('handles very large weights (100 lbs)', () => {
    const key = buildRateCacheKey({ ...BASE_PARAMS, weight: 100, weightUnit: WeightUnit.Pounds });
    expect(key).toContain('-1600.0000-');
  });

  it('handles cubic dimensions (cube)', () => {
    const key = buildRateCacheKey({
      ...BASE_PARAMS,
      dimensions: { length: 5, width: 5, height: 5 },
    });
    expect(key).toContain('-5x5x5-');
  });

  it('rounds fractional dimensions to nearest integer', () => {
    const k1 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 12.4, width: 8.6, height: 4.1 } });
    const k2 = buildRateCacheKey({ ...BASE_PARAMS, dimensions: { length: 12, width: 9, height: 4 } });
    expect(k1).toBe(k2);
  });
});
