/**
 * @file ShippingPanel.tsx
 * @description Shipping action panel — shown in order detail for creating labels.
 *
 * Q6 (DJ, LOCKED): External shipment detection.
 * "An order is considered externally shipped if it's been shipped OUTSIDE of prepship
 * OR shipstation. If there are shipstation records then it is considered shipped within
 * shipstation. If shipstation has no records AND we didn't ship out of prepship, then it
 * is considered externally shipped."
 *
 * If externallyShipped === true:
 *   - "Create Label" button is DISABLED
 *   - Alert is shown: "⚠️ Order shipped externally. Creating a label will result in double-shipping."
 *   - externallyShippedAt timestamp is displayed
 */

import type { Order } from '../../types/orders';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDateTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ShippingPanelProps {
  /** The canonical Order domain type (from syncService / ordersStore.allOrders). */
  order: Order;
  /** Callback when "Create Label" is clicked (only fires if not externally shipped). */
  onCreateLabel?: () => void;
  /** Optional: additional CSS class for the panel wrapper. */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ShippingPanel — shows label creation action for an order.
 *
 * Enforces Q6 guard: if order.externallyShipped === true, the "Create Label" button
 * is disabled and a warning alert is shown to prevent double-shipping.
 */
export function ShippingPanel({ order, onCreateLabel, className = '' }: ShippingPanelProps) {
  const { externallyShipped, externallyShippedAt, label, status } = order;

  // Guard: already has a label created in this app
  const hasInternalLabel = label != null;

  // Guard: order already shipped (internally)
  const isAlreadyShipped = status === 'shipped' && hasInternalLabel;

  // Q6 guard: externally shipped orders must NOT get a new label
  const isExternallyShipped = externallyShipped === true;

  // Determine if Create Label is allowed
  const canCreateLabel = !isExternallyShipped && !isAlreadyShipped && status !== 'cancelled';

  return (
    <div className={`shipping-panel${className ? ` ${className}` : ''}`}>

      {/* ── Q6 External Shipment Alert ── */}
      {isExternallyShipped && (
        <div
          className="shipping-panel__external-alert"
          role="alert"
          aria-live="polite"
          data-testid="external-shipment-alert"
          style={{
            background: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>
            ⚠️ Order shipped externally. Creating a label will result in double-shipping.
          </span>
          {externallyShippedAt && (
            <span
              style={{ fontSize: 12, color: '#78350f' }}
              data-testid="external-shipment-timestamp"
            >
              Detected at: {fmtDateTime(externallyShippedAt)}
            </span>
          )}
        </div>
      )}

      {/* ── Already has an internal label ── */}
      {isAlreadyShipped && !isExternallyShipped && label && (
        <div
          className="shipping-panel__shipped-notice"
          style={{
            background: '#d1fae5',
            border: '1px solid #10b981',
            borderRadius: 6,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 13,
            color: '#065f46',
          }}
        >
          ✅ Label created — Tracking: {label.trackingNumber}
        </div>
      )}

      {/* ── Create Label Button ── */}
      <button
        className="shipping-panel__create-label-btn"
        data-testid="create-label-btn"
        disabled={!canCreateLabel}
        onClick={() => {
          if (canCreateLabel && onCreateLabel) {
            onCreateLabel();
          }
        }}
        aria-disabled={!canCreateLabel}
        title={
          isExternallyShipped
            ? 'Disabled: order was shipped externally — creating a label would cause double-shipping'
            : isAlreadyShipped
            ? 'Label already created for this order'
            : status === 'cancelled'
            ? 'Order is cancelled'
            : 'Create shipping label'
        }
        style={{
          padding: '10px 20px',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 14,
          cursor: canCreateLabel ? 'pointer' : 'not-allowed',
          opacity: canCreateLabel ? 1 : 0.5,
          background: canCreateLabel ? '#2563eb' : '#9ca3af',
          color: '#fff',
          border: 'none',
          transition: 'background 0.15s, opacity 0.15s',
        }}
      >
        {isExternallyShipped
          ? '🚫 Create Label (Disabled — Externally Shipped)'
          : isAlreadyShipped
          ? '✅ Label Already Created'
          : status === 'cancelled'
          ? 'Order Cancelled'
          : '🏷️ Create Label'}
      </button>

    </div>
  );
}

export default ShippingPanel;
