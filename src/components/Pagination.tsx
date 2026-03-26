/**
 * @file Pagination.tsx
 * @description Bottom pagination controls.
 * Left: page info + prev/next buttons.
 * Right: page size toggle (50 | 100 | 200) + display range.
 * All state from useOrdersStore.
 */

import React from 'react';
import { useOrdersStore } from '../stores/ordersStore';
import type { PageSize } from '../types/orders';
import styles from '../styles/AwaitingShipments.module.scss';

const PAGE_SIZES: PageSize[] = [50, 100, 200];

const Pagination: React.FC = () => {
  const currentPage = useOrdersStore((s) => s.pagination.currentPage);
  const ordersPerPage = useOrdersStore((s) => s.pagination.ordersPerPage);
  const setCurrentPage = useOrdersStore((s) => s.setCurrentPage);
  const setOrdersPerPage = useOrdersStore((s) => s.setOrdersPerPage);
  const getPaginationMeta = useOrdersStore((s) => s.getPaginationMeta);

  const meta = getPaginationMeta();
  const { totalPages, displayRange } = meta;

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className={styles.pagination}>
      {/* Left: page nav */}
      <div className={styles.paginationLeft}>
        <span className={styles.paginationInfo}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          className={styles.paginationButton}
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <button
          className={styles.paginationButton}
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={!canNext}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>

      {/* Right: display range + page size toggle */}
      <div className={styles.paginationRight}>
        <span className={styles.paginationDisplayRange}>{displayRange}</span>
        <div className={styles.pageSizeGroup} role="group" aria-label="Orders per page">
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              className={[
                styles.pageSizeButton,
                ordersPerPage === size ? styles.pageSizeButtonActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setOrdersPerPage(size)}
              aria-pressed={ordersPerPage === size}
              aria-label={`${size} orders per page`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Pagination;
