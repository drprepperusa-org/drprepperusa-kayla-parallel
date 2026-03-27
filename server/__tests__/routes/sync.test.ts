/**
 * @file server/__tests__/routes/sync.test.ts
 * @description Integration tests for POST /api/sync
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import { createServerShipStationClient } from '../../lib/shipstation.js';

vi.mock('../../lib/shipstation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shipstation.js')>();
  return {
    ...actual,
    createServerShipStationClient: vi.fn(),
  };
});

const mockCreateClient = vi.mocked(createServerShipStationClient);

const MOCK_ORDERS_RESPONSE = {
  orders: [
    {
      orderId: 100001,
      orderNumber: 'ORD-100001',
      orderStatus: 'awaiting_shipment',
      orderDate: new Date().toISOString(),
      createDate: new Date().toISOString(),
      modifyDate: new Date().toISOString(),
      billTo: { name: 'Test Customer' },
      shipTo: {
        name: 'Test Customer',
        street1: '123 Main St',
        city: 'Brooklyn',
        state: 'NY',
        postalCode: '11201',
        country: 'US',
        residential: true,
      },
      items: [{ lineItemKey: 'li-1', sku: 'PREP-001', name: '72-Hour Kit', quantity: 2 }],
      weight: { value: 24, units: 'ounces' },
      storeId: 101,
    },
    {
      orderId: 100002,
      orderNumber: 'ORD-100002',
      orderStatus: 'shipped',
      orderDate: new Date().toISOString(),
      createDate: new Date().toISOString(),
      modifyDate: new Date().toISOString(),
      billTo: { name: 'Shipped Customer' },
      shipTo: {
        name: 'Shipped Customer',
        street1: '456 Oak Ave',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
        residential: false,
      },
      items: [],
      weight: { value: 16, units: 'ounces' },
      storeId: 201,
    },
  ],
  total: 2,
  page: 1,
  pages: 1,
};

describe('POST /api/sync', () => {
  beforeEach(() => {
    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      createLabel: vi.fn(),
      getOrders: vi.fn().mockResolvedValue(MOCK_ORDERS_RESPONSE),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncs orders without lastSyncTime (full sync)', async () => {
    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(200);

    expect(res.body.syncedAt).toBeTruthy();
    expect(res.body.fetchedCount).toBe(2);
    expect(typeof res.body.newOrders).toBe('number');
    expect(typeof res.body.updatedOrders).toBe('number');
    expect(res.body.orders).toHaveLength(2);
  });

  it('syncs orders with lastSyncTime', async () => {
    const lastSyncTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const res = await request(app)
      .post('/api/sync')
      .send({ lastSyncTime })
      .expect(200);

    expect(res.body.syncedAt).toBeTruthy();
    expect(res.body.fetchedCount).toBe(2);
  });

  it('returns 400 for invalid lastSyncTime', async () => {
    const res = await request(app)
      .post('/api/sync')
      .send({ lastSyncTime: 'not-a-date' })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('normalizes order fields correctly', async () => {
    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(200);

    const order = res.body.orders[0];
    expect(order.id).toBe('100001');
    expect(order.orderNum).toBe('ORD-100001');
    expect(order.customer).toBe('Test Customer');
    expect(order.status).toBe('awaiting_shipment');
    expect(order.shipTo.city).toBe('Brooklyn');
    expect(order.shipTo.residential).toBe(true);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].sku).toBe('PREP-001');
    expect(order.itemCount).toBe(2);
    expect(order.weightOz).toBe(24);
    expect(order.externallyShipped).toBe(false);
  });

  it('handles empty orders response', async () => {
    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      createLabel: vi.fn(),
      getOrders: vi.fn().mockResolvedValue({ orders: [], total: 0, page: 1, pages: 1 }),
    });

    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(200);

    expect(res.body.fetchedCount).toBe(0);
    expect(res.body.orders).toHaveLength(0);
  });

  it('returns 401 on auth error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      createLabel: vi.fn(),
      getOrders: vi.fn().mockRejectedValue(new ShipStationError('Auth failed', 'AUTH_ERROR', 401)),
    });

    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(401);

    expect(res.body.code).toBe('AUTH_ERROR');
  });

  it('returns 429 on rate limit', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      createLabel: vi.fn(),
      getOrders: vi.fn().mockRejectedValue(new ShipStationError('Rate limited', 'RATE_LIMITED', 429, 60)),
    });

    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(429);

    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('returns 502 on upstream error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      createLabel: vi.fn(),
      getOrders: vi.fn().mockRejectedValue(new ShipStationError('Server down', 'SERVER_ERROR', 500)),
    });

    const res = await request(app)
      .post('/api/sync')
      .send({})
      .expect(502);

    expect(res.body.code).toBe('UPSTREAM_ERROR');
  });
});
