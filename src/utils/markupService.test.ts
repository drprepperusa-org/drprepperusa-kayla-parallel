/**
 * markupService.test.ts
 *
 * Unit tests for the Markup Chain Calculation Service (Feature 4).
 *
 * Coverage:
 *  - getMarkupRuleForCarrier: lookup, fallback, case-insensitive, multi-tenant
 *  - applyMarkup: 10/15/20%, various base rates, zero markup, decimal precision
 *  - calculateMarkupAmount: delta calculation
 *  - applyMarkupForCarrier: integrated convenience function
 *  - Edge cases: negative inputs, empty rules, missing carrier
 */

import { describe, it, expect } from 'vitest';
import {
  getMarkupRuleForCarrier,
  applyMarkup,
  calculateMarkupAmount,
  applyMarkupForCarrier,
  type MarkupRule,
} from './markupService';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_RULES: MarkupRule[] = [
  { carrier: 'USPS', markupPercent: 10, clientId: 'default', updatedAt: new Date() },
  { carrier: 'UPS', markupPercent: 15, clientId: 'default', updatedAt: new Date() },
  { carrier: 'FedEx', markupPercent: 20, clientId: 'default', updatedAt: new Date() },
];

const MULTI_TENANT_RULES: MarkupRule[] = [
  ...DEFAULT_RULES,
  { carrier: 'USPS', markupPercent: 5, clientId: 'client-A', updatedAt: new Date() },
  { carrier: 'UPS', markupPercent: 8, clientId: 'client-A', updatedAt: new Date() },
  { carrier: 'FedEx', markupPercent: 12, clientId: 'client-A', updatedAt: new Date() },
  { carrier: 'USPS', markupPercent: 25, clientId: 'client-B', updatedAt: new Date() },
];

// ---------------------------------------------------------------------------
// getMarkupRuleForCarrier
// ---------------------------------------------------------------------------

