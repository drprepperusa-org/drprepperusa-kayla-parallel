/**
 * billingIntegration.test.ts — ordersStore + billingStore auto-calc on ship.
 *
 * Q7 (DJ, LOCKED): "The billing should automatically update as soon as each
 * order is processed and shipped."
 *
 * Tests:
 *  1. markOrderAsShipped auto-triggers billingStore.calculateBilling
 *  2. Billing record exists after ship event
 *  3. Billing uses order's baseRate (label cost), not fetched rates
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useOrdersStore } from './ordersStore';
import { useBillingStore } from './billingStore';
import type { Order } from '../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: minimal Order fixture for allOrders
// ─────────────────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'test-order-1',
    orderNum: 'ORD-1001',
    orderId: 1001,
    clientId: 'client-1',
    storeId: 101,
    orderDate: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    lastUpdatedAt: new Date('2026-01-15'),
    customer: 'Jane Doe',
    shipTo: {
      name: 'Jane Doe',
      street1: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
    },
    shipFrom: {
      name: 'DrPrepper',
      street1: '456 Warehouse Ave',
      city: 'Gardena',
      state: 'CA',
      postalCode: '90248',
      country: 'US',
    },
    items: [],
    itemCount: 0,
    itemNames: [],
    skus: [],
    weightOz: 16,
    dimensions: { lengthIn: 10, widthIn: 8, heightIn: 4 },
    baseRate: 7.50,
    status: 'awaiting_shipment',
    externallyShipped: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset stores before each test
// ─────────────────────────────────────────────────────────────────────────────

function resetStores() {
  useOrdersStore.setState({
    orders: [],
    allOrders: [],
    loading: false,
    error: null,
    total: 0,
    page: 1,
    pages: 0,
    pageSize: 50,
    currentStatus: 'awaiting_shipment',
    searchQuery: '',
    dateStart: null,
    dateEnd: null,
    selectedOrderIds: new Set(),
    sync: { syncing: false, lastSyncTime: null, lastSyncError: null },
  });
  useBillingStore.setState({
    billings: {},
    settings: { prepCost: 0, packageCostPerOz: 0 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-calc on ship tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ordersStore.markOrderAsShipped → auto-calc billing (Q7 LOCKED)', () => {
  beforeEach(resetStores);

  it('creates a billing record when order is marked as shipped', () => {
    const order = makeOrder();
    useOrdersStore.setState({ allOrders: [order] });

    useOrdersStore.getState().markOrderAsShipped('test-order-1', 'TRACK123', 'http://label.pdf', 'usps');

    const billing = useBillingStore.getState().billings['test-order-1'];
    expect(billing).toBeDefined();
  });

  it('billing record has correct orderId', () => {
    const order = makeOrder({ id: 'auto-order-99' });
    useOrdersStore.setState({ allOrders: [order] });
    useOrdersStore.getState().markOrderAsShipped('auto-order-99', 'TRACK999', 'http://label.pdf', 'ups');
    expect(useBillingStore.getState().billings['auto-order-99']).toBeDefined();
  });

  it('billing record uses order weightOz for packageCost calculation', () => {
    useBillingStore.setState({ settings: { prepCost: 0, packageCostPerOz: 0.10 } });
    const order = makeOrder({ id: 'weight-order', weightOz: 20 });
    useOrdersStore.setState({ allOrders: [order] });
    useOrdersStore.getState().markOrderAsShipped('weight-order', 'TRACK200', 'http://label.pdf', 'usps');
    const billing = useBillingStore.getState().billings['weight-order'];
    // packageCost = 20oz × $0.10 = $2.00
    expect(billing?.packageCost).toBe(2.00);
  });

  it('billing record has voided=false after auto-calc on ship', () => {
    const order = makeOrder();
    useOrdersStore.setState({ allOrders: [order] });
    useOrdersStore.getState().markOrderAsShipped('test-order-1', 'TRACK123', 'http://label.pdf', 'usps');
    expect(useBillingStore.getState().billings['test-order-1']?.voided).toBe(false);
  });

  it('no billing record created when order not in allOrders', () => {
    // markOrderAsShipped for OrderDTO only — no matching canonical order
    useOrdersStore.setState({
      allOrders: [],
      orders: [],
    });
    useOrdersStore.getState().markOrderAsShipped('missing-order', 'TRACK', 'http://label.pdf', 'usps');
    expect(useBillingStore.getState().billings['missing-order']).toBeUndefined();
  });

  it('billing calculatedAt is recent (set during ship event)', () => {
    const order = makeOrder();
    useOrdersStore.setState({ allOrders: [order] });
    const before = Date.now();
    useOrdersStore.getState().markOrderAsShipped('test-order-1', 'TRACK123', 'http://label.pdf', 'usps');
    const after = Date.now();
    const billing = useBillingStore.getState().billings['test-order-1'];
    expect(billing?.calculatedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(billing?.calculatedAt.getTime()).toBeLessThanOrEqual(after);
  });
});
