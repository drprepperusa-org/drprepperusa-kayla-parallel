/**
 * UI store slice — Zustand v5
 */

import { create } from 'zustand';

export type ViewType = 'orders' | 'inventory' | 'locations' | 'packages' | 'rates' | 'analysis' | 'settings' | 'billing' | 'manifests';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  currentView: ViewType;
  sidebarOpen: boolean;
  sidebarMode: 'full' | 'rail' | 'drawer';
  toasts: Toast[];

  setView: (view: ViewType) => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarMode: (mode: 'full' | 'rail' | 'drawer') => void;
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: 'orders',
  sidebarOpen: false,
  sidebarMode: 'full',
  toasts: [],

  setView: (view) => set({ currentView: view }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarMode: (mode) => set({ sidebarMode: mode }),

  addToast: (message, type = 'info') => set((state) => ({
    toasts: [...state.toasts, { id: Date.now().toString(), message, type }],
  })),

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id),
  })),
}));