describe('getMarkupRuleForCarrier', () => {
  it('returns 10% for USPS / default client', () => {
    expect(getMarkupRuleForCarrier('USPS', 'default', DEFAULT_RULES)).toBe(10);
  });

  it('returns 15% for UPS / default client', () => {
    expect(getMarkupRuleForCarrier('UPS', 'default', DEFAULT_RULES)).toBe(15);
  });

  it('returns 20% for FedEx / default client', () => {
    expect(getMarkupRuleForCarrier('FedEx', 'default', DEFAULT_RULES)).toBe(20);
  });

  it('returns 0 (fallback) when carrier has no matching rule', () => {
    expect(getMarkupRuleForCarrier('DHL', 'default', DEFAULT_RULES)).toBe(0);
  });

  it('returns 0 (fallback) when clientId has no matching rules', () => {
    expect(getMarkupRuleForCarrier('USPS', 'unknown-client', DEFAULT_RULES)).toBe(0);
  });

  it('returns 0 when rules array is empty', () => {
    expect(getMarkupRuleForCarrier('USPS', 'default', [])).toBe(0);
  });

  it('returns 0 when carrier is empty string', () => {
    expect(getMarkupRuleForCarrier('', 'default', DEFAULT_RULES)).toBe(0);
  });

  it('returns 0 when clientId is empty string', () => {
    expect(getMarkupRuleForCarrier('USPS', '', DEFAULT_RULES)).toBe(0);
  });

  it('is case-insensitive for carrier name (lowercase)', () => {
    expect(getMarkupRuleForCarrier('usps', 'default', DEFAULT_RULES)).toBe(10);
  });

  it('is case-insensitive for carrier name (mixed case)', () => {
    expect(getMarkupRuleForCarrier('Fedex', 'default', DEFAULT_RULES)).toBe(20);
  });

  it('is case-insensitive for carrier name (all caps)', () => {
    expect(getMarkupRuleForCarrier('FEDEX', 'default', DEFAULT_RULES)).toBe(20);
  });

  it('returns client-A specific markup for USPS', () => {
    expect(getMarkupRuleForCarrier('USPS', 'client-A', MULTI_TENANT_RULES)).toBe(5);
  });

  it('returns client-A specific markup for UPS', () => {
    expect(getMarkupRuleForCarrier('UPS', 'client-A', MULTI_TENANT_RULES)).toBe(8);
  });

  it('returns client-A specific markup for FedEx', () => {
    expect(getMarkupRuleForCarrier('FedEx', 'client-A', MULTI_TENANT_RULES)).toBe(12);
  });

  it('returns client-B specific markup for USPS', () => {
    expect(getMarkupRuleForCarrier('USPS', 'client-B', MULTI_TENANT_RULES)).toBe(25);
  });

  it('returns 0 for client-B with carrier that has no rule', () => {
    expect(getMarkupRuleForCarrier('UPS', 'client-B', MULTI_TENANT_RULES)).toBe(0);
  });

  it('trims whitespace from carrier name', () => {
    expect(getMarkupRuleForCarrier('  USPS  ', 'default', DEFAULT_RULES)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// applyMarkup
// ---------------------------------------------------------------------------

describe('applyMarkup', () => {
  // Standard carrier markups at $100 base
  it('applies 10% USPS markup to $100 → $110', () => {
    expect(applyMarkup(100, 10)).toBe(110);
  });

  it('applies 15% UPS markup to $100 → $115', () => {
    expect(applyMarkup(100, 15)).toBe(115);
  });

  it('applies 20% FedEx markup to $100 → $120', () => {
    expect(applyMarkup(100, 20)).toBe(120);
  });

  // Different base rates: $50
  it('applies 10% markup to $50 → $55', () => {
    expect(applyMarkup(50, 10)).toBe(55);
  });

  it('applies 15% markup to $50 → $57.50', () => {
    expect(applyMarkup(50, 15)).toBe(57.5);
  });

  it('applies 20% markup to $50 → $60', () => {
    expect(applyMarkup(50, 20)).toBe(60);
  });

  // Different base rates: $200
  it('applies 10% markup to $200 → $220', () => {
    expect(applyMarkup(200, 10)).toBe(220);
  });

  it('applies 15% markup to $200 → $230', () => {
    expect(applyMarkup(200, 15)).toBe(230);
  });

  it('applies 20% markup to $200 → $240', () => {
    expect(applyMarkup(200, 20)).toBe(240);
  });

  // Zero markup (fallback case)
  it('returns baseRate unchanged when markupPercent is 0', () => {
    expect(applyMarkup(100, 0)).toBe(100);
  });

  it('returns 0 when baseRate is 0', () => {
    expect(applyMarkup(0, 15)).toBe(0);
  });

  it('returns 0 when both are 0', () => {
    expect(applyMarkup(0, 0)).toBe(0);
  });

  // Decimal precision
  it('handles decimal base rates correctly: $9.99 × 1.10 = $10.99', () => {
    expect(applyMarkup(9.99, 10)).toBe(10.99);
  });

  it('rounds to 2 decimal places: $33.33 × 1.15 = $38.33', () => {
    // 33.33 * 1.15 = 38.3295 → rounds to 38.33
    expect(applyMarkup(33.33, 15)).toBe(38.33);
  });

  it('handles fractional markup percentages: $100 × 1.125 = $112.50', () => {
    expect(applyMarkup(100, 12.5)).toBe(112.5);
  });

  it('handles large rates: $1000 × 1.20 = $1200', () => {
    expect(applyMarkup(1000, 20)).toBe(1200);
  });

  // Error cases
  it('throws on negative baseRate', () => {
    expect(() => applyMarkup(-1, 10)).toThrow('baseRate must be >= 0');
  });

  it('throws on negative markupPercent', () => {
    expect(() => applyMarkup(100, -5)).toThrow('markupPercent must be >= 0');
  });
});

// ---------------------------------------------------------------------------
// calculateMarkupAmount
// ---------------------------------------------------------------------------

describe('calculateMarkupAmount', () => {
  it('returns $10 markup on $100 at 10%', () => {
    expect(calculateMarkupAmount(100, 10)).toBe(10);
  });

  it('returns $15 markup on $100 at 15%', () => {
    expect(calculateMarkupAmount(100, 15)).toBe(15);
  });

  it('returns $20 markup on $100 at 20%', () => {
    expect(calculateMarkupAmount(100, 20)).toBe(20);
  });

  it('returns $0 markup when markupPercent is 0', () => {
    expect(calculateMarkupAmount(100, 0)).toBe(0);
  });

  it('returns $0 when baseRate is 0', () => {
    expect(calculateMarkupAmount(0, 20)).toBe(0);
  });

  it('rounds correctly: $33.33 at 15% = $5.00', () => {
    // 33.33 * 0.15 = 4.9995 → rounds to 5
    expect(calculateMarkupAmount(33.33, 15)).toBe(5);
  });

  it('throws on negative baseRate', () => {
    expect(() => calculateMarkupAmount(-10, 15)).toThrow('baseRate must be >= 0');
  });

  it('throws on negative markupPercent', () => {
    expect(() => calculateMarkupAmount(100, -1)).toThrow('markupPercent must be >= 0');
  });
});

// ---------------------------------------------------------------------------
// applyMarkupForCarrier (integrated)
// ---------------------------------------------------------------------------

describe('applyMarkupForCarrier', () => {
  it('applies USPS 10% markup from rules', () => {
    expect(applyMarkupForCarrier(100, 'USPS', 'default', DEFAULT_RULES)).toBe(110);
  });

  it('applies UPS 15% markup from rules', () => {
    expect(applyMarkupForCarrier(100, 'UPS', 'default', DEFAULT_RULES)).toBe(115);
  });

  it('applies FedEx 20% markup from rules', () => {
    expect(applyMarkupForCarrier(100, 'FedEx', 'default', DEFAULT_RULES)).toBe(120);
  });

  it('applies 0% markup (no change) when carrier not in rules', () => {
    expect(applyMarkupForCarrier(100, 'DHL', 'default', DEFAULT_RULES)).toBe(100);
  });

  it('uses client-A specific rules (USPS 5%)', () => {
    expect(applyMarkupForCarrier(100, 'USPS', 'client-A', MULTI_TENANT_RULES)).toBe(105);
  });

  it('uses client-B specific rules (USPS 25%)', () => {
    expect(applyMarkupForCarrier(100, 'USPS', 'client-B', MULTI_TENANT_RULES)).toBe(125);
  });
});
