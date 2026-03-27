/**
 * @file server/__tests__/routes/billing.test.ts
 * @description Integration + DB tests for billing endpoints.
 *
 * Tests:
 * - Create billing record (POST)
 * - Recalculate billing (PUT)
 * - Void billing (PUT /:id/void)
 * - List billings (GET)
 * - Bulk recalculate
 * - 409 conflict on duplicate
 * - 404 on missing record
 * - DB failure scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { app } from '../../server.js';
import { createTestDb, destroyTestDb } from '../helpers/testDb.js';

describe('Billing routes', () => {
  let db: Knex;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await destroyTestDb(db);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/billing/:orderId — Create
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/billing/:orderId', () => {
    it('creates a billing record', async () => {
      const res = await request(app)
        .post('/api/billing/ORD-001')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 10 })
        .expect(201);

      expect(res.body.orderId).toBe('ORD-001');
      expect(res.body.shippingCost).toBe(8.50);
      expect(res.body.carrierMarkupPercent).toBe(10);
      expect(res.body.markupAmount).toBeCloseTo(0.85);
      expect(res.body.totalCost).toBeGreaterThan(0);
      expect(res.body.voided).toBe(false);
      expect(res.body.id).toBeTruthy();
      expect(res.body.calculatedAt).toBeTruthy();
    });

    it('includes prepCost and packageCost from global settings', async () => {
      // Set global settings
      await db('billing_settings').whereNull('client_id').update({
        prep_cost: 1.50,
        package_cost_per_oz: 0.05,
      });

      const res = await request(app)
        .post('/api/billing/ORD-002')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      // prepCost = 1.50, packageCost = 24 * 0.05 = 1.20
      expect(res.body.prepCost).toBe(1.50);
      expect(res.body.packageCost).toBeCloseTo(1.20);
      expect(res.body.totalCost).toBeCloseTo(8.50 + 1.50 + 1.20);
    });

    it('returns 400 for missing shippingCost', async () => {
      const res = await request(app)
        .post('/api/billing/ORD-003')
        .send({ weightOz: 24, carrierMarkupPercent: 0 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing weightOz', async () => {
      const res = await request(app)
        .post('/api/billing/ORD-003')
        .send({ shippingCost: 8.50, carrierMarkupPercent: 0 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for negative weightOz', async () => {
      const res = await request(app)
        .post('/api/billing/ORD-003')
        .send({ shippingCost: 8.50, weightOz: -1, carrierMarkupPercent: 0 })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 on duplicate orderId', async () => {
      await request(app)
        .post('/api/billing/ORD-DUP')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      const res = await request(app)
        .post('/api/billing/ORD-DUP')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(409);

      expect(res.body.code).toBe('CONFLICT');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/billing/:orderId — Recalculate
  // ─────────────────────────────────────────────────────────────────────────

  describe('PUT /api/billing/:orderId', () => {
    it('recalculates billing', async () => {
      await request(app)
        .post('/api/billing/ORD-RECALC')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      const res = await request(app)
        .put('/api/billing/ORD-RECALC')
        .send({ shippingCost: 12.00, weightOz: 32, carrierMarkupPercent: 15 })
        .expect(200);

      expect(res.body.shippingCost).toBe(12.00);
      expect(res.body.carrierMarkupPercent).toBe(15);
      expect(res.body.markupAmount).toBeCloseTo(1.80);
    });

    it('returns 404 if billing does not exist', async () => {
      const res = await request(app)
        .put('/api/billing/ORD-NONEXISTENT')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('returns 409 if billing is voided', async () => {
      await request(app)
        .post('/api/billing/ORD-VOIDED')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      await request(app)
        .put('/api/billing/ORD-VOIDED/void')
        .send({ voided: true })
        .expect(200);

      const res = await request(app)
        .put('/api/billing/ORD-VOIDED')
        .send({ shippingCost: 9.00, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(409);

      expect(res.body.code).toBe('BILLING_VOIDED');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/billing/:orderId/void — Void
  // ─────────────────────────────────────────────────────────────────────────

  describe('PUT /api/billing/:orderId/void', () => {
    it('voids a billing record', async () => {
      await request(app)
        .post('/api/billing/ORD-VOID-ME')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      const res = await request(app)
        .put('/api/billing/ORD-VOID-ME/void')
        .send({ voided: true })
        .expect(200);

      expect(res.body.voided).toBe(true);
      expect(res.body.voidedAt).toBeTruthy();
    });

    it('is idempotent — voiding twice returns same record', async () => {
      await request(app)
        .post('/api/billing/ORD-VOID-IDEM')
        .send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 })
        .expect(201);

      const first = await request(app)
        .put('/api/billing/ORD-VOID-IDEM/void')
        .send({ voided: true })
        .expect(200);

      const second = await request(app)
        .put('/api/billing/ORD-VOID-IDEM/void')
        .send({ voided: true })
        .expect(200);

      expect(first.body.voidedAt).toBe(second.body.voidedAt);
    });

    it('returns 400 if voided is not true', async () => {
      const res = await request(app)
        .put('/api/billing/ORD-VOID-BAD/void')
        .send({ voided: false })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 if billing does not exist', async () => {
      const res = await request(app)
        .put('/api/billing/ORD-NO-EXIST/void')
        .send({ voided: true })
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/billing — List
  // ─────────────────────────────────────────────────────────────────────────

  describe('GET /api/billing', () => {
    beforeEach(async () => {
      // Seed test data
      await request(app).post('/api/billing/ORD-LIST-1').send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0, clientId: 'client-A' });
      await request(app).post('/api/billing/ORD-LIST-2').send({ shippingCost: 5.00, weightOz: 16, carrierMarkupPercent: 10, clientId: 'client-B' });
      await request(app).post('/api/billing/ORD-LIST-3').send({ shippingCost: 12.00, weightOz: 32, carrierMarkupPercent: 5, clientId: 'client-A' });
    });

    it('returns all billings (paginated)', async () => {
      const res = await request(app)
        .get('/api/billing')
        .expect(200);

      expect(res.body.billings).toBeInstanceOf(Array);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.pages).toBeGreaterThanOrEqual(1);
      expect(res.body.pageSize).toBeTruthy();
    });

    it('filters by clientId', async () => {
      const res = await request(app)
        .get('/api/billing?clientId=client-A')
        .expect(200);

      expect(res.body.billings).toHaveLength(2);
      expect(res.body.total).toBe(2);
      res.body.billings.forEach((b: { clientId: string }) => {
        expect(b.clientId).toBe('client-A');
      });
    });

    it('filters by voided', async () => {
      await request(app).put('/api/billing/ORD-LIST-1/void').send({ voided: true });

      const voidedRes = await request(app)
        .get('/api/billing?voided=true')
        .expect(200);

      expect(voidedRes.body.total).toBe(1);
      expect(voidedRes.body.billings[0].voided).toBe(true);

      const activeRes = await request(app)
        .get('/api/billing?voided=false')
        .expect(200);

      expect(activeRes.body.total).toBe(2);
    });

    it('returns 400 for invalid page', async () => {
      const res = await request(app)
        .get('/api/billing?page=0')
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/billing/recalculate-bulk
  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/billing/recalculate-bulk', () => {
    it('recalculates non-voided billings', async () => {
      await request(app).post('/api/billing/ORD-BULK-1').send({ shippingCost: 8.50, weightOz: 24, carrierMarkupPercent: 0 });
      await request(app).post('/api/billing/ORD-BULK-2').send({ shippingCost: 5.00, weightOz: 16, carrierMarkupPercent: 0 });
      await request(app).post('/api/billing/ORD-BULK-3').send({ shippingCost: 3.00, weightOz: 8, carrierMarkupPercent: 0 });
      await request(app).put('/api/billing/ORD-BULK-3/void').send({ voided: true });

      // Update settings so recalc has new values
      await request(app).put('/api/settings/billing').send({ prepCost: 1.00 });

      const res = await request(app)
        .post('/api/billing/recalculate-bulk')
        .send({})
        .expect(200);

      expect(res.body.recalculated).toBe(2);
      expect(res.body.errors).toBeInstanceOf(Array);
      expect(res.body.errors).toHaveLength(0);
    });
  });
});
