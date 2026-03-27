/**
 * OrderNumberLink — clickable order number.
 *
 * Dispatches uiStore panel open on click.
 * Stops propagation to prevent double-firing with row click.
 *
 * Store subscription: none (click handler passed via props).
 */

import type { FC } from 'react';
import styles from './OrderNumberLink.module.scss';

export interface OrderNumberLinkProps {
  orderNumber: string;
  /** Called when the order number itself is clicked (opens panel) */
  onClick: (e: React.MouseEvent) => void;
}

const OrderNumberLink: FC<OrderNumberLinkProps> = ({ orderNumber, onClick }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't bubble to row click
    onClick(e);
  };

  return (
    <button
      type="button"
      className={styles.orderLink}
      onClick={handleClick}
      title={`Open order ${orderNumber}`}
    >
      {orderNumber}
    </button>
  );
};

export default OrderNumberLink;
