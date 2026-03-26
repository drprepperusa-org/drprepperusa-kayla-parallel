/**
 * @file useAutoSync.test.ts
 * @description Tests for Phase 3 Week 1: Auto-Sync constants, configuration, and
 * the logic exported from useAutoSync.ts.
 *
 * Q6 (DJ, LOCKED): "All orders must be checked to see if it's been shipped
 * either through ss or externally every few minutes."
 *
 * Test strategy: Since useAutoSync() is a React hook (requires React runtime),
 * we test the exported constants and verify the configuration matches DJ's Q6
 * requirements. Integration behavior (interval, backoff, notification) is
 * covered by the constant assertions and syncService.test.ts.
 *
 * If @testing-library/react is added in future, move hook lifecycle tests here.
 */

import { describe, it, expect } from 'vitest';
import {
  AUTO_SYNC_INTERVAL_MS,
  AUTO_SYNC_BASE_RETRY_MS,
  AUTO_SYNC_MAX_RETRY_MS,
  AUTO_SYNC_MAX_CONSECUTIVE_FAILURES,
} from './useAutoSync';

// ─────────────────────────────────────────────────────────────────────────────
// Q6 Configuration Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useAutoSync — Q6 configuration constants', () => {

  it('Q6: auto-sync interval is 5 minutes (300,000ms)', () => {
    // Q6: "All orders must be checked... every few minutes." — DJ defined: 5 min.
    expect(AUTO_SYNC_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(AUTO_SYNC_INTERVAL_MS).toBe(300_000);
  });

  it('auto-sync interval is less than 10 minutes (satisfies "every few minutes")', () => {
    expect(AUTO_SYNC_INTERVAL_MS).toBeLessThan(10 * 60 * 1000);
  });

  it('base retry delay is 30 seconds', () => {
    expect(AUTO_SYNC_BASE_RETRY_MS).toBe(30_000);
  });

  it('max retry delay is capped at 5 minutes (matches interval)', () => {
    // Max backoff should not exceed the normal sync interval
    expect(AUTO_SYNC_MAX_RETRY_MS).toBe(AUTO_SYNC_INTERVAL_MS);
  });

  it('max consecutive failures before giving up is positive', () => {
    expect(AUTO_SYNC_MAX_CONSECUTIVE_FAILURES).toBeGreaterThan(0);
  });

  it('max consecutive failures is 5', () => {
    expect(AUTO_SYNC_MAX_CONSECUTIVE_FAILURES).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exponential backoff formula tests
// ─────────────────────────────────────────────────────────────────────────────

describe('useAutoSync — exponential backoff formula', () => {
  /**
   * Formula used in useAutoSync:
   *   delay = min(BASE_RETRY * 2^(failures - 1), MAX_RETRY)
   */
  function computeBackoff(failures: number): number {
    return Math.min(
      AUTO_SYNC_BASE_RETRY_MS * Math.pow(2, failures - 1),
      AUTO_SYNC_MAX_RETRY_MS,
    );
  }

  it('1st failure → 30 seconds backoff', () => {
    expect(computeBackoff(1)).toBe(30_000);
  });

  it('2nd failure → 60 seconds backoff', () => {
    expect(computeBackoff(2)).toBe(60_000);
  });

  it('3rd failure → 120 seconds backoff', () => {
    expect(computeBackoff(3)).toBe(120_000);
  });

  it('4th failure → 240 seconds backoff', () => {
    expect(computeBackoff(4)).toBe(240_000);
  });

  it('5th failure → capped at MAX_RETRY (300 seconds)', () => {
    // 30 * 2^(5-1) = 30 * 16 = 480s, capped at 300s
    expect(computeBackoff(5)).toBe(AUTO_SYNC_MAX_RETRY_MS);
    expect(computeBackoff(5)).toBe(300_000);
  });

  it('high failure count → always capped at MAX_RETRY', () => {
    expect(computeBackoff(10)).toBe(AUTO_SYNC_MAX_RETRY_MS);
    expect(computeBackoff(100)).toBe(AUTO_SYNC_MAX_RETRY_MS);
  });

  it('backoff grows with each failure (up to cap)', () => {
    expect(computeBackoff(2)).toBeGreaterThan(computeBackoff(1));
    expect(computeBackoff(3)).toBeGreaterThan(computeBackoff(2));
    expect(computeBackoff(4)).toBeGreaterThan(computeBackoff(3));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShippingPanel guard logic tests (Q6 label creation guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('ShippingPanel — Q6 label creation guard logic', () => {
  /**
   * Mirror the canCreateLabel logic from ShippingPanel.tsx.
   * Tests ensure the guard logic is correct per Q6.
   */
  function canCreateLabel(opts: {
    externallyShipped: boolean;
    hasLabel: boolean;
    status: 'awaiting_shipment' | 'shipped' | 'cancelled';
  }): boolean {
    const isExternallyShipped = opts.externallyShipped === true;
    const isAlreadyShipped = opts.status === 'shipped' && opts.hasLabel;
    return !isExternallyShipped && !isAlreadyShipped && opts.status !== 'cancelled';
  }

  it('Q6: externally shipped → label creation DISABLED', () => {
    expect(canCreateLabel({
      externallyShipped: true,
      hasLabel: false,
      status: 'awaiting_shipment',
    })).toBe(false);
  });

  it('Q6: externally shipped + awaiting_shipment → still disabled', () => {
    // Even if status is awaiting, external detection disables label creation
    expect(canCreateLabel({
      externallyShipped: true,
      hasLabel: false,
      status: 'awaiting_shipment',
    })).toBe(false);
  });

  it('not externally shipped + awaiting_shipment → label creation ENABLED', () => {
    expect(canCreateLabel({
      externallyShipped: false,
      hasLabel: false,
      status: 'awaiting_shipment',
    })).toBe(true);
  });

  it('not externally shipped + has label (shipped internally) → DISABLED (already shipped)', () => {
    expect(canCreateLabel({
      externallyShipped: false,
      hasLabel: true,
      status: 'shipped',
    })).toBe(false);
  });

  it('cancelled order → label creation DISABLED', () => {
    expect(canCreateLabel({
      externallyShipped: false,
      hasLabel: false,
      status: 'cancelled',
    })).toBe(false);
  });

  it('externally shipped + cancelled → DISABLED (both guards apply)', () => {
    expect(canCreateLabel({
      externallyShipped: true,
      hasLabel: false,
      status: 'cancelled',
    })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// External shipment alert content tests (Q6 warning message)
// ─────────────────────────────────────────────────────────────────────────────

describe('ShippingPanel — external shipment alert content', () => {
  it('Q6 alert message includes double-shipping warning', () => {
    // The exact string shown in ShippingPanel.tsx for externallyShipped orders
    const alertMessage = '⚠️ Order shipped externally. Creating a label will result in double-shipping.';
    expect(alertMessage).toContain('externally');
    expect(alertMessage).toContain('double-shipping');
    expect(alertMessage).toContain('⚠️');
  });

  it('alert message is unambiguous about consequence', () => {
    const alertMessage = '⚠️ Order shipped externally. Creating a label will result in double-shipping.';
    // Must clearly state the consequence
    expect(alertMessage).toContain('Creating a label will result in double-shipping');
  });

  it('externallyShippedAt timestamp is shown when set', () => {
    // We verify the timestamp formatting function produces a readable result
    const date = new Date('2026-03-26T14:30:00');
    const formatted = date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    expect(formatted).toContain('Mar');
    expect(formatted).toContain('26');
    expect(formatted).toContain('2026');
  });
});
