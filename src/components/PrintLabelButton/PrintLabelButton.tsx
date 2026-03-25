/**
 * PrintLabelButton — Order Detail Panel action button
 *
 * Handles label creation via ShipStation, order state transition to 'shipped',
 * idempotency enforcement, and user-friendly error/success feedback.
 */

import { useLabelStore } from '../../stores/labelStore';
import type { OrderDTO } from '../../types/orders';
import type { LabelRequest, ClientCredentials } from '../../utils/labelService';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PrintLabelButtonProps {
  order: OrderDTO;
  credentials: ClientCredentials;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrintLabelButton({
  order,
  credentials,
  className = '',
}: PrintLabelButtonProps) {
  const { createLabel, getLabel, getLabelError, isCreatingLabel } = useLabelStore();

  const orderId = String(order.orderId);
  const existingLabel = getLabel(orderId);
  const labelError = getLabelError(orderId);
  const isLoading = isCreatingLabel[orderId] ?? false;

  // Idempotency: label already printed — show disabled state
  if (existingLabel) {
    return (
      <button
        className={className}
        disabled
        title={`Tracking: ${existingLabel.shippingNumber}`}
        style={{ opacity: 0.6, cursor: 'not-allowed' }}
        aria-label="Label already printed"
      >
        ✅ Label Already Printed
      </button>
    );
  }

  // If order is already shipped and has a tracking number, guard against re-printing
  if (order.status === 'shipped' && order.trackingNumber) {
    return (
      <button
        className={className}
        disabled
        title={`Tracking: ${order.trackingNumber}`}
        style={{ opacity: 0.6, cursor: 'not-allowed' }}
        aria-label="Order already shipped"
      >
        ✅ Order Shipped
      </button>
    );
  }

  const handleClick = async () => {
    if (isLoading) return;

    // Build label request from order data
    const request: LabelRequest = {
      orderId,
      clientId: String(order.clientId),
      carrierCode: order.selectedCarrierCode ?? order.selectedRate?.carrierCode ?? 'stamps_com',
      weight: order._enrichedWeight?.value ?? order.weight?.value ?? 16,
      dimensions: order._enrichedDims ?? order.dimensions ?? { length: 6, width: 4, height: 2 },
      originZip: '92101',   // TODO: pull from client/store config
      destinationZip: order.shipTo?.postalCode ?? '',
      residentialFlag: order.residential ?? false,
      shipFromAddress: {
        name: 'DrPrepperUSA Warehouse',
        street1: '123 Warehouse Dr',
        city: 'San Diego',
        state: 'CA',
        postalCode: '92101',
        country: 'US',
      },
      shipToAddress: order.shipTo ?? {},
    };

    try {
      await createLabel(request, credentials);
    } catch {
      // Error handled by labelStore (toast + store state)
    }
  };

  return (
    <div>
      <button
        className={className}
        onClick={handleClick}
        disabled={isLoading || order.status === 'cancelled'}
        aria-busy={isLoading}
        aria-label={isLoading ? 'Creating label…' : 'Print shipping label'}
      >
        {isLoading ? '⏳ Creating Label…' : '🖨 Print Label'}
      </button>
      {labelError && (
        <div
          role="alert"
          style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}
        >
          {labelError}
        </div>
      )}
    </div>
  );
}
