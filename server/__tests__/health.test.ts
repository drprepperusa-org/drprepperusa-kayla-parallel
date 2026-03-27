/**
 * @file server/__tests__/health.test.ts
 * @description Tests for the health check endpoint.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeTruthy();
    expect(res.body.service).toBe('drprepperusa-backend');
  });

  it('404 for unknown route', async () => {
    const res = await request(app)
      .get('/api/unknown-endpoint')
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });
});
