/**
 * @file SelectionBanner.tsx
 * @description Sticky top banner shown when 2+ orders are checkbox-selected.
 * Shows count + clear button. Driven by getBannerState().
 */

import React from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import styles from '../styles/AwaitingShipments.module.scss';

const SelectionBanner: React.FC = () => {
  const getBannerState = useOrdersStore((s) => s.getBannerState);
  const clearAllCheckboxes = useOrdersStore((s) => s.clearAllCheckboxes);

  const { show, count } = getBannerState();

  if (!show) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.bannerText}>
        <span>✓</span>
        <span>
          {count} Order{count !== 1 ? 's' : ''} Selected
        </span>
      </span>
      <button
        className={styles.bannerClose}
        onClick={clearAllCheckboxes}
        aria-label="Clear selection"
        title="Clear selection"
      >
        ✕
      </button>
    </div>
  );
};

export default SelectionBanner;
