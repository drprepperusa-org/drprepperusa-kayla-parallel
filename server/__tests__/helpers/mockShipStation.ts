/**
 * @file server/__tests__/helpers/mockShipStation.ts
 * @description Mock ShipStation HTTP server for integration tests.
 *
 * Starts a real HTTP server that mimics ShipStation V1 + V2 APIs.
 * Endpoints:
 *   POST /v2/rates/estimate   → 200 with mock rates
 *   POST /v2/labels           → 200 with mock label
 *   GET  /orders              → 200 with mock orders (V1 base)
 *
 * Usage:
 *   const mock = await startMockShipStation();
 *   // ... tests that hit mock.baseUrlV1 and mock.baseUrlV2
 *   await mock.stop();
 */

import http, { type IncomingMessage, type ServerResponse } from 'http';

interface MockShipStation {
  baseUrlV1: string;
  baseUrlV2: string;
  stop: () => Promise<void>;
  /** Set next response for a specific path */
  setResponse: (path: string, status: number, body: unknown) => void;
  /** Track calls received */
  calls: Array<{ method: string; path: string; body?: unknown }>;
  /** Reset calls + overrides */
  reset: () => void;
}

export async function startMockShipStation(): Promise<MockShipStation> {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const overrides = new Map<string, { status: number; body: unknown }>();

  function getDefaultResponse(method: string, urlPath: string): { status: number; body: unknown } {
    if (urlPath.includes('/rates/estimate') || urlPath.includes('/shipments/getrates')) {
      return {
        status: 200,
        body: {
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
            {
              rate_id: 'rate-002',
              carrier_id: 'stamps_com',
              carrier_code: 'stamps_com',
              carrier_friendly_name: 'USPS',
              service_code: 'usps_first_class_mail',
              service_type: 'USPS First Class Mail',
              shipping_amount: { currency: 'usd', amount: 4.25 },
              other_amount: { currency: 'usd', amount: 0.25 },
              insurance_amount: { currency: 'usd', amount: 0 },
              confirmation_amount: { currency: 'usd', amount: 0 },
              delivery_days: 5,
              estimated_delivery_date: new Date(Date.now() + 5 * 86400000).toISOString(),
              guaranteed_service: false,
            },
          ],
          invalid_rates: [],
        },
      };
    }

    if (urlPath.includes('/labels')) {
      return {
        status: 200,
        body: {
          label_id: 'lbl-mock-001',
          status: 'completed',
          tracking_number: 'MOCK9400111899560334077484',
          service_code: 'usps_priority_mail',
          carrier_code: 'stamps_com',
          shipment_cost: { currency: 'usd', amount: 8.50 },
          label_download: {
            pdf: 'https://mock.shipstation.com/label.pdf',
            href: 'https://mock.shipstation.com/label.pdf',
          },
        },
      };
    }

    if (method === 'GET' && (urlPath === '/orders' || urlPath.startsWith('/orders?'))) {
      return {
        status: 200,
        body: {
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
              items: [
                { lineItemKey: 'li-1', sku: 'PREP-001', name: '72-Hour Kit', quantity: 1 },
              ],
              weight: { value: 24, units: 'ounces' },
              storeId: 101,
            },
          ],
          total: 1,
          page: 1,
          pages: 1,
        },
      };
    }

    return { status: 404, body: { error: 'Not found' } };
  }

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => { body += String(chunk); });
    req.on('end', () => {
      const urlPath = req.url ?? '/';
      let parsedBody: unknown;
      try { parsedBody = body ? JSON.parse(body) : undefined; } catch { parsedBody = body; }

      calls.push({ method: req.method ?? 'GET', path: urlPath, body: parsedBody });

      const override = overrides.get(urlPath) ?? overrides.get(urlPath.split('?')[0]);
      const { status, body: respBody } = override ?? getDefaultResponse(req.method ?? 'GET', urlPath);

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(respBody));
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Failed to get server address'));
      }
    });
  });

  const base = `http://127.0.0.1:${port}`;

  return {
    baseUrlV1: base,
    baseUrlV2: `${base}/v2`,
    calls,
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((err) => { if (err) reject(err); else resolve(); });
    }),
    setResponse: (path, status, body) => {
      overrides.set(path, { status, body });
    },
    reset: () => {
      calls.length = 0;
      overrides.clear();
    },
  };
}
