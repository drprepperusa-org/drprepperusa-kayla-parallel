/**
 * @file server/routes/settings.ts
 * @description GET/PUT /api/settings/billing — load and persist billing settings.
 *
 * Routes:
 *   GET /api/settings/billing    → Return global billing settings
 *   PUT /api/settings/billing    → Update settings + invalidate rates cache
 *
 * Settings are stored in the billing_settings table (client_id = null = global).
 */

import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/knex.js';
import { invalidateRatesCache } from './billing.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes:settings');

export const settingsRouter = Router();

const VALID_SYNC_FREQUENCIES = [5, 10, 30, 60] as const;

interface BillingSettingsRow {
  id: string;
  client_id: string | null;
  prep_cost: number;
  package_cost_per_oz: number;
  sync_frequency_min: number;
  auto_void_after_days: number | null;
  created_at: string;
  updated_at: string;
}

interface BillingSettingsResponse {
  prepCost: number;
  packageCostPerOz: number;
  syncFrequencyMin: 5 | 10 | 30 | 60;
  autoVoidAfterDays: number | null;
}

function toSettingsResponse(row: BillingSettingsRow): BillingSettingsResponse {
  return {
    prepCost: Number(row.prep_cost),
    packageCostPerOz: Number(row.package_cost_per_oz),
    syncFrequencyMin: row.sync_frequency_min as 5 | 10 | 30 | 60,
    autoVoidAfterDays: row.auto_void_after_days,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings/billing
// ─────────────────────────────────────────────────────────────────────────────

settingsRouter.get('/billing', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const row = await db('billing_settings').whereNull('client_id').first() as BillingSettingsRow | undefined;

    if (!row) {
      // Return defaults if no settings row exists yet
      const defaults: BillingSettingsResponse = {
        prepCost: 0,
        packageCostPerOz: 0,
        syncFrequencyMin: 5,
        autoVoidAfterDays: null,
      };
      log.info({ event: 'settings.get.defaults' }, 'No settings found — returning defaults');
      res.json(defaults);
      return;
    }

    log.info({ event: 'settings.get' }, 'Billing settings loaded');
    res.json(toSettingsResponse(row));
  } catch (err) {
    log.error({ event: 'settings.get_error', err: err instanceof Error ? err.message : String(err) }, 'Error loading settings');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/settings/billing
// ─────────────────────────────────────────────────────────────────────────────

settingsRouter.put('/billing', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    prepCost?: number;
    packageCostPerOz?: number;
    syncFrequencyMin?: number;
    autoVoidAfterDays?: number | null;
  };

  // Validate
  if (body.prepCost !== undefined && (typeof body.prepCost !== 'number' || body.prepCost < 0)) {
    res.status(400).json({ error: 'prepCost must be a non-negative number', code: 'VALIDATION_ERROR' });
    return;
  }
  if (body.packageCostPerOz !== undefined && (typeof body.packageCostPerOz !== 'number' || body.packageCostPerOz < 0)) {
    res.status(400).json({ error: 'packageCostPerOz must be a non-negative number', code: 'VALIDATION_ERROR' });
    return;
  }
  if (body.syncFrequencyMin !== undefined && !VALID_SYNC_FREQUENCIES.includes(body.syncFrequencyMin as typeof VALID_SYNC_FREQUENCIES[number])) {
    res.status(400).json({ error: `syncFrequencyMin must be one of: ${VALID_SYNC_FREQUENCIES.join(', ')}`, code: 'VALIDATION_ERROR' });
    return;
  }
  if (body.autoVoidAfterDays !== undefined && body.autoVoidAfterDays !== null && (typeof body.autoVoidAfterDays !== 'number' || body.autoVoidAfterDays < 1)) {
    res.status(400).json({ error: 'autoVoidAfterDays must be a positive integer or null', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const db = getDb();
    const now = new Date().toISOString();

    const existing = await db('billing_settings').whereNull('client_id').first() as BillingSettingsRow | undefined;

    if (!existing) {
      // Insert global defaults row
      await db('billing_settings').insert({
        client_id: null,
        prep_cost: body.prepCost ?? 0,
        package_cost_per_oz: body.packageCostPerOz ?? 0,
        sync_frequency_min: body.syncFrequencyMin ?? 5,
        auto_void_after_days: body.autoVoidAfterDays ?? null,
        created_at: now,
        updated_at: now,
      });
    } else {
      // Partial update — only update fields that are provided
      const updates: Record<string, unknown> = { updated_at: now };
      if (body.prepCost !== undefined) updates['prep_cost'] = body.prepCost;
      if (body.packageCostPerOz !== undefined) updates['package_cost_per_oz'] = body.packageCostPerOz;
      if (body.syncFrequencyMin !== undefined) updates['sync_frequency_min'] = body.syncFrequencyMin;
      if (body.autoVoidAfterDays !== undefined) updates['auto_void_after_days'] = body.autoVoidAfterDays;

      await db('billing_settings').whereNull('client_id').update(updates);
    }

    const row = await db('billing_settings').whereNull('client_id').first() as BillingSettingsRow;

    // Invalidate rates cache when settings change (prep/package costs affect totals)
    invalidateRatesCache();

    log.info({ event: 'settings.updated' }, 'Billing settings updated');
    res.json(toSettingsResponse(row));
  } catch (err) {
    log.error({ event: 'settings.update_error', err: err instanceof Error ? err.message : String(err) }, 'Error updating settings');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  }
});
