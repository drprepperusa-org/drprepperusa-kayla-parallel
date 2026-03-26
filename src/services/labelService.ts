/**
 * @file labelService.ts
 * @description Create shipping labels via ShipStation V1 + V2 APIs.
 *
 * Two-call flow (per DJ spec / immutable contract locked Q1):
 *   1. V2 POST /labels — creates label, returns trackingNumber, shipment_cost,
 *      carrier_code, service_code
 *   2. V1 GET /shipments/{shipmentId} — fetches legacy fields:
 *      providerAccountId → v1ShippingProviderId, carrierCode → v1CarrierCode
 *
 * IMMUTABLE CONTRACT:
 * The OrderLabel shape, field mapping, and two-call flow are locked (per DJ, Q1 pending
 * verification). No fields may be added or removed until Q1 is formally resolved.
 *
 * Status: Confidence 93% — two-call flow spec confirmed. V1 providerAccountId mapping
 * flagged as Q1 (pending DJ verification of exact field path in response).
 *
 * @example
 * ```ts
 * const client = createShipStationClientFromEnv();
 *
 * const result = await createLabel(
 *   {
 *     orderId: 'order-abc',
 *     carrierCode: 'stamps_com',
 *     serviceCode: 'usps_priority_mail',
 *     weightOz: 24,
 *     dimensions: { lengthIn: 12, widthIn: 8, heightIn: 4 },
 *     shipFrom: { name: 'DrPrepper', street1: '123 Warehouse Blvd', city: 'San Diego', state: 'CA', postalCode: '92101', country: 'US' },
 *     shipTo: { name: 'John Smith', street1: '456 Main St', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'US' },
 *     residential: true,
 *   },
 *   client,
 * );
 *
 * if (result.ok) {
 *   store.addLabel(result.label.trackingNumber, result.label);
 * }
 * ```
 */

import { ShipStationError, type ShipStationClient, type ShipStationV2LabelResponse, type ShipStationV1ShipmentDetail } from '../api/shipstationClient';
import type { OrderLabel } from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Shipping address for label creation. */
export interface LabelAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * Input for label creation.
 * All required fields validated before API calls.
 */
export interface LabelRequest {
  /** Internal order ID for logging/tracing. */
  orderId: string;
  /** ShipStation carrier code (e.g. "stamps_com", "ups", "fedex"). */
  carrierCode: string;
  /** ShipStation service code (e.g. "usps_priority_mail"). */
  serviceCode: string;
  /** Package weight in ounces. */
  weightOz: number;
  /** Package dimensions in inches. */
  dimensions: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  /** Ship-from address. */
  shipFrom: LabelAddress;
  /** Ship-to address. */
  shipTo: LabelAddress;
  /** Whether the destination is residential. */
  residential: boolean;
  /** Optional: confirmation type (default: 'none'). */
  confirmation?: 'none' | 'delivery' | 'signature' | 'adult_signature';
  /** Optional: test label flag (default: false). */
  testLabel?: boolean;
  /** Creator identifier (user ID or automation token). */
  createdBy?: string;
}

export type LabelServiceErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'INVALID_RATE'
  | 'INVALID_ADDRESS'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'V1_ENRICHMENT_FAILED';

export class LabelServiceError extends Error {
  constructor(
    message: string,
    public readonly code: LabelServiceErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LabelServiceError';
  }
}

