/**
 * @file useCreateLabel.ts
 * @description React hook for creating a shipping label for an order.
 *
 * Wires to:
 * - src/api/proxyClient.ts (createLabelViaProxy) — server handles ShipStation V1+V2
 * - OrdersStore.addLabel (updates order state after successful creation)
 *
 * Usage in ShippingPanel (Create Label button):
 * ```tsx
 * const { createLabel, loading, error, label } = useCreateLabel(orderId);
 *
 * return (
 *   <button onClick={() => createLabel(selectedRate)} disabled={loading || !selectedRate}>
 *     {loading ? 'Creating Label...' : 'Create Label'}
 *   </button>
 * );
 * ```
 *
 * Idempotency: If a label already exists on the order in the store,
 * createLabel() returns it immediately without making an API call.
 */

import { useState, useCallback, useRef } from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import {
  type LabelServiceError,
  LabelServiceError as LabelServiceErrorClass,
} from '../services/labelService';
import { createLabelViaProxy } from '../api/proxyClient';
import type { OrderLabel, OrderId } from '../types/orders';
import type { ShipStationRate } from '../services/rateService';

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCreateLabelReturn {
  /**
   * Create a label for the order using the provided rate.
   * Updates OrdersStore on success.
   * No-op if label already exists.
   *
   * @param rate - Selected ShipStationRate from useRates()
   * @returns The created/existing OrderLabel, or null on error
   */
  createLabel: (rate: ShipStationRate) => Promise<OrderLabel | null>;
  /** True while label creation is in progress. */
  loading: boolean;
  /** Error from the last failed creation, or null. */
  error: LabelServiceError | null;
  /** The created label, or null if not yet created. */
  label: OrderLabel | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default origin address (warehouse)
// TODO: Pull from store/config once warehouse address is configurable
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SHIP_FROM = {
  name: 'DrPrepper USA',
  street1: '123 Warehouse Blvd',
  city: 'San Diego',
  state: 'CA',
  postalCode: '92101',
  country: 'US',
};

// ─────────────────────────────────────────────────────────────────────────────
// useCreateLabel hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a shipping label for an order.
 *
 * Behavior:
 * - Calls ShipStation V2 POST /labels + V1 GET /shipments/{id} (two-call flow)
 * - Updates OrdersStore.addLabel on success (transitions order to 'shipped')
 * - Idempotent: returns existing label if already created
 * - Exposes loading/error state for UI
 *
 * @param orderId - Internal order ID (Order.id)
 * @returns { createLabel, loading, error, label }
 *
 * @example
 * ```tsx
 * function ShippingPanel({ orderId }: { orderId: string }) {
 *   const { rates } = useRates(orderId);
 *   const [selectedRate, setSelectedRate] = useState<ShipStationRate | null>(null);
 *   const { createLabel, loading, error, label } = useCreateLabel(orderId);
 *
 *   const handleCreate = async () => {
 *     if (!selectedRate) return;
 *     await createLabel(selectedRate);
 *   };
 *
 *   return (
 *     <>
 *       {label && <p>Tracking: {label.trackingNumber}</p>}
 *       {error && <p className="error">{error.message}</p>}
 *       <button onClick={handleCreate} disabled={loading || !selectedRate}>
 *         {loading ? 'Creating...' : 'Create Label'}
 *       </button>
 *     </>
 *   );
 * }
 * ```
 */
export function useCreateLabel(orderId: OrderId | null): UseCreateLabelReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LabelServiceError | null>(null);
  const [label, setLabel] = useState<OrderLabel | null>(null);

  /**
   * Ref-based loading guard — prevents concurrent creation without being in
   * the useCallback dependency array (which would cause stale closure issues).
   */
  const isLoadingRef = useRef<boolean>(false);

  // Store actions
  const addLabel = useOrdersStore((state) => state.addLabel);
  const order = useOrdersStore((state) =>
    orderId ? state.allOrders.find((o) => o.id === orderId) ?? null : null,
  );

  const createLabel = useCallback(
    async (rate: ShipStationRate): Promise<OrderLabel | null> => {
      if (!orderId || !order) {
        console.warn('[useCreateLabel] No order found for orderId', { orderId });
        return null;
      }

      // Idempotency: return existing label without API call
      if (order.label) {
        setLabel(order.label);
        return order.label;
      }

      // Prevent concurrent creation via ref (not state, so it's not stale in closure)
      if (isLoadingRef.current) {
        console.warn('[useCreateLabel] Label creation already in progress', { orderId });
        return null;
      }

      isLoadingRef.current = true;
      setLoading(true);
      setError(null);

      const shipTo = order.shipTo;

      try {
        const result = await createLabelViaProxy({
          orderId: order.id,
          carrierCode: rate.carrierCode,
          serviceCode: rate.serviceCode,
          weightOz: order.weightOz,
          dimensions: {
            lengthIn: order.dimensions.lengthIn,
            widthIn: order.dimensions.widthIn,
            heightIn: order.dimensions.heightIn,
          },
          shipFrom: DEFAULT_SHIP_FROM,
          shipTo: {
            name: shipTo.name,
            company: shipTo.company,
            street1: shipTo.street1,
            street2: shipTo.street2,
            city: shipTo.city,
            state: shipTo.state,
            postalCode: shipTo.postalCode,
            country: shipTo.country ?? 'US',
            residential: shipTo.residential ?? false,
          },
          confirmation: 'none',
          testLabel: import.meta.env.DEV,
        });

        if (result.ok) {
          setLabel(result.data.label);
          setError(null);

          // Update the store — transitions order to 'shipped'
          addLabel(orderId, result.data.label);

          return result.data.label;
        } else {
          const proxyError = new LabelServiceErrorClass(
            result.error,
            result.status === 401
              ? 'AUTH_ERROR'
              : result.status >= 500
              ? 'API_ERROR'
              : 'API_ERROR',
          );
          setError(proxyError);
          console.error('[useCreateLabel] Label creation failed via proxy', {
            orderId,
            status: result.status,
            code: result.code,
            error: result.error,
          });
          return null;
        }
      } finally {
        // Always release the loading guard, even on unexpected errors
        isLoadingRef.current = false;
        setLoading(false);
      }
    },
    // isLoadingRef is NOT in deps — refs are stable and never stale
    [orderId, order, addLabel],
  );

  // Sync label from store if it changes externally (e.g. sync brought it in)
  const storeLabel = order?.label ?? null;
  const effectiveLabel = label ?? storeLabel;

  return {
    createLabel,
    loading,
    error,
    label: effectiveLabel,
  };
}
