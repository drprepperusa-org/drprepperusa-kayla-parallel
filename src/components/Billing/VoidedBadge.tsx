/**
 * VoidedBadge.tsx — Badge shown on voided billing records.
 *
 * Q7 (DJ, LOCKED): "If an order has been voided, then there should be a mark
 * on the billing at the order level notating that."
 *
 * When a billing record is voided:
 *  - This badge is displayed in the billing table (gray, "Voided" text)
 *  - Recalculation is prevented (billingStore.recalculateBilling returns null)
 */

import React from 'react';

interface VoidedBadgeProps {
  /** ISO timestamp when the record was voided — shown as a tooltip. */
  voidedAt?: Date;
  /** Additional CSS class for layout overrides. */
  className?: string;
}

/**
 * Gray "Voided" badge for billing records that have been voided.
 * Renders inline — insert in any table cell or status area.
 */
export function VoidedBadge({ voidedAt, className }: VoidedBadgeProps): React.ReactElement {
  const title = voidedAt
    ? `Voided on ${voidedAt.toLocaleDateString()} at ${voidedAt.toLocaleTimeString()}`
    : 'Voided';

  return (
    <span
      data-testid="voided-badge"
      title={title}
      className={className}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        backgroundColor: '#9e9e9e',
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      Voided
    </span>
  );
}

export default VoidedBadge;
