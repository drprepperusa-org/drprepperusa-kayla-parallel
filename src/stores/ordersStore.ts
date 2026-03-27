/**
 * Orders store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderDTO, OrderStatus, Order, OrderId, OrderLabel, BillingCalculation } from '../types/orders';
import { getMockOrdersByStatus } from '../api/mock-data';
import { calculateBilling } from '../services/billingService';
import { useBillingStore } from './billingStore';

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
  activeClient: string | null;
  searchQuery: string;
  dateStart: string | null;
  dateEnd: string | null;
  selectedOrderIds: Set<number>;

  // ── UI: Zoom level for table (1 = 100%, 1.15 = 115%, 1.25 = 125%) ────────
  zoom: 1 | 1.15 | 1.25;
  setZoom: (zoom: 1 | 1.15 | 1.25) => void;

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
  setNavFilter: (status: OrderStatus, client: string | null) => void;
  setPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (start: string | null, end: string | null) => void;
  toggleOrderSelection: (orderId: number) => void;
  selectAllOrders: () => void;
  clearSelection: () => void;
  fetchOrders: () => Promise<void>;


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
  activeClient: null,
  searchQuery: '',
  dateStart: null,
  dateEnd: null,
  selectedOrderIds: new Set(),

  // ── UI zoom ───────────────────────────────────────────────────────────────
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),

  // ── Initial state: canonical orders + sync ────────────────────────────────
  allOrders: [],
  sync: {
    syncing: false,
    lastSyncTime: null,
    lastSyncError: null,
  },

  // ── Paginated view actions ─────────────────────────────────────────────────
  setStatus: (status) => {
    set({ currentStatus: status, activeClient: null, page: 1, selectedOrderIds: new Set() });
    get().fetchOrders();
  },
  setNavFilter: (status, client) => {
    set({ currentStatus: status, activeClient: client, page: 1, selectedOrderIds: new Set() });
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
    const { currentStatus, activeClient, page, pageSize, allOrders } = get();
    set({ loading: true, error: null });
    try {
      // Use real synced orders from allOrders if available; fall back to mock data
      // only when allOrders is empty (pre-sync state).
      if (allOrders.length > 0) {
        // Filter by status AND activeClient (if set) and paginate in-memory
        const filtered = allOrders.filter(
          (o) => o.status === currentStatus && (activeClient == null || o.clientId === activeClient),
        );
        const total = filtered.length;
        const pages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;
        const start = (page - 1) * pageSize;
        const pageOrders = filtered.slice(start, start + pageSize);

        // Map Order → OrderDTO shape for the paginated view
        const orderDTOs: OrderDTO[] = pageOrders.map((o): OrderDTO => ({
          orderId: o.orderId,
          orderNumber: o.orderNum,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.lastUpdatedAt.toISOString(),
          clientId: Number(o.clientId) || 0,
          storeId: o.storeId ?? 0,
          status: o.status,
          shipTo: {
            name: o.shipTo.name,
            company: o.shipTo.company,
            street1: o.shipTo.street1,
            street2: o.shipTo.street2,
            city: o.shipTo.city,
            state: o.shipTo.state,
            postalCode: o.shipTo.postalCode,
            country: o.shipTo.country,
          },
          residential: o.shipTo.residential,
          trackingNumber: o.label?.trackingNumber,
          labelCreated: o.label?.createdAt.toISOString(),
          selectedCarrierCode: o.label?.v1CarrierCode ?? o.label?.v2CarrierCode,
          selectedRate: undefined,
          enrichedRate: undefined,
          ratesFetched: false,
          rateError: undefined,
        }));

        set({ orders: orderDTOs, total, pages, loading: false });
      } else {
        // Fallback: show mock data when no real orders loaded yet
        const result = getMockOrdersByStatus(currentStatus, page, pageSize);
        // Apply activeClient filter on mock data (clientId is number in DTO)
        const filteredOrders = activeClient != null
          ? result.orders.filter((o) => String(o.clientId) === activeClient)
          : result.orders;
        const filteredTotal = activeClient != null ? filteredOrders.length : result.total;
        const filteredPages = pageSize > 0 ? Math.ceil(filteredTotal / pageSize) : 1;
        set({ orders: filteredOrders, total: filteredTotal, pages: filteredPages, loading: false });
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
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

    // Q7 (DJ, LOCKED): "The billing should automatically update as soon as each
    // order is processed and shipped."
    // Auto-calculate billing using the label's shipment cost (NOT fetched rates).
    // We look up the matching canonical Order to get weightOz + markup percent.
    const canonicalOrder = get().allOrders.find((o) => o.id === String(orderId));
    if (canonicalOrder) {
      // Resolve shipmentCost from the OrderDTO that was just updated
      const dto = get().orders.find((o) => String(o.orderId) === String(orderId));
      // Q7: Use label shipmentCost if available; selectedRate.shipmentCost is a
      // pre-creation value so it serves as fallback only — true label cost comes
      // from the label record once the API response is persisted.
      const shippingCost =
        dto?.selectedRate?.shipmentCost ??
        dto?.selectedRate?.amount ??
        canonicalOrder.baseRate ??
        0;

      // Resolve carrier markup: callers (labelStore / useCreateLabel) should pass
      // markup percent explicitly when a higher-level integration is built.
      // For now, default to 0% (conservative — never inflate silently).
      useBillingStore.getState().calculateBilling({
        orderId: String(orderId),
        shippingCost,
        weightOz: canonicalOrder.weightOz,
        carrierMarkupPercent: 0, // Conservative default — override when markup is known
        customer: canonicalOrder.customer,
        orderDate: canonicalOrder.orderDate,
        storeId: canonicalOrder.storeId,
      });
    }
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
    // Refresh paginated view with real orders now that allOrders is populated
    void get().fetchOrders();
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
