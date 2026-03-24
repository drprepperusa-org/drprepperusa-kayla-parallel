/**
 * Order detail panel store slice — Zustand v5
 * Controls open/close state and selected order for the detail panel.
 */

import { create } from 'zustand';
import type { OrderDTO } from '../types/orders';
import { getMockOrderById } from '../api/mock-data';

interface OrderDetailState {
  isOpen: boolean;
  selectedOrderId: number | null;
  selectedOrder: OrderDTO | null;
  loading: boolean;
  error: string | null;

  // Actions
  openDetail: (orderId: number) => Promise<void>;
  closeDetail: () => void;
}

export const useOrderDetailStore = create<OrderDetailState>((set) => ({
  isOpen: false,
  selectedOrderId: null,
  selectedOrder: null,
  loading: false,
  error: null,

  openDetail: async (orderId) => {
    set({ isOpen: true, selectedOrderId: orderId, loading: true, error: null });
    try {
      const order = getMockOrderById(orderId);
      if (!order) {
        set({ loading: false, error: `Order ${orderId} not found` });
      } else {
        set({ selectedOrder: order, loading: false });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load order',
      });
    }
  },

  closeDetail: () => set({ isOpen: false, selectedOrderId: null, selectedOrder: null, error: null }),
}));
