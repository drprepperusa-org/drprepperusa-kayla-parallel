/**
 * Orders store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderDTO, OrderStatus } from '../types/orders';
import { getMockOrdersByStatus } from '../api/mock-data';

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
}));
