/**
 * Orders store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderDTO, OrderStatus, Order, OrderId, OrderLabel, BillingCalculation } from '../types/orders';
import { getMockOrdersByStatus } from '../api/mock-data';
import { getMarkupRuleForCarrier, applyMarkup, type MarkupRule } from '../utils/markupService';
import { getCachedOrFetchedRate } from '../utils/rateFetchCache';
import { buildRateFetchRequest, type ClientCredentials } from '../api/rateService';
import { calculateBilling } from '../services/billingService';

// ─────────────────────────────────────────────────────────────────────────────
// Sync state shape
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncState {
  /** True while a sync is actively running. */
  syncing: boolean;
  /** ISO timestamp of the last successful sync. Null if never synced. */
  lastSyncTime: Date | null;
  /** Error message from the last failed sync. Null on success. */
  lastSyncError: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store shape
// ─────────────────────────────────────────────────────────────────────────────

interface OrdersState {
  // ── Paginated view (legacy OrderDTO shape) ────────────────────────────────
  orders: OrderDTO[];
  loading: boolean;
  error: string | null;
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  currentStatus: OrderStatus;
  searchQuery: string;
  dateStart: string | null;
  dateEnd: string | null;
  selectedOrderIds: Set<number>;

  // ── Canonical all-orders list (Order domain type, used by sync + hooks) ───
  /**
   * Full list of all known orders (canonical Order domain type).
   * Populated and updated by syncComplete().
   * Read by useSync, useRates, useCreateLabel.
   */
  allOrders: Order[];

  // ── Sync state ─────────────────────────────────────────────────────────────
  sync: SyncState;

  // ── Actions: paginated view ───────────────────────────────────────────────
  setStatus: (status: OrderStatus) => void;
  setPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (start: string | null, end: string | null) => void;
  toggleOrderSelection: (orderId: number) => void;
  selectAllOrders: () => void;
  clearSelection: () => void;
  fetchOrders: () => Promise<void>;
  applyMarkupToOrders: (orders: OrderDTO[], clientId: string, rules: MarkupRule[]) => void;
  enrichOrdersWithRates: (
    orders: OrderDTO[],
    clientId: string,
    credentials?: ClientCredentials,
    originZip?: string,
    serviceCode?: string,
  ) => Promise<void>;

  // ── Actions: billing ──────────────────────────────────────────────────────
  /**
   * Calculate order costs and store the result on the canonical Order in allOrders.
   *
   * Re-wired from PR #8 — was lost in merge conflict.
   *
   * @param orderId - Internal order ID (Order.id)
   * @param baseRate - Raw carrier rate in USD
   * @param residential - Whether the delivery is residential (adds surcharge)
   * @param markupPercent - Client markup percentage (e.g. 15 = 15%)
   */
  calculateOrderCosts: (
    orderId: string,
    baseRate: number,
    residential: boolean,
    markupPercent: number,
  ) => BillingCalculation | null;

  // ── Actions: label state machine ──────────────────────────────────────────
  /**
   * Transition order status to 'shipped' after successful label creation (OrderDTO).
   * State machine: awaiting_shipment → shipped (triggered by label print)
   */
  markOrderAsShipped: (
    orderId: string,
    shippingNumber: string,
    labelUrl: string,
    carrierCode: string,
  ) => void;

  /**
   * Record a label error for observability (OrderDTO). Does NOT change order status.
   */
  handleLabelError: (orderId: string, error: string) => void;

  /**
   * Attach a completed OrderLabel to an Order in allOrders.
   * Also transitions the order status to 'shipped'.
   * Called by useCreateLabel on successful label creation.
   */
  addLabel: (orderId: OrderId, label: OrderLabel) => void;

  // ── Actions: sync state machine ───────────────────────────────────────────
  /**
   * Signal that a sync has started.
   * Sets sync.syncing = true, clears sync.lastSyncError.
   */
  startSync: () => void;

  /**
   * Signal that a sync completed successfully.
   * Updates allOrders, sets lastSyncTime, clears syncing flag.
   *
   * @param syncedAt - Timestamp of the completed sync
   * @param allOrders - Merged orders from syncService result (may include externally shipped)
   */
  syncComplete: (syncedAt: Date, allOrders: Order[]) => void;

