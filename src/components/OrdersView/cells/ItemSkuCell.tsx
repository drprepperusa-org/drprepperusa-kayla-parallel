/**
 * ItemSkuCell — ITEM/SKU column cell.
 *
 * For single-item orders: shows SKU + name inline.
 * For multi-item orders: shows primary SKU + name (sub-rows handled in OrderRow).
 *
 * No store subscription — pure display from props.
 */

import type { FC } from 'react';
import type { OrderDTOItem } from '../../../types/orders';
import styles from './ItemSkuCell.module.scss';

export interface ItemSkuCellProps {
  items: OrderDTOItem[];
  /** Primary SKU derived via getPrimarySku */
  primarySku: string;
}

const ItemSkuCell: FC<ItemSkuCellProps> = ({ items, primarySku }) => {
  const primaryItem = items.find(i => i.sku === primarySku) ?? items[0];
  const name = primaryItem?.name ?? '—';
  const count = items.filter(i => !i.adjustment).length;

  return (
    <span className={styles.cell}>
      <span className={styles.sku}>{primarySku || '—'}</span>
      {name && name !== '—' && (
        <span className={styles.name} title={name}>{name}</span>
      )}
      {count > 1 && (
        <span className={styles.multiCount}>+{count - 1}</span>
      )}
    </span>
  );
};

export default ItemSkuCell;
