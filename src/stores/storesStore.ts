/**
 * Stores store slice — Zustand v5
 */

import { create } from 'zustand';
import type { OrderStatus, StoreDTO } from '../types/orders';
import { MOCK_STORES, getMockStoreCounts } from '../api/mock-data';

interface StatusCounts {
  awaiting_shipment: number;
  shipped: number;
  cancelled: number;
}

interface StoreCountsByStatus {
  awaiting_shipment: Record<number, number>;
  shipped: Record<number, number>;
  cancelled: Record<number, number>;
}

interface StoresState {
  stores: StoreDTO[];
  loading: boolean;
  activeStoreId: number | null;
  statusCounts: StatusCounts;
  storeCountsByStatus: StoreCountsByStatus;

  setActiveStore: (storeId: number | null) => void;
  fetchStores: () => Promise<void>;
  fetchStatusCounts: () => Promise<void>;
}

export const useStoresStore = create<StoresState>((set) => ({
  stores: [],
  loading: false,
  activeStoreId: null,
  statusCounts: { awaiting_shipment: 0, shipped: 0, cancelled: 0 },
  storeCountsByStatus: { awaiting_shipment: {}, shipped: {}, cancelled: {} },

  setActiveStore: (storeId) => set({ activeStoreId: storeId }),

  fetchStores: async () => {
    set({ loading: true });
    try {
      set({ stores: MOCK_STORES, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchStatusCounts: async () => {
    try {
      const statuses: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled'];
      const storeCountsByStatus: StoreCountsByStatus = { awaiting_shipment: {}, shipped: {}, cancelled: {} };
      const statusCounts: StatusCounts = { awaiting_shipment: 0, shipped: 0, cancelled: 0 };

      for (const s of statuses) {
        const counts = getMockStoreCounts(s);
        storeCountsByStatus[s] = counts;
        statusCounts[s] = Object.values(counts).reduce((a, b) => a + b, 0);
      }

      set({ statusCounts, storeCountsByStatus });
    } catch {
      // Silent fail
    }
  },
}));