  /**
   * Mark an order as externally shipped and move it to shipped status.
   *
   * Q6 (DJ, LOCKED): "An order is considered externally shipped if it's been shipped
   * OUTSIDE of prepship OR shipstation. If shipstation has no records AND we didn't
   * ship out of prepship, then it is considered externally shipped."
   *
   * Called automatically by useAutoSync when detectExternallyShipped() fires.
   * Also moves the order to status='shipped' in the store.
   *
   * @param orderId - Internal Order.id (string)
   * @param detectedAt - Timestamp when external shipment was detected
   */
  markExternallyShipped: (orderId: OrderId, detectedAt: Date) => void;

  /**
   * Signal that a sync failed.
   * Clears syncing flag, records error message.
   *
   * @param errorMessage - Human-readable error for UI display
   */
  syncError: (errorMessage: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store implementation
// ─────────────────────────────────────────────────────────────────────────────

export const useOrdersStore = create<OrdersState>((set, get) => ({
  // ── Initial state: paginated view ─────────────────────────────────────────
  orders: [],
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

  // ── Initial state: canonical orders + sync ────────────────────────────────
  allOrders: [],
  sync: {
    syncing: false,
    lastSyncTime: null,
    lastSyncError: null,
  },

  // ── Paginated view actions ─────────────────────────────────────────────────
  setStatus: (status) => {
    set({ currentStatus: status, page: 1, selectedOrderIds: new Set() });
    get().fetchOrders();
  },
  setPage: (page) => { set({ page }); get().fetchOrders(); },
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDateRange: (start, end) => set({ dateStart: start, dateEnd: end }),

  toggleOrderSelection: (orderId) => set((state) => {
    const next = new Set(state.selectedOrderIds);
    if (next.has(orderId)) next.delete(orderId);
    else next.add(orderId);
    return { selectedOrderIds: next };
  }),
  selectAllOrders: () => set((state) => ({
    selectedOrderIds: new Set(state.orders.map(o => o.orderId)),
  })),
  clearSelection: () => set({ selectedOrderIds: new Set() }),

  fetchOrders: async () => {
    const { currentStatus, page, pageSize } = get();
    set({ loading: true, error: null });
    try {
      const result = getMockOrdersByStatus(currentStatus, page, pageSize);
      set({ orders: result.orders, total: result.total, pages: result.pages, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  applyMarkupToOrders: (orders, clientId, rules) => {
    if (!orders || orders.length === 0) return;
    const enriched: OrderDTO[] = orders.map((order): OrderDTO => {
      const carrier = order.enrichedRate?.carrierCode ?? order.selectedCarrierCode ?? order.selectedRate?.carrierCode;
      if (!carrier) {
        console.warn('[ordersStore] applyMarkupToOrders: no carrier', { orderId: order.orderId });
        return order;
      }
      const markupPercent = getMarkupRuleForCarrier(carrier, clientId, rules);
      if (order.enrichedRate) {
        return { ...order, enrichedRate: { ...order.enrichedRate, rate: applyMarkup(order.enrichedRate.rate, markupPercent) } };
      }
      if (order.selectedRate) {
        const baseRate = order.selectedRate.shipmentCost ?? order.selectedRate.amount;
        return { ...order, selectedRate: { ...order.selectedRate, amount: applyMarkup(baseRate, markupPercent) } };
      }
      return order;
    });
    set((state) => {
      const map = new Map(enriched.map((o) => [o.orderId, o]));
      return { orders: state.orders.map((o) => map.get(o.orderId) ?? o) };
    });
  },

  enrichOrdersWithRates: async (orders, _clientId, credentials = { apiKey: '', apiSecret: '' }, originZip = '92101', serviceCode = 'usps_priority_mail') => {
    if (!orders || orders.length === 0) return;
    const enriched: OrderDTO[] = await Promise.all(
      orders.map(async (order): Promise<OrderDTO> => {
        const request = buildRateFetchRequest(order, order.selectedCarrierCode ?? 'stamps_com', originZip);
        if (!request) {
          console.warn('[ordersStore] enrichOrdersWithRates: cannot build request', { orderId: order.orderId });
          return { ...order, ratesFetched: true, rateError: 'Missing weight, dimensions, or destination ZIP' };
        }
        try {
          const bestRate = await getCachedOrFetchedRate(request, credentials, serviceCode);
          if (!bestRate) return { ...order, ratesFetched: true, rateError: 'No rates available' };
          return {
            ...order,
            enrichedRate: { carrierCode: bestRate.carrierCode, serviceCode: bestRate.serviceCode, rate: bestRate.rate, fetchedAt: new Date() },
            ratesFetched: true,
            rateError: undefined,
          };
        } catch (err) {
          console.error('[ordersStore] enrichOrdersWithRates: fetch error', { orderId: order.orderId, error: err instanceof Error ? err.message : String(err) });
          return { ...order, ratesFetched: true, rateError: err instanceof Error ? err.message : 'Rate fetch failed' };
        }
      }),
    );
    set((state) => {
      const map = new Map(enriched.map((o) => [o.orderId, o]));
      return { orders: state.orders.map((o) => map.get(o.orderId) ?? o) };
    });
  },

  // ── Label state machine (OrderDTO) ─────────────────────────────────────────
  markOrderAsShipped: (orderId, shippingNumber, labelUrl, carrierCode) => {
    set((state) => ({
      orders: state.orders.map((o) => {
        if (String(o.orderId) !== String(orderId)) return o;
        return {
          ...o,
          status: 'shipped' as const,
          trackingNumber: shippingNumber,
          labelCreated: new Date().toISOString(),
          selectedCarrierCode: carrierCode,
          label: {
            shippingNumber,
            labelUrl,
            carrierCode,
            createdAt: new Date(),
            status: 'ready' as const,
          },
        };
      }),
    }));
  },

  handleLabelError: (orderId, error) => {
    // Log for observability; order status is NOT changed
    console.error('[ordersStore] handleLabelError', { orderId, error });
    // Toast is surfaced by labelStore — no duplicate toasts here
  },

  // ── calculateOrderCosts: billing calculation ───────────────────────────────
  // Re-wired from PR #8 — was lost in merge conflict.
  calculateOrderCosts: (orderId, baseRate, residential, markupPercent) => {
    // Residential surcharge: $4.40 (standard USPS/UPS residential fee)
    const residentialSurcharge = residential ? 4.40 : 0;

    const result = calculateBilling({
      baseRate,
      residentialSurcharge,
      carrierMarkupPercent: markupPercent,
      context: `orderId:${orderId}`,
    });

    if (!result.ok) {
      console.error('[ordersStore] calculateOrderCosts: billing error', {
        orderId,
        error: result.error.message,
        code: result.error.code,
      });
      return null;
    }

    const billing: BillingCalculation = result.calculation;

    set((state) => ({
      allOrders: state.allOrders.map((o) => {
        if (o.id !== orderId) return o;
        return { ...o, billing };
      }),
    }));

    return billing;
  },

  // ── addLabel: attach OrderLabel to canonical Order ─────────────────────────
  addLabel: (orderId, label) => {
    set((state) => ({
      allOrders: state.allOrders.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          status: 'shipped' as const,
          label,
        };
      }),
    }));
  },

  // ── Sync state machine ─────────────────────────────────────────────────────
  startSync: () => {
    set((state) => ({
      sync: {
        ...state.sync,
        syncing: true,
        lastSyncError: null,
      },
    }));
  },

  syncComplete: (syncedAt, allOrders) => {
    set({
      allOrders,
      sync: {
        syncing: false,
        lastSyncTime: syncedAt,
        lastSyncError: null,
      },
    });
  },

  // ── markExternallyShipped: Q6 external shipment handler ───────────────────
  markExternallyShipped: (orderId, detectedAt) => {
    set((state) => ({
      allOrders: state.allOrders.map((o) => {
        if (o.id !== orderId) return o;
        // Q6: externally shipped → mark flag + timestamp + move to shipped status
        return {
          ...o,
          externallyShipped: true,
          externallyShippedAt: detectedAt,
          status: 'shipped' as const,
        };
      }),
    }));
  },

  syncError: (errorMessage) => {
    set((state) => ({
      sync: {
        ...state.sync,
        syncing: false,
        lastSyncError: errorMessage,
      },
    }));
  },
}));
