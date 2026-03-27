/**
 * @file server/__tests__/routes/settings.test.ts
 * @description Integration tests for GET/PUT /api/settings/billing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { app } from '../../server.js';
import { createTestDb, destroyTestDb } from '../helpers/testDb.js';

describe('Settings routes', () => {
  let db: Knex;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await destroyTestDb(db);
  });

  describe('GET /api/settings/billing', () => {
    it('returns default settings when table is empty', async () => {
      // Delete the seed row
      await db('billing_settings').delete();

      const res = await request(app)
        .get('/api/settings/billing')
        .expect(200);

      expect(res.body.prepCost).toBe(0);
      expect(res.body.packageCostPerOz).toBe(0);
      expect(res.body.syncFrequencyMin).toBe(5);
      expect(res.body.autoVoidAfterDays).toBeNull();
    });

    it('returns saved settings', async () => {
      await db('billing_settings').whereNull('client_id').update({
        prep_cost: 1.50,
        package_cost_per_oz: 0.05,
        sync_frequency_min: 30,
        auto_void_after_days: 90,
      });

      const res = await request(app)
        .get('/api/settings/billing')
        .expect(200);

      expect(res.body.prepCost).toBe(1.50);
      expect(res.body.packageCostPerOz).toBe(0.05);
      expect(res.body.syncFrequencyMin).toBe(30);
      expect(res.body.autoVoidAfterDays).toBe(90);
    });
  });

  describe('PUT /api/settings/billing', () => {
    it('updates settings', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ prepCost: 2.00, packageCostPerOz: 0.10, syncFrequencyMin: 10 })
        .expect(200);

      expect(res.body.prepCost).toBe(2.00);
      expect(res.body.packageCostPerOz).toBe(0.10);
      expect(res.body.syncFrequencyMin).toBe(10);
    });

    it('partial update — only updates provided fields', async () => {
      await request(app)
        .put('/api/settings/billing')
        .send({ prepCost: 1.50, syncFrequencyMin: 30 });

      const res = await request(app)
        .put('/api/settings/billing')
        .send({ prepCost: 2.00 })
        .expect(200);

      // prepCost updated, syncFrequencyMin unchanged
      expect(res.body.prepCost).toBe(2.00);
      expect(res.body.syncFrequencyMin).toBe(30);
    });

    it('creates settings row if none exists', async () => {
      await db('billing_settings').delete();

      const res = await request(app)
        .put('/api/settings/billing')
        .send({ prepCost: 3.00 })
        .expect(200);

      expect(res.body.prepCost).toBe(3.00);
    });

    it('returns 400 for negative prepCost', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ prepCost: -1 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for negative packageCostPerOz', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ packageCostPerOz: -0.5 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid syncFrequencyMin', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ syncFrequencyMin: 7 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('accepts null for autoVoidAfterDays', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ autoVoidAfterDays: null })
        .expect(200);

      expect(res.body.autoVoidAfterDays).toBeNull();
    });

    it('returns 400 for autoVoidAfterDays < 1', async () => {
      const res = await request(app)
        .put('/api/settings/billing')
        .send({ autoVoidAfterDays: 0 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
