/**
 * Markups store slice — Zustand v5
 */

import { create } from 'zustand';
import type { MarkupsMap } from '../types/markups';

interface MarkupsState {
  markups: MarkupsMap;
  loading: boolean;

  setMarkups: (markups: MarkupsMap) => void;
  fetchMarkups: () => Promise<void>;
}

export const useMarkupsStore = create<MarkupsState>((set) => ({
  markups: {},
  loading: false,

  setMarkups: (markups) => set({ markups }),

  fetchMarkups: async () => {
    set({ loading: true });
    try {
      // Mock — API would load from /api/settings/rbMarkups
      set({ markups: {}, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
