/**
 * residentialService.test.ts
 * Unit tests for residential flag inference tristate logic
 */

import { describe, it, expect } from 'vitest';
import {
  inferResidential,
  applyResidentialToOrder,
  applyResidentialToOrders,
} from './residentialService';
import type { OrderDTO } from '../types/orders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<OrderDTO> = {}): OrderDTO {
  return {
    orderId: 1,
    orderNumber: 'TEST-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clientId: 1,
    storeId: 1,
    status: 'awaiting_shipment',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// inferResidential — explicit booleans
// ---------------------------------------------------------------------------

describe('inferResidential — explicit true', () => {
  it('returns isResidential=true and source=explicit when residential=true', () => {
    const result = inferResidential(true, undefined);
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('explicit');
  });

  it('preserves explicit true even when company name is set', () => {
    const result = inferResidential(true, { company: 'ACME Corp' });
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('explicit');
  });
});

describe('inferResidential — explicit false', () => {
  it('returns isResidential=false and source=explicit when residential=false', () => {
    const result = inferResidential(false, undefined);
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('explicit');
  });

  it('preserves explicit false even without a company name', () => {
    const result = inferResidential(false, { postalCode: '90210', company: '' });
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('explicit');
  });
});

// ---------------------------------------------------------------------------
// inferResidential — null inference via company name
// ---------------------------------------------------------------------------

describe('inferResidential — company name inference', () => {
  it('infers commercial when company name is present', () => {
    const result = inferResidential(null, { company: 'Acme Warehouse LLC' });
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('company_name');
  });

  it('does NOT infer commercial for empty company string', () => {
    const result = inferResidential(null, { company: '   ', postalCode: '50000' });
    // Empty/whitespace company → should fall through to ZIP or default
    expect(result.source).not.toBe('company_name');
  });
});

// ---------------------------------------------------------------------------
// inferResidential — ZIP-based inference
// ---------------------------------------------------------------------------

describe('inferResidential — ZIP commercial prefix', () => {
  it('infers commercial for ZIP starting with known commercial prefix 100xx (Manhattan)', () => {
    const result = inferResidential(null, { postalCode: '10001' });
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('zip_commercial');
    expect(result.zip).toBe('10001');
  });

  it('infers commercial for ZIP starting with 600xx (Chicago Loop)', () => {
    const result = inferResidential(null, { postalCode: '60005' });
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('zip_commercial');
  });
});

describe('inferResidential — ZIP exact commercial', () => {
  it('infers commercial for exact commercial-only ZIP 00501 (IRS Holtsville)', () => {
    const result = inferResidential(null, { postalCode: '00501' });
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('zip_commercial');
    expect(result.zip).toBe('00501');
  });
});

describe('inferResidential — ZIP residential', () => {
  it('infers residential for a typical residential ZIP (Beverly Hills 90210)', () => {
    const result = inferResidential(null, { postalCode: '90210' });
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('zip_residential');
    expect(result.zip).toBe('90210');
  });

  it('infers residential for a suburban ZIP 30301 (Atlanta suburbs)', () => {
    const result = inferResidential(null, { postalCode: '30301' });
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('zip_residential');
  });

  it('normalizes ZIP with non-digit chars (e.g. "90210-1234" → "90210")', () => {
    const result = inferResidential(null, { postalCode: '90210-1234' });
    expect(result.zip).toBe('90210');
    expect(result.isResidential).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// inferResidential — default fallback
// ---------------------------------------------------------------------------

describe('inferResidential — default fallback', () => {
  it('defaults to residential when no address data is provided', () => {
    const result = inferResidential(null, undefined);
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('default_fallback');
  });

  it('defaults to residential when ZIP is missing', () => {
    const result = inferResidential(null, { name: 'John Doe' });
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('default_fallback');
  });

  it('defaults to residential when ZIP has fewer than 5 digits', () => {
    const result = inferResidential(null, { postalCode: '123' });
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('default_fallback');
  });

  it('defaults to residential for undefined residential (same as null)', () => {
    const result = inferResidential(undefined, undefined);
    expect(result.isResidential).toBe(true);
    expect(result.source).toBe('default_fallback');
  });
});

// ---------------------------------------------------------------------------
// applyResidentialToOrder — enrichment + immutability
// ---------------------------------------------------------------------------

describe('applyResidentialToOrder', () => {
  it('does not mutate the original order', () => {
    const order = makeOrder({ residential: null as unknown as boolean, shipTo: { postalCode: '90210' } });
    const original = { ...order };
    applyResidentialToOrder(order);
    expect(order).toEqual(original);
  });

  it('enriches order with _residentialResolved, _residentialSource, _residentialReason', () => {
    const order = makeOrder({ shipTo: { postalCode: '90210' } });
    const enriched = applyResidentialToOrder(order);
    expect(enriched._residentialResolved).toBe(true);
    expect(enriched._residentialSource).toBe('zip_residential');
    expect(typeof enriched._residentialReason).toBe('string');
  });

  it('sets residential=false for explicit false order', () => {
    const order = makeOrder({ residential: false });
    const enriched = applyResidentialToOrder(order);
    expect(enriched.residential).toBe(false);
    expect(enriched._residentialSource).toBe('explicit');
  });

  it('sets residential=true for null with fallback (no address)', () => {
    const order = makeOrder({ residential: null as unknown as boolean });
    const enriched = applyResidentialToOrder(order);
    expect(enriched.residential).toBe(true);
    expect(enriched._residentialSource).toBe('default_fallback');
  });
});

// ---------------------------------------------------------------------------
// applyResidentialToOrders — batch
// ---------------------------------------------------------------------------

describe('applyResidentialToOrders', () => {
  it('processes all orders in the batch', () => {
    const orders = [
      makeOrder({ orderId: 1, residential: true }),
      makeOrder({ orderId: 2, residential: false }),
      makeOrder({ orderId: 3, shipTo: { postalCode: '90210' } }),
      makeOrder({ orderId: 4, shipTo: { company: 'ACME' } }),
    ];
    const enriched = applyResidentialToOrders(orders);
    expect(enriched).toHaveLength(4);
    expect(enriched[0].residential).toBe(true);
    expect(enriched[1].residential).toBe(false);
    expect(enriched[2].residential).toBe(true);
    expect(enriched[3].residential).toBe(false);
  });

  it('returns a new array (does not mutate original)', () => {
    const orders = [makeOrder({ orderId: 1 })];
    const enriched = applyResidentialToOrders(orders);
    expect(enriched).not.toBe(orders);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty postalCode string', () => {
    const result = inferResidential(null, { postalCode: '' });
    expect(result.source).toBe('default_fallback');
  });

  it('handles postalCode with only non-digit characters', () => {
    const result = inferResidential(null, { postalCode: 'ABCDE' });
    // After stripping non-digits → empty string → fallback
    expect(result.source).toBe('default_fallback');
  });

  it('handles Canadian postal code (letter-digit mix) gracefully', () => {
    // "M5V 3A8" → digits only = "538" (3 chars) → fallback
    const result = inferResidential(null, { postalCode: 'M5V 3A8' });
    expect(result.isResidential).toBe(true); // conservative fallback
  });

  it('treats whitespace-only company as non-company (falls through to ZIP)', () => {
    const result = inferResidential(null, { company: '   ', postalCode: '90210' });
    expect(result.source).toBe('zip_residential');
    expect(result.isResidential).toBe(true);
  });

  it('commercial ZIP prefix takes priority over residential ZIP fallback', () => {
    const result = inferResidential(null, { postalCode: '10005' }); // 100xx = commercial
    expect(result.isResidential).toBe(false);
    expect(result.source).toBe('zip_commercial');
  });
});
