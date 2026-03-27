/**
 * rateMarkupStore.ts
 *
 * Zustand store for Rate Browser per-carrier account markups.
 * Used in Settings → Markup Settings section.
 *
 * Markup types:
 *   'flat' = fixed dollar amount (+$X.XX)
 *   'pct'  = percentage (+X%)
 */

import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkupEntry {
  id: string;
  name: string;
  type: 'flat' | 'pct'; // 'flat' = $, 'pct' = %
  value: number;
}

interface MarkupState {
  markups: MarkupEntry[];
  setMarkupType: (id: string, type: 'flat' | 'pct') => void;
  setMarkupValue: (id: string, value: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed data
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_CARRIERS: MarkupEntry[] = [
  { id: 'usps_chase', name: 'USPS Chase x7439', type: 'flat', value: 0 },
  { id: 'ups_chase', name: 'UPS by SS - Chase x7439', type: 'flat', value: 0 },
  { id: 'gg6381_a', name: 'GG6381', type: 'flat', value: 0 },
  { id: 'gg6381_b', name: 'GG6381', type: 'flat', value: 0 },
  { id: 'g19y32', name: 'G19Y32', type: 'flat', value: 0 },
  { id: 'orion', name: 'ORION', type: 'pct', value: 15 },
  { id: 'rocel_a', name: 'ROCEL', type: 'flat', value: 0 },
  { id: 'rocel_b', name: 'ROCEL', type: 'flat', value: 0 },
  { id: 'rocel_c81f70_a', name: 'ROCEL C81F70', type: 'flat', value: 0 },
  { id: 'rocel_c81f70_b', name: 'ROCEL C81F70', type: 'flat', value: 0 },
  { id: 'fedex_a', name: 'FedEx', type: 'flat', value: 0 },
  { id: 'fedex_b', name: 'FedEx', type: 'flat', value: 0 },
  { id: 'fedex_one_a', name: 'FedEx One Balance', type: 'flat', value: 0 },
  { id: 'fedex_one_b', name: 'FedEx One Balance', type: 'flat', value: 0 },
  { id: 'greg_payability', name: 'GREG PAYABILITY 6/17', type: 'flat', value: 0 },
  { id: 'ori', name: 'ORI Account', type: 'pct', value: 15 },
  { id: 'amazon', name: 'Amazon Buy Shipping', type: 'flat', value: 0 },
  { id: 'sendle', name: 'Sendle', type: 'flat', value: 0 },
  { id: 'amazon_us', name: 'Amazon Shipping US', type: 'flat', value: 0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useRateMarkupStore = create<MarkupState>((set) => ({
  markups: MOCK_CARRIERS,

  setMarkupType: (id, type) => {
    set((state) => ({
      markups: state.markups.map((m) => (m.id === id ? { ...m, type } : m)),
    }));
  },

  setMarkupValue: (id, value) => {
    set((state) => ({
      markups: state.markups.map((m) => (m.id === id ? { ...m, value } : m)),
    }));
  },
}));
