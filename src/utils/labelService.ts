/**
 * labelService.ts — ShipStation label creation service
 *
 * Handles multi-tenant credentials, ShipStation API calls,
 * request validation, and error normalization.
 */

import type { OrderAddress } from '../types/orders';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelRequest {
  orderId: string;
  clientId: string;
  carrierCode: string;
  weight: number;         // ounces
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  originZip: string;
  destinationZip: string;
  residentialFlag: boolean;
  shipFromAddress: OrderAddress;
  shipToAddress: OrderAddress;
}

export interface Label {
  shippingNumber: string;
  labelUrl: string;
  carrierCode: string;
  createdAt: Date;
  status: 'pending' | 'ready' | 'failed';
}

export interface ClientCredentials {
  apiKey: string;
  apiSecret: string;
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class LabelError extends Error {
  constructor(
    message: string,
    public readonly code: 'VALIDATION_ERROR' | 'AUTH_ERROR' | 'API_ERROR' | 'NETWORK_ERROR',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'LabelError';
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateLabelRequest(request: LabelRequest): void {
  if (!request.orderId || request.orderId.trim() === '') {
    throw new LabelError('Order ID is required', 'VALIDATION_ERROR');
  }
  if (!request.clientId || request.clientId.trim() === '') {
    throw new LabelError('Client ID is required', 'VALIDATION_ERROR');
  }
  if (!request.carrierCode || request.carrierCode.trim() === '') {
    throw new LabelError('Carrier code is required', 'VALIDATION_ERROR');
  }
  if (!request.weight || request.weight <= 0) {
    throw new LabelError('Package weight must be greater than 0', 'VALIDATION_ERROR');
  }
  if (
    !request.dimensions ||
    request.dimensions.length <= 0 ||
    request.dimensions.width <= 0 ||
    request.dimensions.height <= 0
  ) {
    throw new LabelError('All package dimensions must be greater than 0', 'VALIDATION_ERROR');
  }
  if (!request.originZip || request.originZip.trim() === '') {
    throw new LabelError('Origin ZIP code is required', 'VALIDATION_ERROR');
  }
  if (!request.destinationZip || request.destinationZip.trim() === '') {
    throw new LabelError('Destination ZIP code is required', 'VALIDATION_ERROR');
  }
  if (!request.shipToAddress) {
    throw new LabelError('Ship-to address is required', 'VALIDATION_ERROR');
  }
  if (!request.shipFromAddress) {
    throw new LabelError('Ship-from address is required', 'VALIDATION_ERROR');
  }
}

function validateCredentials(credentials: ClientCredentials): void {
  if (!credentials.apiKey || credentials.apiKey.trim() === '') {
    throw new LabelError('ShipStation API key is missing', 'AUTH_ERROR');
  }
  if (!credentials.apiSecret || credentials.apiSecret.trim() === '') {
    throw new LabelError('ShipStation API secret is missing', 'AUTH_ERROR');
  }
}

// ─── ShipStation API ──────────────────────────────────────────────────────────

const SHIPSTATION_BASE_URL = 'https://ssapi.shipstation.com';

function buildBasicAuthHeader(apiKey: string, apiSecret: string): string {
  const token = btoa(`${apiKey}:${apiSecret}`);
  return `Basic ${token}`;
}

// decodeBasicAuth has been moved to src/__tests__/utilities/decode-basic-auth.ts (test only).

interface ShipStationShipmentPayload {
  carrierCode: string;
  fromPostalCode: string;
  toPostalCode: string;
  toResidential: boolean;
  weight: { value: number; units: string };
  dimensions: { units: string; length: number; width: number; height: number };
  shipFrom: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  shipTo: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  testLabel: boolean;
}

interface ShipStationResponse {
  trackingNumber?: string;
  labelData?: string;
  labelDownload?: { href?: string; pdf?: string };
  shipmentId?: string;
  carrierCode?: string;
  serviceCode?: string;
  packageCode?: string;
}

// ─── Fetch wrapper (injectable for testing) ───────────────────────────────────

type FetchFn = typeof globalThis.fetch;
let _fetchFn: FetchFn = globalThis.fetch;

/** @internal — for test injection only */
export function __setFetchFn(fn: FetchFn): void {
  _fetchFn = fn;
}
export function __resetFetchFn(): void {
  _fetchFn = globalThis.fetch;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function createLabelWithShipStation(
  request: LabelRequest,
  clientCredentials: ClientCredentials,
): Promise<Label> {
  // 1. Validate
  validateLabelRequest(request);
  validateCredentials(clientCredentials);

  const { apiKey, apiSecret } = clientCredentials;

  // 2. Build ShipStation payload
  const payload: ShipStationShipmentPayload = {
    carrierCode: request.carrierCode,
    fromPostalCode: request.originZip,
    toPostalCode: request.destinationZip,
    toResidential: request.residentialFlag,
    weight: { value: request.weight, units: 'ounces' },
    dimensions: {
      units: 'inches',
      length: request.dimensions.length,
      width: request.dimensions.width,
      height: request.dimensions.height,
    },
    shipFrom: {
      name: request.shipFromAddress.name,
      company: request.shipFromAddress.company,
      street1: request.shipFromAddress.street1,
      street2: request.shipFromAddress.street2,
      city: request.shipFromAddress.city,
      state: request.shipFromAddress.state,
      postalCode: request.shipFromAddress.postalCode,
      country: request.shipFromAddress.country ?? 'US',
    },
    shipTo: {
      name: request.shipToAddress.name,
      company: request.shipToAddress.company,
      street1: request.shipToAddress.street1,
      street2: request.shipToAddress.street2,
      city: request.shipToAddress.city,
      state: request.shipToAddress.state,
      postalCode: request.shipToAddress.postalCode,
      country: request.shipToAddress.country ?? 'US',
    },
    testLabel: false,
  };

  // 3. Call ShipStation /shipments/createlabel
  let response: Response;
  try {
    response = await _fetchFn(`${SHIPSTATION_BASE_URL}/shipments/createlabel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildBasicAuthHeader(apiKey, apiSecret),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new LabelError(
      'Network error connecting to ShipStation. Please check your connection.',
      'NETWORK_ERROR',
    );
  }

  // 4. Handle HTTP errors
  if (response.status === 401) {
    throw new LabelError(
      'ShipStation authentication failed. Please verify your API credentials.',
      'AUTH_ERROR',
      401,
    );
  }
  if (response.status === 400) {
    let detail = '';
    try {
      const body = await response.json() as { message?: string; ExceptionMessage?: string };
      detail = body.message ?? body.ExceptionMessage ?? '';
    } catch {
      /* ignore parse error */
    }
    throw new LabelError(
      `ShipStation rejected the request: ${detail || 'Invalid request data'}`,
      'API_ERROR',
      400,
    );
  }
  if (!response.ok) {
    throw new LabelError(
      `ShipStation returned an error (HTTP ${response.status}). Please try again.`,
      'API_ERROR',
      response.status,
    );
  }

  // 5. Parse response
  let data: ShipStationResponse;
  try {
    data = await response.json() as ShipStationResponse;
  } catch {
    throw new LabelError('Failed to parse ShipStation response', 'API_ERROR');
  }

  const shippingNumber = data.trackingNumber ?? '';
  const labelUrl =
    data.labelDownload?.href ??
    data.labelDownload?.pdf ??
    (data.labelData ? `data:application/pdf;base64,${data.labelData}` : '');

  if (!shippingNumber) {
    throw new LabelError(
      'ShipStation did not return a tracking number. Please try again.',
      'API_ERROR',
    );
  }

  // 6. Return Label
  return {
    shippingNumber,
    labelUrl,
    carrierCode: data.carrierCode ?? request.carrierCode,
    createdAt: new Date(),
    status: 'ready',
  };
}
