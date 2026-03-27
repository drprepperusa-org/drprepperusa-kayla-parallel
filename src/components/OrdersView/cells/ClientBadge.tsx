/**
 * ClientBadge — color-coded pill badge for client name.
 *
 * Color is derived deterministically from client name via djb2 hash (HSL).
 * Never hardcoded — same client always gets the same color.
 *
 * No store subscription — pure display from props.
 */

import type { FC, CSSProperties } from 'react';
import { getClientColor } from '../../../utils/clientColor';
import styles from './ClientBadge.module.scss';

export interface ClientBadgeProps {
  /** Client display name (used as hash input + label) */
  clientName: string;
}

const ClientBadge: FC<ClientBadgeProps> = ({ clientName }) => {
  const { bg, text } = getClientColor(clientName);

  const style: CSSProperties = {
    backgroundColor: bg,
    color: text,
  };

  return (
    <span className={styles.clientBadge} style={style} title={clientName}>
      {clientName}
    </span>
  );
};

export default ClientBadge;
