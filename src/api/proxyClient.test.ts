/**
 * @file src/api/proxyClient.test.ts
 * @description Tests for client-side proxy API functions.
 *
 * Covers:
 *   1. fetchRatesFromProxy — 200, 401, 429, 502, network error
 *   2. createLabelViaProxy — 200, 400, 401, 429, 502
 *   3. syncViaProxy — 200, 401, 429, 502
 *   4. fetchBillingSettingsFromProxy — 200, 401, 404
 *   5. Response shape validation (ok: true → data, ok: false → error+code)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRatesFromProxy,
  createLabelViaProxy,
  syncViaProxy,
  fetchBillingSettingsFromProxy,
  type GetRatesResponse,
  type CreateLabelProxyRequest,
  type SyncProxyResponse,
  type BillingSettingsProxyResponse,
} from './proxyClient';

// ─────────────────────────────────────────────────────────────────────────────
// Mock global fetch
// ─────────────────────────────────────────────────────────────────────────────

let fetchMock: { mockResolvedValueOnce: (v: unknown) => void; mockRejectedValueOnce: (v: unknown) => void; mock: { calls: unknown[] } };

beforeEach(() => {
  fetchMock = vi.fn() as typeof fetchMock;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockFetchSuccess<T>(data: T, status = 200): void {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

function mockFetchError(status: number, error: string, code: string): void {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error, code }),
  } as Response);
}

function mockFetchNetworkError(): void {
  fetchMock.mockRejectedValueOnce(new Error('Failed to fetch'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub data
// ─────────────────────────────────────────────────────────────────────────────

const STUB_RATES_RESPONSE: GetRatesResponse = {
  rates: [
    {
      carrierCode: 'stamps_com',
      carrierName: 'USPS',
      serviceCode: 'usps_priority_mail',
      serviceName: 'USPS Priority Mail',
      totalCost: 8.50,
      shipmentCost: 8.10,
      otherCost: 0.40,
      deliveryDays: 2,
      estimatedDelivery: '2026-03-28T00:00:00.000Z',
      guaranteedDelivery: false,
      residential: false,
    },
  ],
  fromCache: false,
  cachedAt: null,
};

const STUB_LABEL_RESPONSE = {
  label: {
    trackingNumber: 'STUB-order-123-1234567890',
    shipmentCost: 8.50,
    v2CarrierCode: 'stamps_com',
    serviceCode: 'usps_priority_mail',
    labelUrl: 'https://stub.example.com/label.pdf',
    v1ShippingProviderId: 0,
    v1CarrierCode: 'stamps_com',
    createdAt: new Date().toISOString(),
    voided: false,
  },
};

const STUB_SYNC_RESPONSE: SyncProxyResponse = {
  syncedAt: '2026-03-26T19:00:00.000Z',
  newOrders: 0,
  updatedOrders: 0,
  externallyShipped: 0,
  fetchedCount: 0,
  orders: [],
};

const STUB_BILLING_SETTINGS: BillingSettingsProxyResponse = {
  prepCost: 0,
  packageCostPerOz: 0,
  syncFrequencyMin: 5,
  autoVoidAfterDays: null,
};

const VALID_LABEL_REQUEST: CreateLabelProxyRequest = {
  orderId: 'order-123',
  carrierCode: 'stamps_com',
  serviceCode: 'usps_priority_mail',
  weightOz: 16,
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
    name: 'John Smith',
    street1: '456 Main St',
    city: 'Brooklyn',
    state: 'NY',
    postalCode: '11201',
    country: 'US',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. fetchRatesFromProxy
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRatesFromProxy', () => {
  it('returns ok:true with rates on 200', async () => {
    mockFetchSuccess(STUB_RATES_RESPONSE);
    const result = await fetchRatesFromProxy('order-123');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.rates.length).toBeGreaterThan(0);
      expect(typeof result.data.fromCache).toBe('boolean');
    }
  });

  it('calls correct URL with orderId', async () => {
    mockFetchSuccess(STUB_RATES_RESPONSE);
    await fetchRatesFromProxy('order-abc');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rates/order-abc',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('URL-encodes orderId', async () => {
    mockFetchSuccess(STUB_RATES_RESPONSE);
    await fetchRatesFromProxy('order with spaces');
    const calledUrl = (fetchMock.mock.calls[0] as [string, ...unknown[]])[0];
    expect(calledUrl).not.toContain(' ');
    expect(calledUrl).toContain('order%20with%20spaces');
  });

  it('returns ok:false with status 401 on auth error', async () => {
    mockFetchError(401, 'Missing authentication.', 'AUTH_MISSING');
    const result = await fetchRatesFromProxy('order-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe('AUTH_MISSING');
    }
  });

  it('returns ok:false with status 429 on rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded.', 'RATE_LIMITED');
    const result = await fetchRatesFromProxy('order-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe('RATE_LIMITED');
    }
  });

  it('returns ok:false with status 502 on upstream error', async () => {
    mockFetchError(502, 'An internal error occurred.', 'RATES_UPSTREAM_ERROR');
    const result = await fetchRatesFromProxy('order-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
    }
  });

  it('returns ok:false on network error', async () => {
    mockFetchNetworkError();
    const result = await fetchRatesFromProxy('order-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.error).toContain('Failed to fetch');
    }
  });

  it('sends x-api-key header', async () => {
    mockFetchSuccess(STUB_RATES_RESPONSE);
    await fetchRatesFromProxy('order-1');
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-api-key']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. createLabelViaProxy
// ─────────────────────────────────────────────────────────────────────────────

describe('createLabelViaProxy', () => {
  it('returns ok:true with label on 200', async () => {
    mockFetchSuccess(STUB_LABEL_RESPONSE);
    const result = await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.label).toBeDefined();
      expect(typeof result.data.label.trackingNumber).toBe('string');
    }
  });

  it('sends POST to /api/labels', async () => {
    mockFetchSuccess(STUB_LABEL_RESPONSE);
    await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/labels',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('serializes request body as JSON', async () => {
    mockFetchSuccess(STUB_LABEL_RESPONSE);
    await createLabelViaProxy(VALID_LABEL_REQUEST);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    expect(init.body).toBeDefined();
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed['orderId']).toBe('order-123');
    expect(parsed['carrierCode']).toBe('stamps_com');
  });

  it('returns ok:false with 401 on missing credentials', async () => {
    mockFetchError(401, 'Missing authentication.', 'AUTH_MISSING');
    const result = await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it('returns ok:false with 429 on rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded.', 'RATE_LIMITED');
    const result = await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
    }
  });

  it('returns ok:false with 502 on upstream error', async () => {
    mockFetchError(502, 'An internal error occurred.', 'LABEL_UPSTREAM_ERROR');
    const result = await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
    }
  });

  it('returns ok:false on network error', async () => {
    mockFetchNetworkError();
    const result = await createLabelViaProxy(VALID_LABEL_REQUEST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NETWORK_ERROR');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. syncViaProxy
// ─────────────────────────────────────────────────────────────────────────────

describe('syncViaProxy', () => {
  it('returns ok:true with sync stats on 200', async () => {
    mockFetchSuccess(STUB_SYNC_RESPONSE);
    const result = await syncViaProxy(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.syncedAt).toBe('string');
      expect(typeof result.data.newOrders).toBe('number');
      expect(typeof result.data.updatedOrders).toBe('number');
      expect(typeof result.data.externallyShipped).toBe('number');
      expect(typeof result.data.fetchedCount).toBe('number');
    }
  });

  it('sends POST to /api/sync', async () => {
    mockFetchSuccess(STUB_SYNC_RESPONSE);
    await syncViaProxy(null);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends lastSyncTime as null in body for full sync', async () => {
    mockFetchSuccess(STUB_SYNC_RESPONSE);
    await syncViaProxy(null);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const parsed = JSON.parse(init.body as string) as { lastSyncTime: null };
    expect(parsed.lastSyncTime).toBeNull();
  });

  it('serializes lastSyncTime as ISO string', async () => {
    const date = new Date('2026-01-15T12:00:00.000Z');
    mockFetchSuccess(STUB_SYNC_RESPONSE);
    await syncViaProxy(date);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const parsed = JSON.parse(init.body as string) as { lastSyncTime: string };
    expect(parsed.lastSyncTime).toBe('2026-01-15T12:00:00.000Z');
  });

  it('returns ok:false with 401 on missing credentials', async () => {
    mockFetchError(401, 'Missing authentication.', 'AUTH_MISSING');
    const result = await syncViaProxy(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('returns ok:false with 429 on rate limit', async () => {
    mockFetchError(429, 'Rate limit exceeded.', 'RATE_LIMITED');
    const result = await syncViaProxy(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
  });

  it('returns ok:false with 502 on upstream error', async () => {
    mockFetchError(502, 'An internal error occurred.', 'SYNC_UPSTREAM_ERROR');
    const result = await syncViaProxy(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
  });

  it('returns ok:false on network error', async () => {
    mockFetchNetworkError();
    const result = await syncViaProxy(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NETWORK_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fetchBillingSettingsFromProxy
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchBillingSettingsFromProxy', () => {
  it('returns ok:true with billing settings on 200', async () => {
    mockFetchSuccess(STUB_BILLING_SETTINGS);
    const result = await fetchBillingSettingsFromProxy();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.prepCost).toBe('number');
      expect(typeof result.data.packageCostPerOz).toBe('number');
      expect([5, 10, 30, 60]).toContain(result.data.syncFrequencyMin);
    }
  });

  it('sends GET to /api/settings/billing', async () => {
    mockFetchSuccess(STUB_BILLING_SETTINGS);
    await fetchBillingSettingsFromProxy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/billing',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns ok:false with 401 on auth error', async () => {
    mockFetchError(401, 'Missing authentication.', 'AUTH_MISSING');
    const result = await fetchBillingSettingsFromProxy();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it('returns ok:false with 404 when no settings configured (first-run)', async () => {
    mockFetchError(404, 'No settings configured.', 'NOT_FOUND');
    const result = await fetchBillingSettingsFromProxy();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe('NOT_FOUND');
    }
  });

  it('returns ok:false on network error', async () => {
    mockFetchNetworkError();
    const result = await fetchBillingSettingsFromProxy();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NETWORK_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. No credentials in client functions
// ─────────────────────────────────────────────────────────────────────────────

describe('Security: no ShipStation credentials in client functions', () => {
  it('fetchRatesFromProxy does not pass SHIPSTATION_API_KEY in request', async () => {
    mockFetchSuccess(STUB_RATES_RESPONSE);
    await fetchRatesFromProxy('order-1');
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const body = (init.body as string | undefined) ?? '';
    expect(body).not.toContain('SHIPSTATION');
    expect(body).not.toContain('apiKey');
    expect(body).not.toContain('apiSecret');
  });

  it('createLabelViaProxy does not pass SHIPSTATION credentials in request', async () => {
    mockFetchSuccess(STUB_LABEL_RESPONSE);
    await createLabelViaProxy(VALID_LABEL_REQUEST);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const headers = JSON.stringify(init.headers);
    expect(headers).not.toContain('SHIPSTATION');
    const body = (init.body as string | undefined) ?? '';
    expect(body).not.toContain('apiKey');
    expect(body).not.toContain('apiSecret');
  });

  it('syncViaProxy does not pass ShipStation credentials in request body', async () => {
    mockFetchSuccess(STUB_SYNC_RESPONSE);
    await syncViaProxy(null);
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1];
    const body = (init.body as string | undefined) ?? '';
    expect(body).not.toContain('apiKey');
    expect(body).not.toContain('apiSecret');
    expect(body).not.toContain('SHIPSTATION');
  });
});
