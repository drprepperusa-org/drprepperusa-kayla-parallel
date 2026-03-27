/**
 * @file server/routes/labels.ts
 * @description POST /api/labels — create shipping label via ShipStation V2.
 *
 * Flow:
 *   1. Validate request body (orderId, carrierCode, serviceCode, weightOz, dims, addresses)
 *   2. POST to ShipStation V2 /labels
 *   3. Normalize response → OrderLabel shape
 *   4. Return 200 { label }
 *
 * Error handling:
 *   - 400: validation failure
 *   - 401: ShipStation auth failed
 *   - 429: rate limited
 *   - 502: ShipStation error
 */

import { Router, type Request, type Response } from 'express';
import { createServerShipStationClient, ShipStationError } from '../lib/shipstation.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes:labels');

export const labelsRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Request body type
// ─────────────────────────────────────────────────────────────────────────────

interface LabelAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  residential?: boolean;
}

interface CreateLabelBody {
  orderId: string;
  carrierCode: string;
  serviceCode: string;
  weightOz: number;
  dimensions: {
    lengthIn: number;
    widthIn: number;
    heightIn: number;
  };
  shipFrom: LabelAddress;
  shipTo: LabelAddress;
  confirmation?: string;
  testLabel?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateLabelBody(body: unknown): { valid: true; data: CreateLabelBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b['orderId'] !== 'string' || b['orderId'].trim() === '') {
    return { valid: false, error: 'orderId is required' };
  }
  if (typeof b['carrierCode'] !== 'string' || b['carrierCode'].trim() === '') {
    return { valid: false, error: 'carrierCode is required' };
  }
  if (typeof b['serviceCode'] !== 'string' || b['serviceCode'].trim() === '') {
    return { valid: false, error: 'serviceCode is required' };
  }
  if (typeof b['weightOz'] !== 'number' || b['weightOz'] <= 0) {
    return { valid: false, error: 'weightOz must be a positive number' };
  }

  const dims = b['dimensions'] as Record<string, unknown> | undefined;
  if (!dims || typeof dims['lengthIn'] !== 'number' || typeof dims['widthIn'] !== 'number' || typeof dims['heightIn'] !== 'number') {
    return { valid: false, error: 'dimensions (lengthIn, widthIn, heightIn) are required' };
  }

  const shipTo = b['shipTo'] as Record<string, unknown> | undefined;
  if (!shipTo || typeof shipTo['name'] !== 'string' || typeof shipTo['street1'] !== 'string' ||
    typeof shipTo['city'] !== 'string' || typeof shipTo['state'] !== 'string' ||
    typeof shipTo['postalCode'] !== 'string' || typeof shipTo['country'] !== 'string') {
    return { valid: false, error: 'shipTo (name, street1, city, state, postalCode, country) is required' };
  }

  const shipFrom = b['shipFrom'] as Record<string, unknown> | undefined;
  if (!shipFrom || typeof shipFrom['name'] !== 'string' || typeof shipFrom['street1'] !== 'string' ||
    typeof shipFrom['city'] !== 'string' || typeof shipFrom['state'] !== 'string' ||
    typeof shipFrom['postalCode'] !== 'string' || typeof shipFrom['country'] !== 'string') {
    return { valid: false, error: 'shipFrom (name, street1, city, state, postalCode, country) is required' };
  }

  return {
    valid: true,
    data: b as unknown as CreateLabelBody,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/labels
 * Body: CreateLabelBody
 * Returns: { label: { trackingNumber, shipmentCost, serviceCode, labelUrl, ... } }
 */
labelsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const validation = validateLabelBody(req.body);

  if (!validation.valid) {
    res.status(400).json({ error: validation.error, code: 'VALIDATION_ERROR' });
    return;
  }

  const body = validation.data;
  log.info({ orderId: body.orderId, event: 'label.request', serviceCode: body.serviceCode }, 'Label creation requested');

  try {
    const client = createServerShipStationClient();

    const ssLabel = await client.createLabel({
      orderId: body.orderId,
      carrierCode: body.carrierCode,
      serviceCode: body.serviceCode,
      weightOz: body.weightOz,
      dimensions: body.dimensions,
      shipFrom: {
        name: body.shipFrom.name,
        street1: body.shipFrom.street1,
        city: body.shipFrom.city,
        state: body.shipFrom.state,
        postalCode: body.shipFrom.postalCode,
        country: body.shipFrom.country,
      },
      shipTo: {
        name: body.shipTo.name,
        company: body.shipTo.company,
        street1: body.shipTo.street1,
        street2: body.shipTo.street2,
        city: body.shipTo.city,
        state: body.shipTo.state,
        postalCode: body.shipTo.postalCode,
        country: body.shipTo.country,
        residential: body.shipTo.residential,
      },
      confirmation: body.confirmation,
      testLabel: body.testLabel,
    });

    const label = {
      trackingNumber: ssLabel.tracking_number,
      shipmentCost: ssLabel.shipment_cost.amount,
      v2CarrierCode: ssLabel.carrier_code,
      serviceCode: ssLabel.service_code,
      labelUrl: ssLabel.label_download.pdf ?? ssLabel.label_download.href ?? null,
      v1ShippingProviderId: 0, // V2 labels don't have V1 provider IDs
      v1CarrierCode: ssLabel.carrier_code,
      createdAt: new Date().toISOString(),
      voided: false,
    };

    log.info({
      orderId: body.orderId,
      event: 'label.created',
      trackingNumber: label.trackingNumber,
    }, 'Label created successfully');

    res.json({ label });
  } catch (err) {
    if (err instanceof ShipStationError) {
      if (err.code === 'AUTH_ERROR') {
        log.error({ orderId: body.orderId, event: 'label.auth_error' }, 'ShipStation auth failed');
        res.status(401).json({ error: 'ShipStation authentication failed. Check API credentials.', code: 'AUTH_ERROR' });
        return;
      }
      if (err.code === 'RATE_LIMITED') {
        log.warn({ orderId: body.orderId, event: 'label.rate_limited' }, 'ShipStation rate limit hit');
        res.status(429).json({ error: 'Rate limited. Please retry shortly.', code: 'RATE_LIMITED', retryAfterSecs: err.retryAfterSecs });
        return;
      }
      if (err.code === 'BAD_REQUEST') {
        log.warn({ orderId: body.orderId, event: 'label.bad_request', message: err.message }, 'ShipStation rejected request');
        res.status(400).json({ error: `ShipStation rejected the label request: ${err.message}`, code: 'UPSTREAM_VALIDATION_ERROR' });
        return;
      }
      log.error({ orderId: body.orderId, event: 'label.upstream_error', code: err.code }, 'ShipStation error creating label');
      res.status(502).json({ error: 'Failed to create label via ShipStation.', code: 'UPSTREAM_ERROR' });
      return;
    }

    log.error({ orderId: body.orderId, event: 'label.internal_error', err: err instanceof Error ? err.message : String(err) }, 'Internal error');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});
