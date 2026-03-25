/**
 * rateService.test.ts — Rate Enrichment Service Tests
 *
 * Coverage:
 *   1. fetchRatesFromShipStation — input validation, stub behaviour
 *   2. selectBestRate — empty array, single rate, multiple rates
 *   3. buildRateFetchRequest — valid order, missing fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchRatesFromShipStation,
  selectBestRate,
  buildRateFetchRequest,
  type RateFetchRequest,
  type ShipStationRate,
} from './rateService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_REQUEST: RateFetchRequest = {
  orderId: 'order-123',
  clientId: 'client-1',
  carrierCode: 'stamps_com',
  weight: 16,
  dimensions: { length: 12, width: 8, height: 4 },
  originZip: '92101',
  destinationZip: '10001',
  residential: true,
};

const VALID_CREDENTIALS = { apiKey: 'key-abc', apiSecret: 'secret-xyz' };

const RATE_A: ShipStationRate = { carrierCode: 'stamps_com', serviceCode: 'usps_priority_mail', rate: 8.50 };
const RATE_B: ShipStationRate = { carrierCode: 'stamps_com', serviceCode: 'usps_first_class_mail', rate: 4.25 };
const RATE_C: ShipStationRate = { carrierCode: 'fedex', serviceCode: 'fedex_ground', rate: 12.00 };

// ---------------------------------------------------------------------------
// 1. fetchRatesFromShipStation
// ---------------------------------------------------------------------------

describe('fetchRatesFromShipStation — input validation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('returns empty array when originZip is missing', async () => {
    const rates = await fetchRatesFromShipStation(
      { ...VALID_REQUEST, originZip: '' },
      VALID_CREDENTIALS,
    );
    expect(rates).toEqual([]);
  });

  it('returns empty array when destinationZip is missing', async () => {
    const rates = await fetchRatesFromShipStation(
      { ...VALID_REQUEST, destinationZip: '' },
      VALID_CREDENTIALS,
    );
    expect(rates).toEqual([]);
  });

  it('returns empty array when weight is negative', async () => {
    const rates = await fetchRatesFromShipStation(
      { ...VALID_REQUEST, weight: -1 },
      VALID_CREDENTIALS,
    );
    expect(rates).toEqual([]);
  });

  it('returns empty array when weight is NaN', async () => {
    const rates = await fetchRatesFromShipStation(
      { ...VALID_REQUEST, weight: NaN },
      VALID_CREDENTIALS,
    );
    expect(rates).toEqual([]);
  });

  it('returns empty array when apiKey is missing', async () => {
    const rates = await fetchRatesFromShipStation(VALID_REQUEST, { apiKey: '', apiSecret: 'secret' });
    expect(rates).toEqual([]);
  });

  it('returns empty array when apiSecret is missing', async () => {
    const rates = await fetchRatesFromShipStation(VALID_REQUEST, { apiKey: 'key', apiSecret: '' });
    expect(rates).toEqual([]);
  });

  it('returns empty array for valid request (stub implementation)', async () => {
    // Stub always returns [] until real API wired
    const rates = await fetchRatesFromShipStation(VALID_REQUEST, VALID_CREDENTIALS);
    expect(rates).toEqual([]);
  });

  it('allows weight=0 (massless digital product)', async () => {
    const rates = await fetchRatesFromShipStation(
      { ...VALID_REQUEST, weight: 0 },
      VALID_CREDENTIALS,
    );
    // Stub returns [] — no throw expected
    expect(rates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. selectBestRate
// ---------------------------------------------------------------------------

describe('selectBestRate', () => {
  it('returns null for empty array', () => {
    expect(selectBestRate([])).toBeNull();
  });

  it('returns null for empty-like input (undefined-safe via guard)', () => {
    // @ts-expect-error testing null input guard
    expect(selectBestRate(null)).toBeNull();
  });

  it('returns the only rate if array has one element', () => {
    expect(selectBestRate([RATE_A])).toEqual(RATE_A);
  });

  it('returns the lowest-cost rate from two rates', () => {
    expect(selectBestRate([RATE_A, RATE_B])).toEqual(RATE_B);
  });

  it('returns the lowest-cost rate from multiple rates', () => {
    expect(selectBestRate([RATE_A, RATE_B, RATE_C])).toEqual(RATE_B);
  });

  it('returns first rate if all rates are equal', () => {
    const rateX: ShipStationRate = { carrierCode: 'ups', serviceCode: 'ups_ground', rate: 8.50 };
    const rateY: ShipStationRate = { carrierCode: 'stamps_com', serviceCode: 'usps_priority_mail', rate: 8.50 };
    // Both equal; first should be returned (stable: reduce keeps first on tie)
    expect(selectBestRate([RATE_A, rateX, rateY])).toEqual(RATE_A);
  });

  it('handles rates with rate=0 (free shipping)', () => {
    const freeRate: ShipStationRate = { carrierCode: 'stamps_com', serviceCode: 'usps_media_mail', rate: 0 };
    expect(selectBestRate([RATE_A, freeRate, RATE_C])).toEqual(freeRate);
  });

  it('handles a single rate with very high cost', () => {
    const expensive: ShipStationRate = { carrierCode: 'fedex', serviceCode: 'fedex_overnight', rate: 99.99 };
    expect(selectBestRate([expensive])).toEqual(expensive);
  });
});

// ---------------------------------------------------------------------------
// 3. buildRateFetchRequest
// ---------------------------------------------------------------------------

describe('buildRateFetchRequest', () => {
  const VALID_ORDER = {
    orderId: 1001,
    clientId: 42,
    weight: { value: 16, units: 'ounces' as const },
    dimensions: { length: 12, width: 8, height: 4 },
    shipTo: { postalCode: '10001' },
    residential: true,
  };

  it('returns a valid RateFetchRequest for a complete order', () => {
    const req = buildRateFetchRequest(VALID_ORDER, 'stamps_com', '92101');
    expect(req).not.toBeNull();
    expect(req!.orderId).toBe('1001');
    expect(req!.clientId).toBe('42');
    expect(req!.carrierCode).toBe('stamps_com');
    expect(req!.weight).toBeCloseTo(16, 4);
    expect(req!.dimensions).toEqual({ length: 12, width: 8, height: 4 });
    expect(req!.originZip).toBe('92101');
    expect(req!.destinationZip).toBe('10001');
    expect(req!.residential).toBe(true);
  });

  it('returns null when weight is missing', () => {
    const req = buildRateFetchRequest({ ...VALID_ORDER, weight: undefined }, 'stamps_com', '92101');
    expect(req).toBeNull();
  });

  it('returns null when dimensions are missing', () => {
    const req = buildRateFetchRequest({ ...VALID_ORDER, dimensions: undefined }, 'stamps_com', '92101');
    expect(req).toBeNull();
  });

  it('returns null when destination ZIP is missing', () => {
    const req = buildRateFetchRequest(
      { ...VALID_ORDER, shipTo: {} },
      'stamps_com',
      '92101',
    );
    expect(req).toBeNull();
  });

  it('returns null when originZip is empty', () => {
    const req = buildRateFetchRequest(VALID_ORDER, 'stamps_com', '');
    expect(req).toBeNull();
  });

  it('converts grams to ounces for weight', () => {
    const req = buildRateFetchRequest(
      { ...VALID_ORDER, weight: { value: 453.592, units: 'grams' } },
      'stamps_com',
      '92101',
    );
    expect(req).not.toBeNull();
    expect(req!.weight).toBeCloseTo(16, 1);
  });

  it('prefers _enrichedWeight over weight', () => {
    const req = buildRateFetchRequest(
      {
        ...VALID_ORDER,
        weight: { value: 8, units: 'ounces' },
        _enrichedWeight: { value: 24, units: 'ounces' },
      },
      'stamps_com',
      '92101',
    );
    expect(req!.weight).toBeCloseTo(24, 4);
  });

  it('prefers _enrichedDims over dimensions', () => {
    const req = buildRateFetchRequest(
      {
        ...VALID_ORDER,
        dimensions: { length: 5, width: 5, height: 5 },
        _enrichedDims: { length: 12, width: 8, height: 4 },
      },
      'stamps_com',
      '92101',
    );
    expect(req!.dimensions).toEqual({ length: 12, width: 8, height: 4 });
  });

  it('defaults residential to false when not set', () => {
    const req = buildRateFetchRequest(
      { ...VALID_ORDER, residential: undefined },
      'stamps_com',
      '92101',
    );
    expect(req!.residential).toBe(false);
  });
});
