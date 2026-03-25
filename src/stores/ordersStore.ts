/**
 * Orders store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderDTO, OrderStatus } from '../types/orders';
import { getMockOrdersByStatus } from '../api/mock-data';
import { getMarkupRuleForCarrier, applyMarkup, type MarkupRule } from '../utils/markupService';

interface OrdersState {
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

  // Actions
  setStatus: (status: OrderStatus) => void;
  setPage: (page: number) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (start: string | null, end: string | null) => void;
  toggleOrderSelection: (orderId: number) => void;
  selectAllOrders: () => void;
  clearSelection: () => void;
  fetchOrders: () => Promise<void>;
  /**
   * Apply markup chain to a batch of orders using the provided markup rules.
   *
   * For each order:
   *   1. Look up carrier markup % from rules (carrier + clientId)
   *   2. Calculate: markedUpRate = applyMarkup(order.rate, markupPercent)
   *   3. Store updated rate on enrichedRate (if enriched) or selectedRate
   *
   * Markup is applied AFTER residential surcharge (per Billing feature spec).
   *
   * @param orders   - Orders to apply markup to
   * @param clientId - Tenant identifier for rule lookup
   * @param rules    - Markup rules from markupStore
   */
  applyMarkupToOrders: (orders: OrderDTO[], clientId: string, rules: MarkupRule[]) => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
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

  setStatus: (status) => {
    set({ currentStatus: status, page: 1, selectedOrderIds: new Set() });
    get().fetchOrders();
  },

  setPage: (page) => {
    set({ page });
    get().fetchOrders();
  },

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
      set({
        orders: result.orders,
        total: result.total,
        pages: result.pages,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  },

  applyMarkupToOrders: (orders, clientId, rules) => {
    if (!orders || orders.length === 0) return;

    const enriched: OrderDTO[] = orders.map((order): OrderDTO => {
      // Resolve the carrier from enrichedRate, selectedCarrierCode, or selectedRate
      const carrier =
        order.enrichedRate?.carrierCode ??
        order.selectedCarrierCode ??
        order.selectedRate?.carrierCode;

      if (!carrier) {
        // No carrier info — cannot apply markup, return order unchanged
        console.warn('[ordersStore] applyMarkupToOrders: no carrier on order', {
          orderId: order.orderId,
        });
        return order;
      }

      const markupPercent = getMarkupRuleForCarrier(carrier, clientId, rules);

      // Apply markup to enrichedRate if available, otherwise to selectedRate
      if (order.enrichedRate) {
        const markedUpRate = applyMarkup(order.enrichedRate.rate, markupPercent);
        return {
          ...order,
          enrichedRate: {
            ...order.enrichedRate,
            rate: markedUpRate,
          },
        };
      }

      if (order.selectedRate) {
        const baseRate = order.selectedRate.shipmentCost ?? order.selectedRate.amount;
        const markedUpRate = applyMarkup(baseRate, markupPercent);
        return {
          ...order,
          selectedRate: {
            ...order.selectedRate,
            amount: markedUpRate,
          },
        };
      }

      return order;
    });

    // Merge enriched orders back into store
    set((state) => {
      const enrichedMap = new Map(enriched.map((o) => [o.orderId, o]));
      return {
        orders: state.orders.map((o) => enrichedMap.get(o.orderId) ?? o),
      };
    });
  },
}));
