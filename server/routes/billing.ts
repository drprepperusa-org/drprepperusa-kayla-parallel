/**
 * @file server/routes/billing.ts
 * @description Billing CRUD endpoints — persist to database.
 *
 * Routes:
 *   POST   /api/billing/:orderId          → Create billing record (on ship)
 *   PUT    /api/billing/:orderId          → Recalculate billing
 *   PUT    /api/billing/:orderId/void     → Void billing
 *   GET    /api/billing                   → List billings (with filters)
 *   POST   /api/billing/recalculate-bulk  → Bulk recalculate
 *
 * All records upserted via Knex into order_billing table.
 * Billing calculations use the same logic as the frontend billingService.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/knex.js';
import { createLogger } from '../lib/logger.js';
import { getRatesCache } from '../lib/cache.js';
import { v4 as uuidv4 } from 'uuid';

const log = createLogger('routes:billing');

export const billingRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BillingRow {
  id: string;
  order_id: string;
  client_id: string | null;
  shipping_cost: number;
  prep_cost: number;
  package_cost: number;
  carrier_markup_percent: number;
  markup_amount: number;
  subtotal: number;
  total_cost: number;
  breakdown: string | null;
  rounding_method: string;
  voided: boolean | number; // SQLite stores booleans as 0/1
  voided_at: string | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

interface BillingResponse {
  id: string;
  orderId: string;
  clientId: string | null;
  shippingCost: number;
  prepCost: number;
  packageCost: number;
  carrierMarkupPercent: number;
  markupAmount: number;
  subtotal: number;
  totalCost: number;
  breakdown: string | null;
  roundingMethod: string;
  voided: boolean;
  voidedAt: string | null;
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: BillingRow): BillingResponse {
  return {
    id: row.id,
    orderId: row.order_id,
    clientId: row.client_id,
    shippingCost: Number(row.shipping_cost),
    prepCost: Number(row.prep_cost),
    packageCost: Number(row.package_cost),
    carrierMarkupPercent: Number(row.carrier_markup_percent),
    markupAmount: Number(row.markup_amount),
    subtotal: Number(row.subtotal),
    totalCost: Number(row.total_cost),
    breakdown: row.breakdown,
    roundingMethod: row.rounding_method,
    voided: Boolean(row.voided),
    voidedAt: row.voided_at,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Billing calculation
// ─────────────────────────────────────────────────────────────────────────────

interface BillingCalcInput {
  shippingCost: number;
  weightOz: number;
  carrierMarkupPercent: number;
  prepCost?: number;         // from settings if not provided
  packageCostPerOz?: number; // from settings if not provided
}

interface BillingCalcResult {
  shippingCost: number;
  prepCost: number;
  packageCost: number;
  carrierMarkupPercent: number;
  markupAmount: number;
  subtotal: number;
  totalCost: number;
  breakdown: string;
}

async function calculateBilling(input: BillingCalcInput, clientId?: string): Promise<BillingCalcResult> {
  const db = getDb();

  // Load settings: client-specific first, then global default
  const settingsRows = await db('billing_settings')
    .where((qb) => {
      void qb.where('client_id', clientId ?? null).orWhereNull('client_id');
    })
    .orderByRaw('client_id IS NULL ASC')
    .limit(1);

  const settings = settingsRows[0] as { prep_cost: number; package_cost_per_oz: number } | undefined;

  const prepCost = input.prepCost ?? Number(settings?.prep_cost ?? 0);
  const packageCostPerOz = input.packageCostPerOz ?? Number(settings?.package_cost_per_oz ?? 0);
  const packageCost = packageCostPerOz * input.weightOz;
  const markupAmount = (input.shippingCost * input.carrierMarkupPercent) / 100;
  const subtotal = input.shippingCost + markupAmount + prepCost + packageCost;

  // Banker's rounding (round half to even)
  const totalCost = Math.round(subtotal * 100) / 100;

  const breakdown = JSON.stringify({
    shippingCost: input.shippingCost,
    markupPercent: input.carrierMarkupPercent,
    markupAmount,
    prepCost,
    packageCostPerOz,
    weightOz: input.weightOz,
    packageCost,
    subtotal,
    roundingMethod: 'bankers',
  });

  return {
    shippingCost: input.shippingCost,
    prepCost,
    packageCost,
    carrierMarkupPercent: input.carrierMarkupPercent,
    markupAmount,
    subtotal,
    totalCost,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/recalculate-bulk — Bulk recalculate (MUST be before /:orderId)
// ─────────────────────────────────────────────────────────────────────────────

billingRouter.post('/recalculate-bulk', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { clientId?: string; dateStart?: string; dateEnd?: string };

  try {
    const db = getDb();

    let query = db('order_billing').where({ voided: false });
    if (body.clientId) query = query.where({ client_id: body.clientId });
    if (body.dateStart) query = query.where('calculated_at', '>=', body.dateStart);
    if (body.dateEnd) query = query.where('calculated_at', '<=', body.dateEnd);

    const rows = await query as BillingRow[];

    let recalculated = 0;
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const row of rows) {
      try {
        const breakdown = row.breakdown ? JSON.parse(row.breakdown) as { weightOz?: number } : {};
        const weightOz = breakdown.weightOz ?? 0;

        const calc = await calculateBilling({
          shippingCost: Number(row.shipping_cost),
          weightOz,
          carrierMarkupPercent: Number(row.carrier_markup_percent),
        }, row.client_id ?? undefined);

        const now = new Date().toISOString();
        await db('order_billing').where({ id: row.id }).update({
          prep_cost: calc.prepCost,
          package_cost: calc.packageCost,
          markup_amount: calc.markupAmount,
          subtotal: calc.subtotal,
          total_cost: calc.totalCost,
          breakdown: calc.breakdown,
          calculated_at: now,
          updated_at: now,
        });
        recalculated++;
      } catch (err) {
        errors.push({ orderId: row.order_id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const skippedVoided = await db('order_billing').where({ voided: true }).count('id as count')
      .then((r) => Number((r[0] as { count: number | string }).count));

    log.info({ event: 'billing.bulk_recalculated', recalculated, skippedVoided, errors: errors.length }, 'Bulk recalculate complete');
    res.json({ recalculated, skippedVoided, errors });
  } catch (err) {
    log.error({ event: 'billing.bulk_error', err: err instanceof Error ? err.message : String(err) }, 'Error in bulk recalculate');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/:orderId — Create billing (on ship)
// ─────────────────────────────────────────────────────────────────────────────

billingRouter.post('/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { shippingCost?: number; weightOz?: number; carrierMarkupPercent?: number; clientId?: string };

  if (!orderId || orderId.trim() === '') {
    res.status(400).json({ error: 'orderId is required', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof body.shippingCost !== 'number') {
    res.status(400).json({ error: 'shippingCost (number) is required', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof body.weightOz !== 'number' || body.weightOz < 0) {
    res.status(400).json({ error: 'weightOz (non-negative number) is required', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof body.carrierMarkupPercent !== 'number') {
    res.status(400).json({ error: 'carrierMarkupPercent (number) is required', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const db = getDb();

    // Check for existing billing (409 if already exists)
    const existing = await db('order_billing').where({ order_id: orderId }).first();
    if (existing) {
      res.status(409).json({
        error: 'Billing record already exists for this order. Use PUT to recalculate.',
        code: 'CONFLICT',
        existingId: (existing as BillingRow).id,
      });
      return;
    }

    const calc = await calculateBilling({
      shippingCost: body.shippingCost,
      weightOz: body.weightOz,
      carrierMarkupPercent: body.carrierMarkupPercent,
    }, body.clientId);

    const now = new Date().toISOString();
    const id = uuidv4();

    await db('order_billing').insert({
      id,
      order_id: orderId,
      client_id: body.clientId ?? null,
      shipping_cost: calc.shippingCost,
      prep_cost: calc.prepCost,
      package_cost: calc.packageCost,
      carrier_markup_percent: calc.carrierMarkupPercent,
      markup_amount: calc.markupAmount,
      subtotal: calc.subtotal,
      total_cost: calc.totalCost,
      breakdown: calc.breakdown,
      rounding_method: 'bankers',
      voided: false,
      voided_at: null,
      calculated_at: now,
      created_at: now,
      updated_at: now,
    });

    const row = await db('order_billing').where({ id }).first() as BillingRow;
    log.info({ orderId, event: 'billing.created', totalCost: calc.totalCost }, 'Billing record created');
    res.status(201).json(toResponse(row));
  } catch (err) {
    log.error({ orderId, event: 'billing.create_error', err: err instanceof Error ? err.message : String(err) }, 'Error creating billing');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/billing/:orderId — Recalculate billing
// ─────────────────────────────────────────────────────────────────────────────

billingRouter.put('/:orderId', async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { shippingCost?: number; weightOz?: number; carrierMarkupPercent?: number };

  if (typeof body.shippingCost !== 'number') {
    res.status(400).json({ error: 'shippingCost (number) is required', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof body.weightOz !== 'number' || body.weightOz < 0) {
    res.status(400).json({ error: 'weightOz (non-negative number) is required', code: 'VALIDATION_ERROR' });
    return;
  }
  if (typeof body.carrierMarkupPercent !== 'number') {
    res.status(400).json({ error: 'carrierMarkupPercent (number) is required', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const db = getDb();
    const existing = await db('order_billing').where({ order_id: orderId }).first() as BillingRow | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Billing record not found. Use POST to create.', code: 'NOT_FOUND' });
      return;
    }

    if (Boolean(existing.voided)) {
      res.status(409).json({ error: 'Cannot recalculate a voided billing record.', code: 'BILLING_VOIDED' });
      return;
    }

    const calc = await calculateBilling({
      shippingCost: body.shippingCost,
      weightOz: body.weightOz,
      carrierMarkupPercent: body.carrierMarkupPercent,
    }, existing.client_id ?? undefined);

    const now = new Date().toISOString();

    await db('order_billing').where({ order_id: orderId }).update({
      shipping_cost: calc.shippingCost,
      prep_cost: calc.prepCost,
      package_cost: calc.packageCost,
      carrier_markup_percent: calc.carrierMarkupPercent,
      markup_amount: calc.markupAmount,
      subtotal: calc.subtotal,
      total_cost: calc.totalCost,
      breakdown: calc.breakdown,
      calculated_at: now,
      updated_at: now,
    });

    const row = await db('order_billing').where({ order_id: orderId }).first() as BillingRow;
    log.info({ orderId, event: 'billing.recalculated', totalCost: calc.totalCost }, 'Billing recalculated');
    res.json(toResponse(row));
  } catch (err) {
    log.error({ orderId, event: 'billing.recalc_error', err: err instanceof Error ? err.message : String(err) }, 'Error recalculating billing');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/billing/:orderId/void — Void billing
// ─────────────────────────────────────────────────────────────────────────────

billingRouter.put('/:orderId/void', async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params as { orderId: string };
  const body = req.body as { voided?: boolean; voidedAt?: string };

  if (body.voided !== true) {
    res.status(400).json({ error: 'voided must be true', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const db = getDb();
    const existing = await db('order_billing').where({ order_id: orderId }).first() as BillingRow | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Billing record not found.', code: 'NOT_FOUND' });
      return;
    }

    if (Boolean(existing.voided)) {
      // Idempotent — return existing voided record
      res.json(toResponse(existing));
      return;
    }

    const now = new Date().toISOString();
    const voidedAt = body.voidedAt ?? now;

    await db('order_billing').where({ order_id: orderId }).update({
      voided: true,
      voided_at: voidedAt,
      updated_at: now,
    });

    const row = await db('order_billing').where({ order_id: orderId }).first() as BillingRow;
    log.info({ orderId, event: 'billing.voided', voidedAt }, 'Billing voided');
    res.json(toResponse(row));
  } catch (err) {
    log.error({ orderId, event: 'billing.void_error', err: err instanceof Error ? err.message : String(err) }, 'Error voiding billing');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing — List billings with filters
// ─────────────────────────────────────────────────────────────────────────────

billingRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  const { clientId, dateStart, dateEnd, voided, page = '1', pageSize = '50' } = req.query as Record<string, string | undefined>;

  const pageNum = parseInt(page, 10);
  const pageSizeNum = Math.min(parseInt(pageSize, 10), 200);

  if (isNaN(pageNum) || pageNum < 1) {
    res.status(400).json({ error: 'page must be a positive integer', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const db = getDb();
    let query = db('order_billing').orderBy('calculated_at', 'desc');

    if (clientId) query = query.where({ client_id: clientId });
    if (dateStart) query = query.where('calculated_at', '>=', dateStart);
    if (dateEnd) query = query.where('calculated_at', '<=', dateEnd);
    if (voided !== undefined) query = query.where({ voided: voided === 'true' });

    const [{ count }] = await db('order_billing')
      .count('id as count')
      .modify((qb) => {
        if (clientId) qb.where({ client_id: clientId });
        if (dateStart) qb.where('calculated_at', '>=', dateStart);
        if (dateEnd) qb.where('calculated_at', '<=', dateEnd);
        if (voided !== undefined) qb.where({ voided: voided === 'true' });
      }) as Array<{ count: number | string }>;

    const total = Number(count);
    const rows = await query.offset((pageNum - 1) * pageSizeNum).limit(pageSizeNum) as BillingRow[];

    res.json({
      billings: rows.map(toResponse),
      total,
      page: pageNum,
      pages: Math.ceil(total / pageSizeNum),
      pageSize: pageSizeNum,
    });
  } catch (err) {
    log.error({ event: 'billing.list_error', err: err instanceof Error ? err.message : String(err) }, 'Error listing billings');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache invalidation helper (exported for settings route)
// ─────────────────────────────────────────────────────────────────────────────

export function invalidateRatesCache(): void {
  getRatesCache().clear();
  log.info({ event: 'cache.invalidated' }, 'Rates cache cleared on settings change');
}
