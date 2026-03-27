/**
 * @file server/__tests__/routes/rates.test.ts
 * @description Integration tests for GET /api/rates/:orderId
 *
 * Tests:
 * - Returns rates from ShipStation
 * - Cache hit on second request
 * - Cache invalidation
 * - Error scenarios (401, 429, 500)
 * - Missing params → 400
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import { resetRatesCache } from '../../lib/cache.js';
import { createServerShipStationClient } from '../../lib/shipstation.js';
import { startMockShipStation } from '../helpers/mockShipStation.js';

// Mock the ShipStation client factory
vi.mock('../../lib/shipstation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shipstation.js')>();
  return {
    ...actual,
    createServerShipStationClient: vi.fn(),
  };
});

const mockCreateClient = vi.mocked(createServerShipStationClient);

describe('GET /api/rates/:orderId', () => {
  let mockSS: Awaited<ReturnType<typeof startMockShipStation>>;

  beforeEach(async () => {
    resetRatesCache();
    mockSS = await startMockShipStation();

    // Default mock client that uses the mock server
    mockCreateClient.mockReturnValue({
      getRates: vi.fn().mockResolvedValue({
        rates: [
          {
            rate_id: 'rate-001',
            carrier_id: 'stamps_com',
            carrier_code: 'stamps_com',
            carrier_friendly_name: 'USPS',
            service_code: 'usps_priority_mail',
            service_type: 'USPS Priority Mail',
            shipping_amount: { currency: 'usd', amount: 8.50 },
            other_amount: { currency: 'usd', amount: 0.40 },
            insurance_amount: { currency: 'usd', amount: 0 },
            confirmation_amount: { currency: 'usd', amount: 0 },
            delivery_days: 2,
            estimated_delivery_date: new Date(Date.now() + 2 * 86400000).toISOString(),
            guaranteed_service: false,
          },
        ],
        invalid_rates: [],
      }),
      createLabel: vi.fn(),
      getOrders: vi.fn(),
    });
  });

  afterEach(async () => {
    await mockSS.stop();
    vi.clearAllMocks();
    resetRatesCache();
  });

  it('returns 400 if required query params missing', async () => {
    const res = await request(app)
      .get('/api/rates/ORD-001')
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/fromZip|toZip|weightOz/);
  });

  it('returns 400 for invalid weightOz', async () => {
    const res = await request(app)
      .get('/api/rates/ORD-001?fromZip=92101&toZip=11201&weightOz=abc')
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for negative weightOz', async () => {
    const res = await request(app)
      .get('/api/rates/ORD-001?fromZip=92101&toZip=11201&weightOz=-1')
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns rates from ShipStation', async () => {
    const res = await request(app)
      .get('/api/rates/ORD-001?fromZip=92101&toZip=11201&weightOz=24')
      .expect(200);

    expect(res.body.rates).toBeInstanceOf(Array);
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.fromCache).toBe(false);
    expect(res.body.cachedAt).toBeTruthy();

    const rate = res.body.rates[0];
    expect(rate.carrierCode).toBe('stamps_com');
    expect(rate.serviceCode).toBe('usps_priority_mail');
    expect(rate.totalCost).toBe(8.90);
    expect(rate.shipmentCost).toBe(8.50);
    expect(rate.otherCost).toBe(0.40);
    expect(rate.deliveryDays).toBe(2);
  });

  it('returns cached rates on second request', async () => {
    // First request — cache miss
    await request(app)
      .get('/api/rates/ORD-002?fromZip=92101&toZip=11201&weightOz=24')
      .expect(200);

    // Second request — cache hit
    const res = await request(app)
      .get('/api/rates/ORD-002?fromZip=92101&toZip=11201&weightOz=24')
      .expect(200);

    expect(res.body.fromCache).toBe(true);
    expect(res.body.cachedAt).toBeTruthy();

    // ShipStation should only be called once (first request)
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it('different params create different cache keys', async () => {
    await request(app)
      .get('/api/rates/ORD-003?fromZip=92101&toZip=11201&weightOz=24')
      .expect(200);

    const res = await request(app)
      .get('/api/rates/ORD-003?fromZip=92101&toZip=10001&weightOz=24')
      .expect(200);

    // Different toZip = different cache key = cache miss
    expect(res.body.fromCache).toBe(false);
  });

  it('returns 401 on ShipStation auth error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn().mockRejectedValue(new ShipStationError('Auth failed', 'AUTH_ERROR', 401)),
      createLabel: vi.fn(),
      getOrders: vi.fn(),
    });

    const res = await request(app)
      .get('/api/rates/ORD-004?fromZip=92101&toZip=11201&weightOz=24')
      .expect(401);

    expect(res.body.code).toBe('AUTH_ERROR');
  });

  it('returns 429 on ShipStation rate limit', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn().mockRejectedValue(new ShipStationError('Rate limited', 'RATE_LIMITED', 429, 30)),
      createLabel: vi.fn(),
      getOrders: vi.fn(),
    });

    const res = await request(app)
      .get('/api/rates/ORD-005?fromZip=92101&toZip=11201&weightOz=24')
      .expect(429);

    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.retryAfterSecs).toBe(30);
  });

  it('returns 502 on ShipStation server error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn().mockRejectedValue(new ShipStationError('Server error', 'SERVER_ERROR', 500)),
      createLabel: vi.fn(),
      getOrders: vi.fn(),
    });

    const res = await request(app)
      .get('/api/rates/ORD-006?fromZip=92101&toZip=11201&weightOz=24')
      .expect(502);

    expect(res.body.code).toBe('UPSTREAM_ERROR');
  });

  it('returns cache stats at /api/rates/cache/stats', async () => {
    const res = await request(app)
      .get('/api/rates/cache/stats')
      .expect(200);

    expect(typeof res.body.hits).toBe('number');
    expect(typeof res.body.misses).toBe('number');
    expect(typeof res.body.size).toBe('number');
    expect(typeof res.body.hitRate).toBe('string');
  });
});
