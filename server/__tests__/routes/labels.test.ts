/**
 * @file server/__tests__/routes/labels.test.ts
 * @description Integration tests for POST /api/labels
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import { TEST_API_KEY } from '../setup.js';
import { createServerShipStationClient } from '../../lib/shipstation.js';

vi.mock('../../lib/shipstation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/shipstation.js')>();
  return {
    ...actual,
    createServerShipStationClient: vi.fn(),
  };
});

const mockCreateClient = vi.mocked(createServerShipStationClient);

const VALID_BODY = {
  orderId: 'ORD-001',
  carrierCode: 'stamps_com',
  serviceCode: 'usps_priority_mail',
  weightOz: 24,
  dimensions: { lengthIn: 12, widthIn: 8, heightIn: 4 },
  shipFrom: {
    name: 'DrPrepper USA',
    street1: '123 Warehouse Blvd',
    city: 'San Diego',
    state: 'CA',
    postalCode: '92101',
    country: 'US',
  },
  shipTo: {
    name: 'Test Customer',
    street1: '456 Main St',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    country: 'US',
    residential: true,
  },
};

describe('POST /api/labels', () => {
  beforeEach(() => {
    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      getOrders: vi.fn(),
      createLabel: vi.fn().mockResolvedValue({
        label_id: 'lbl-001',
        status: 'completed',
        tracking_number: '9400111899560334077484',
        service_code: 'usps_priority_mail',
        carrier_code: 'stamps_com',
        shipment_cost: { currency: 'usd', amount: 8.50 },
        label_download: {
          pdf: 'https://mock.shipstation.com/label.pdf',
          href: 'https://mock.shipstation.com/label.pdf',
        },
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if body is missing', async () => {
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if orderId is missing', async () => {
    const { orderId: _omit, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/orderId/);
  });

  it('returns 400 if carrierCode is missing', async () => {
    const { carrierCode: _omit, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/carrierCode/);
  });

  it('returns 400 if serviceCode is missing', async () => {
    const { serviceCode: _omit, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/serviceCode/);
  });

  it('returns 400 if weightOz <= 0', async () => {
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send({ ...VALID_BODY, weightOz: 0 })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 if dimensions missing', async () => {
    const { dimensions: _omit, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/dimensions/);
  });

  it('returns 400 if shipTo missing', async () => {
    const { shipTo: _omit, ...body } = VALID_BODY;
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(body)
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.error).toMatch(/shipTo/);
  });

  it('creates label successfully', async () => {
    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(VALID_BODY)
      .expect(200);

    expect(res.body.label).toBeDefined();
    expect(res.body.label.trackingNumber).toBe('9400111899560334077484');
    expect(res.body.label.shipmentCost).toBe(8.50);
    expect(res.body.label.serviceCode).toBe('usps_priority_mail');
    expect(res.body.label.voided).toBe(false);
    expect(res.body.label.labelUrl).toBe('https://mock.shipstation.com/label.pdf');
  });

  it('returns 401 on auth error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      getOrders: vi.fn(),
      createLabel: vi.fn().mockRejectedValue(new ShipStationError('Auth failed', 'AUTH_ERROR', 401)),
    });

    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(VALID_BODY)
      .expect(401);

    expect(res.body.code).toBe('AUTH_ERROR');
  });

  it('returns 429 on rate limit', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      getOrders: vi.fn(),
      createLabel: vi.fn().mockRejectedValue(new ShipStationError('Rate limited', 'RATE_LIMITED', 429, 60)),
    });

    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(VALID_BODY)
      .expect(429);

    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.retryAfterSecs).toBe(60);
  });

  it('returns 400 on ShipStation bad request', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      getOrders: vi.fn(),
      createLabel: vi.fn().mockRejectedValue(new ShipStationError('Invalid service code', 'BAD_REQUEST', 400)),
    });

    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(VALID_BODY)
      .expect(400);

    expect(res.body.code).toBe('UPSTREAM_VALIDATION_ERROR');
  });

  it('returns 502 on server error', async () => {
    const { ShipStationError } = await import('../../lib/shipstation.js');

    mockCreateClient.mockReturnValue({
      getRates: vi.fn(),
      getOrders: vi.fn(),
      createLabel: vi.fn().mockRejectedValue(new ShipStationError('Server down', 'SERVER_ERROR', 500)),
    });

    const res = await request(app)
      .post('/api/labels')
      .set('x-api-key', TEST_API_KEY)
      .send(VALID_BODY)
      .expect(502);

    expect(res.body.code).toBe('UPSTREAM_ERROR');
  });
});
