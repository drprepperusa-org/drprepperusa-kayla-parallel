/**
 * Orders store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderDTO, OrderStatus } from '../types/orders';
import { getMockOrdersByStatus } from '../api/mock-data';
import { getCachedOrFetchedRate } from '../utils/rateFetchCache';
import { buildRateFetchRequest, type ClientCredentials } from '../api/rateService';

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
   * Enrich a batch of orders with the best available shipping rate.
   *
   * SCAFFOLD STATUS (Feature 6): Wired but returns stub rates until ShipStation
   * API integration and credential storage are resolved.
   *
   * For each order:
   *   1. Build a RateFetchRequest from order data
   *   2. Call getCachedOrFetchedRate() (cache-first, then ShipStation)
   *   3. Set order.enrichedRate and order.ratesFetched = true
   *   4. Set order.rateError if fetch failed
   *   5. Persist enriched orders to store
   *
   * TODO (Markup Chain): After Feature 4 ships, apply markup to enrichedRate.rate:
   *   rate = bestRate.rate + (bestRate.rate × carrierMarkupPct) + residentialSurcharge
   *
   * @param orders - Orders to enrich (typically the current store page)
   * @param clientId - Tenant identifier for credential lookup
   * @param credentials - ShipStation API credentials (placeholder until storage ships)
   * @param originZip - Origin warehouse ZIP code
   * @param serviceCode - ShipStation service code for cache key
   */
  enrichOrdersWithRates: (
    orders: OrderDTO[],
    clientId: string,
    credentials?: ClientCredentials,
    originZip?: string,
    serviceCode?: string,
  ) => Promise<void>;
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

  enrichOrdersWithRates: async (
    orders,
    _clientId,
    credentials = { apiKey: '', apiSecret: '' },
    originZip = '92101',
    serviceCode = 'usps_priority_mail',
  ) => {
    if (!orders || orders.length === 0) return;

    const enriched: OrderDTO[] = await Promise.all(
      orders.map(async (order): Promise<OrderDTO> => {
        const request = buildRateFetchRequest(
          order,
          order.selectedCarrierCode ?? 'stamps_com',
          originZip,
        );

        if (!request) {
          console.warn('[ordersStore] enrichOrdersWithRates: cannot build request', {
            orderId: order.orderId,
          });
          return {
            ...order,
            ratesFetched: true,
            rateError: 'Missing weight, dimensions, or destination ZIP',
          };
        }

        try {
          const bestRate = await getCachedOrFetchedRate(request, credentials, serviceCode);

          if (!bestRate) {
            return { ...order, ratesFetched: true, rateError: 'No rates available' };
          }

          return {
            ...order,
            enrichedRate: {
              carrierCode: bestRate.carrierCode,
              serviceCode: bestRate.serviceCode,
              rate: bestRate.rate,
              // TODO (Markup Chain): rate = bestRate.rate + (bestRate.rate × markupPct) + residentialSurcharge
              fetchedAt: new Date(),
            },
            ratesFetched: true,
            rateError: undefined,
          };
        } catch (err) {
          console.error('[ordersStore] enrichOrdersWithRates: fetch error', {
            orderId: order.orderId,
            error: err instanceof Error ? err.message : String(err),
          });
          return {
            ...order,
            ratesFetched: true,
            rateError: err instanceof Error ? err.message : 'Rate fetch failed',
          };
        }
      }),
    );

    // Merge enriched orders back into store, preserving orders not in this batch
    set((state) => {
      const enrichedMap = new Map(enriched.map((o) => [o.orderId, o]));
      return {
        orders: state.orders.map((o) => enrichedMap.get(o.orderId) ?? o),
      };
    });
  },
}));
