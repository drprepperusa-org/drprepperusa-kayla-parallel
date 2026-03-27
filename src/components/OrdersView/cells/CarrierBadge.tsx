/**
 * CarrierBadge — chip displaying carrier/service code.
 *
 * Normalizes carrier codes to human-friendly labels.
 * No store subscription — pure display from props.
 */

import type { FC } from 'react';
import styles from './CarrierBadge.module.scss';

export interface CarrierBadgeProps {
  /** Carrier code (e.g. 'stamps_com', 'ups', 'fedex') or service code */
  carrierCode?: string | null;
  /** Optional service code for compound display */
  serviceCode?: string | null;
}

/** Map well-known carrier codes to display labels */
const CARRIER_LABELS: Record<string, string> = {
  stamps_com: 'USPS',
  usps: 'USPS',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl_express: 'DHL',
  dhl: 'DHL',
  ontrac: 'OnTrac',
  amazon_buy_shipping: 'Amazon',
  amazon: 'Amazon',
};

function normalizeCarrier(code: string): string {
  const key = code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return CARRIER_LABELS[key] ?? code.toUpperCase().replace(/_/g, ' ');
}

const CarrierBadge: FC<CarrierBadgeProps> = ({ carrierCode, serviceCode }) => {
  const display = carrierCode
    ? normalizeCarrier(carrierCode)
    : serviceCode
      ? serviceCode.toUpperCase()
      : null;

  if (!display) {
    return <span className={styles.empty}>—</span>;
  }

  return (
    <span className={styles.carrierBadge} title={serviceCode ?? carrierCode ?? undefined}>
      {display}
    </span>
  );
};

export default CarrierBadge;
