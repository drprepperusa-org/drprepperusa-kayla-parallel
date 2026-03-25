/**
 * labelStore.ts — Zustand store for label state management
 *
 * Handles idempotency (no duplicate labels), loading states,
 * error tracking, and retry logic per order.
 */

import { create } from 'zustand';

import { createLabelWithShipStation, type Label, type LabelRequest, type ClientCredentials } from '../utils/labelService';
import { useOrdersStore } from './ordersStore';
import { useUIStore } from './uiStore';

// ─── Store interface ──────────────────────────────────────────────────────────

interface LabelStore {
  /** orderId → Label */
  labels: Record<string, Label>;
  /** orderId → error message */
  labelErrors: Record<string, string>;
  /** orderId → loading state */
  isCreatingLabel: Record<string, boolean>;

  /** Stored requests for retry — orderId → last LabelRequest + credentials */
  _pendingRequests: Record<string, { request: LabelRequest; credentials: ClientCredentials }>;

  // Actions
  createLabel: (request: LabelRequest, credentials: ClientCredentials) => Promise<Label>;
  retryLabel: (orderId: string) => Promise<Label>;
  getLabel: (orderId: string) => Label | null;
  getLabelError: (orderId: string) => string | null;
  clearLabelError: (orderId: string) => void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useLabelStore = create<LabelStore>((set, get) => ({
  labels: {},
  labelErrors: {},
  isCreatingLabel: {},
  _pendingRequests: {},

  createLabel: async (request: LabelRequest, credentials: ClientCredentials): Promise<Label> => {
    const { orderId } = request;

    // Idempotency: return existing label if already created
    const existing = get().labels[orderId];
    if (existing && existing.status === 'ready') {
      return existing;
    }

    // Prevent concurrent creation for the same order
    if (get().isCreatingLabel[orderId]) {
      return new Promise((_, reject) =>
        reject(new Error('Label creation already in progress for this order')),
      );
    }

    // Persist request for potential retry
    set((state) => ({
      isCreatingLabel: { ...state.isCreatingLabel, [orderId]: true },
      labelErrors: (() => {
        const next = { ...state.labelErrors };
        delete next[orderId];
        return next;
      })(),
      _pendingRequests: {
        ...state._pendingRequests,
        [orderId]: { request, credentials },
      },
    }));

    try {
      const label = await createLabelWithShipStation(request, credentials);

      set((state) => ({
        labels: { ...state.labels, [orderId]: label },
        isCreatingLabel: { ...state.isCreatingLabel, [orderId]: false },
      }));

      // Trigger order state transition → shipped
      useOrdersStore.getState().markOrderAsShipped(
        orderId,
        label.shippingNumber,
        label.labelUrl,
        label.carrierCode,
      );

      return label;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred creating the label';

      set((state) => ({
        isCreatingLabel: { ...state.isCreatingLabel, [orderId]: false },
        labelErrors: { ...state.labelErrors, [orderId]: message },
        // Store a 'failed' label entry to track the attempt
        labels: {
          ...state.labels,
          [orderId]: {
            shippingNumber: '',
            labelUrl: '',
            carrierCode: request.carrierCode,
            createdAt: new Date(),
            status: 'failed',
          },
        },
      }));

      // Surface error via toast
      useUIStore.getState().addToast(`Label error: ${message}`, 'error');

      throw err;
    }
  },

  retryLabel: async (orderId: string): Promise<Label> => {
    const pending = get()._pendingRequests[orderId];
    if (!pending) {
      throw new Error(`No label request found for order ${orderId}. Cannot retry.`);
    }

    // Clear the failed label entry so createLabel doesn't think it's 'ready'
    set((state) => {
      const next = { ...state.labels };
      delete next[orderId];
      return { labels: next };
    });

    return get().createLabel(pending.request, pending.credentials);
  },

  getLabel: (orderId: string): Label | null => {
    const label = get().labels[orderId];
    return label?.status === 'ready' ? label : null;
  },

  getLabelError: (orderId: string): string | null => {
    return get().labelErrors[orderId] ?? null;
  },

  clearLabelError: (orderId: string): void => {
    set((state) => {
      const next = { ...state.labelErrors };
      delete next[orderId];
      return { labelErrors: next };
    });
  },
}));
