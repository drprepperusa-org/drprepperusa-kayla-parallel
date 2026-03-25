/**
 * markupStore.ts
 *
 * Zustand store for admin markup configuration (Feature 4: Markup Chain).
 *
 * Manages per-carrier, per-client markup rules.
 * Admins configure these via the admin settings UI.
 *
 * Default rules:
 *   USPS:  10% markup (clientId: 'default')
 *   UPS:   15% markup (clientId: 'default')
 *   FedEx: 20% markup (clientId: 'default')
 */

import { create } from 'zustand';
import type { MarkupRule } from '../utils/markupService';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface MarkupStore {
  rules: MarkupRule[];

  /** Add a new markup rule. Replaces existing rule if carrier+clientId already exists. */
  addRule: (rule: MarkupRule) => void;

  /** Update markup percent for an existing carrier+clientId rule. */
  updateRule: (carrier: string, clientId: string, markupPercent: number) => void;

  /** Remove a markup rule by carrier+clientId. No-op if not found. */
  deleteRule: (carrier: string, clientId: string) => void;

  /** Get all rules for a given client. */
  getRulesForClient: (clientId: string) => MarkupRule[];
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useMarkupStore = create<MarkupStore>((set, get) => ({
  rules: [
    {
      carrier: 'USPS',
      markupPercent: 10,
      clientId: 'default',
      updatedAt: new Date(),
    },
    {
      carrier: 'UPS',
      markupPercent: 15,
      clientId: 'default',
      updatedAt: new Date(),
    },
    {
      carrier: 'FedEx',
      markupPercent: 20,
      clientId: 'default',
      updatedAt: new Date(),
    },
  ],

  addRule: (rule) => {
    set((state) => {
      // Replace existing rule if carrier+clientId match (upsert behavior)
      const exists = state.rules.some(
        (r) =>
          r.carrier.toUpperCase() === rule.carrier.toUpperCase() &&
          r.clientId === rule.clientId,
      );

      if (exists) {
        return {
          rules: state.rules.map((r) =>
            r.carrier.toUpperCase() === rule.carrier.toUpperCase() &&
            r.clientId === rule.clientId
              ? { ...rule, updatedAt: new Date() }
              : r,
          ),
        };
      }

      return { rules: [...state.rules, { ...rule, updatedAt: new Date() }] };
    });
  },

  updateRule: (carrier, clientId, markupPercent) => {
    set((state) => ({
      rules: state.rules.map((r) =>
        r.carrier.toUpperCase() === carrier.toUpperCase() && r.clientId === clientId
          ? { ...r, markupPercent, updatedAt: new Date() }
          : r,
      ),
    }));
  },

  deleteRule: (carrier, clientId) => {
    set((state) => ({
      rules: state.rules.filter(
        (r) =>
          !(r.carrier.toUpperCase() === carrier.toUpperCase() && r.clientId === clientId),
      ),
    }));
  },

  getRulesForClient: (clientId) => {
    return get().rules.filter((r) => r.clientId === clientId);
  },
}));
