/**
 * AgeBadge — colored dot + relative time display for order age.
 *
 * States:
 *   green  = <24h
 *   orange = 24–48h
 *   red    = >48h
 *
 * No store subscription — pure display from props.
 */

import type { FC } from 'react';
import { ageColor, ageDisplay } from '../../../utils/orders';
import styles from './AgeBadge.module.scss';

export interface AgeBadgeProps {
  /** ISO date string (createdAt) */
  createdAt: string;
}

const AgeBadge: FC<AgeBadgeProps> = ({ createdAt }) => {
  const color = ageColor(createdAt);
  const display = ageDisplay(createdAt);

  return (
    <span className={`${styles.ageBadge} ${styles[color]}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{display}</span>
    </span>
  );
};

export default AgeBadge;