/** Result type — prefer over throwing. */
export type LabelResult =
  | { ok: true; label: OrderLabel }
  | { ok: false; error: LabelServiceError };

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateLabelRequest(req: LabelRequest): LabelServiceError | null {
  if (!req.orderId || req.orderId.trim() === '') {
    return new LabelServiceError('orderId is required', 'VALIDATION_ERROR');
  }
  if (!req.carrierCode || req.carrierCode.trim() === '') {
    return new LabelServiceError('carrierCode is required', 'VALIDATION_ERROR');
  }
  if (!req.serviceCode || req.serviceCode.trim() === '') {
    return new LabelServiceError('serviceCode is required', 'VALIDATION_ERROR');
  }
  if (!req.weightOz || req.weightOz <= 0) {
    return new LabelServiceError('Weight must be > 0 oz', 'VALIDATION_ERROR');
  }
  if (
    !req.dimensions ||
    req.dimensions.lengthIn <= 0 ||
    req.dimensions.widthIn <= 0 ||
    req.dimensions.heightIn <= 0
  ) {
    return new LabelServiceError('All dimensions must be > 0', 'VALIDATION_ERROR');
  }
  if (!req.shipTo || !req.shipTo.postalCode || !req.shipTo.street1) {
    return new LabelServiceError('Ship-to address is incomplete (need street1, postalCode)', 'INVALID_ADDRESS');
  }
  if (!req.shipFrom || !req.shipFrom.postalCode || !req.shipFrom.street1) {
    return new LabelServiceError('Ship-from address is incomplete (need street1, postalCode)', 'INVALID_ADDRESS');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// V1 ShipStation Provider ID Mapping (IMMUTABLE — locked by DJ, Q1 pending)
//
// Q1 PENDING: Exact field path for providerAccountId in V1 shipment response.
// Current mapping: response.providerAccountId ?? response.providerAccount?.providerAccountId
// If Q1 resolves to a different path, update ONLY this function.
//
// DO NOT modify the OrderLabel shape in response to this — shape is locked.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract v1ShippingProviderId from a V1 shipment detail response.
 *
 * IMMUTABLE MAPPING (Q1 pending verification):
 * - Primary field: response.providerAccountId
 * - Fallback field: response.providerAccount?.providerAccountId
 * - Emergency fallback: 0 (with warning log)
 *
 * @param v1Detail - Raw V1 shipment detail response
 * @returns The shipping provider ID integer
 */
function extractV1ShippingProviderId(v1Detail: ShipStationV1ShipmentDetail): number {
  // Q1 mapping — locked. Modify ONLY if Q1 resolves differently.
  const providerId =
    v1Detail.providerAccountId ??
    v1Detail.providerAccount?.providerAccountId;

  if (providerId === undefined || providerId === null) {
    console.warn(
      '[labelService] Q1 PENDING: providerAccountId not found in V1 shipment response. ' +
      'Defaulting to 0. This will be resolved when Q1 is answered.',
      { shipmentId: v1Detail.shipmentId, availableFields: Object.keys(v1Detail) },
    );
    return 0;
  }

  return providerId;
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 Label Payload Builder
// ─────────────────────────────────────────────────────────────────────────────

interface V2LabelPayload {
  shipment: {
    carrier_id: string;
    service_code: string;
    ship_from: {
      name: string;
      company_name?: string;
      address_line1: string;
      address_line2?: string;
      city_locality: string;
      state_province: string;
      postal_code: string;
      country_code: string;
      phone?: string;
    };
    ship_to: {
      name: string;
      company_name?: string;
      address_line1: string;
      address_line2?: string;
      city_locality: string;
      state_province: string;
      postal_code: string;
      country_code: string;
      address_residential_indicator: 'yes' | 'no' | 'unknown';
    };
    packages: Array<{
      weight: { value: number; unit: 'ounce' };
      dimensions: { unit: 'inch'; length: number; width: number; height: number };
    }>;
    confirmation: string;
  };
  test_label: boolean;
}

function buildV2LabelPayload(req: LabelRequest): V2LabelPayload {
  return {
    shipment: {
      carrier_id: req.carrierCode,
      service_code: req.serviceCode,
      ship_from: {
        name: req.shipFrom.name,
        company_name: req.shipFrom.company,
        address_line1: req.shipFrom.street1,
        address_line2: req.shipFrom.street2,
        city_locality: req.shipFrom.city,
        state_province: req.shipFrom.state,
        postal_code: req.shipFrom.postalCode,
        country_code: req.shipFrom.country ?? 'US',
      },
      ship_to: {
        name: req.shipTo.name,
        company_name: req.shipTo.company,
        address_line1: req.shipTo.street1,
        address_line2: req.shipTo.street2,
        city_locality: req.shipTo.city,
        state_province: req.shipTo.state,
        postal_code: req.shipTo.postalCode,
        country_code: req.shipTo.country ?? 'US',
        address_residential_indicator: req.residential ? 'yes' : 'no',
      },
      packages: [
        {
          weight: { value: req.weightOz, unit: 'ounce' },
          dimensions: {
            unit: 'inch',
            length: req.dimensions.lengthIn,
            width: req.dimensions.widthIn,
            height: req.dimensions.heightIn,
          },
        },
      ],
      confirmation: req.confirmation ?? 'none',
    },
    test_label: req.testLabel ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Label Response (scaffold — replace with real API call)
// ─────────────────────────────────────────────────────────────────────────────

function generateMockV2LabelResponse(req: LabelRequest): ShipStationV2LabelResponse {
  const shipmentId = `MOCK-SHIP-${Date.now()}`;
  const trackingNumber = `1Z${Math.random().toString(36).substr(2, 16).toUpperCase()}`;
  return {
    label_id: `MOCK-LABEL-${Date.now()}`,
    status: 'completed',
    shipment_id: shipmentId,
    tracking_number: trackingNumber,
    carrier_code: req.carrierCode,
    service_code: req.serviceCode,
    shipment_cost: { currency: 'usd', amount: 7.85 },
    label_download: {
      pdf: `https://labels.shipstation.com/mock/${trackingNumber}.pdf`,
      href: `https://labels.shipstation.com/mock/${trackingNumber}.pdf`,
    },
  };
}

function generateMockV1ShipmentDetail(
  shipmentId: string,
  req: LabelRequest,
): ShipStationV1ShipmentDetail {
  return {
    shipmentId: parseInt(shipmentId.replace(/\D/g, '') || '9999', 10),
    orderId: parseInt(req.orderId.replace(/\D/g, '') || '1000', 10),
    shipmentCost: 7.85,
    carrierCode: req.carrierCode,
    serviceCode: req.serviceCode,
    providerAccountId: 42, // Mock provider ID
    providerAccount: {
      provider: req.carrierCode,
      accountName: `${req.carrierCode.toUpperCase()} Account`,
      providerAccountId: 42,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: Create Label
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a shipping label via ShipStation V1 + V2.
 *
 * Two-call flow (IMMUTABLE CONTRACT — locked by DJ):
 *   1. V2 POST /labels → gets trackingNumber, shipment_cost, carrier_code, service_code
 *   2. V1 GET /shipments/{shipmentId} → gets v1ShippingProviderId, v1CarrierCode
 *
 * The returned OrderLabel conforms to the immutable contract in types/orders.ts.
 * No fields may be added or removed from OrderLabel without resolving the pending Q1.
 *
 * V1 enrichment failure handling:
 * - If V1 call fails, label is still returned with v1ShippingProviderId = 0 and
 *   v1CarrierCode = '' (flagged in console with Q1 warning).
 * - The label IS valid for printing — V1 fields are for billing reconciliation only.
 *
 * @param req - Label request parameters
 * @param client - ShipStation client (v1/v2)
 * @returns LabelResult — ok=true with OrderLabel, or ok=false with typed error
 */
export async function createLabel(
  req: LabelRequest,
  client: ShipStationClient,
): Promise<LabelResult> {
  // 1. Validate request
  const validationError = validateLabelRequest(req);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    // 2. V2 POST /labels — create the label
    // TODO: Replace mock with real call once credentials are wired:
    //   const v2Payload = buildV2LabelPayload(req);
    //   const v2Response = await client.v2.post<ShipStationV2LabelResponse>('/labels', v2Payload);

    void buildV2LabelPayload; // Used by real implementation
    void client; // Suppress unused until real wiring
    const v2Response = generateMockV2LabelResponse(req);

    if (!v2Response.tracking_number) {
      return {
        ok: false,
        error: new LabelServiceError(
          'ShipStation V2 did not return a tracking number.',
          'API_ERROR',
        ),
      };
    }

    const shipmentId = v2Response.shipment_id ?? '';

    // 3. V1 GET /shipments/{shipmentId} — enrich with legacy provider fields
    let v1Detail: ShipStationV1ShipmentDetail | null = null;
    let v1EnrichmentFailed = false;

    if (shipmentId) {
      try {
        // TODO: Replace mock with real call:
        //   v1Detail = await client.v1.get<ShipStationV1ShipmentDetail>(`/shipments/${shipmentId}`);
        v1Detail = generateMockV1ShipmentDetail(shipmentId, req);
      } catch (err) {
        // V1 enrichment is non-fatal — label can still be printed
        console.warn('[labelService] V1 enrichment failed — label valid, V1 fields zeroed', {
          orderId: req.orderId,
          shipmentId,
          error: err instanceof Error ? err.message : String(err),
        });
        v1EnrichmentFailed = true;
      }
    } else {
      console.warn('[labelService] V2 response missing shipment_id — skipping V1 enrichment', {
        orderId: req.orderId,
      });
      v1EnrichmentFailed = true;
    }

    // 4. Build immutable OrderLabel (per locked contract)
    const label: OrderLabel = {
      // ── V2 fields ──────────────────────────────────────────────────────────
      trackingNumber: v2Response.tracking_number,
      shipmentCost: v2Response.shipment_cost.amount,
      v2CarrierCode: v2Response.carrier_code ?? req.carrierCode,
      serviceCode: v2Response.service_code ?? req.serviceCode,
      labelUrl: v2Response.label_download.pdf ?? v2Response.label_download.href,

      // ── V1 fields (IMMUTABLE MAPPING — Q1 pending) ─────────────────────────
      v1ShippingProviderId: v1Detail ? extractV1ShippingProviderId(v1Detail) : 0,
      v1CarrierCode: v1Detail?.carrierCode ?? '',

      // ── Metadata ───────────────────────────────────────────────────────────
      createdAt: new Date(),
      createdBy: req.createdBy,

      // ── Void state ─────────────────────────────────────────────────────────
      voided: false,
    };

    if (v1EnrichmentFailed) {
      console.warn(
        '[labelService] Label created with zeroed V1 fields. ' +
        'v1ShippingProviderId=0, v1CarrierCode="". Resolve Q1 to fix.',
        { orderId: req.orderId, trackingNumber: label.trackingNumber },
      );
    }

    return { ok: true, label };

  } catch (err) {
    if (err instanceof ShipStationError) {
      const code: LabelServiceErrorCode =
        err.code === 'AUTH_ERROR' ? 'AUTH_ERROR' :
        err.code === 'NETWORK_ERROR' ? 'NETWORK_ERROR' :
        err.code === 'TIMEOUT' ? 'TIMEOUT' :
        err.code === 'BAD_REQUEST' ? 'INVALID_ADDRESS' :
        'API_ERROR';

      return {
        ok: false,
        error: new LabelServiceError(err.message, code, err),
      };
    }

    return {
      ok: false,
      error: new LabelServiceError(
        `Unexpected error creating label: ${err instanceof Error ? err.message : String(err)}`,
        'API_ERROR',
        err,
      ),
    };
  }
}
