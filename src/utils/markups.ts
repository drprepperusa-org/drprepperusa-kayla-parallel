/**
 * Markup calculation utilities — ported from prepship-v3
 */

import type { Rate } from '../types/orders';
import type { Markup, MarkupsMap } from '../types/markups';

export function getCarrierMarkup(
  carrierCode: string | undefined,
  shippingProviderId: number | undefined,
  markupsMap: MarkupsMap
): Markup {
  if (shippingProviderId && markupsMap[shippingProviderId]) return markupsMap[shippingProviderId];
  if (carrierCode && markupsMap[carrierCode]) return markupsMap[carrierCode];
  return { type: 'flat', value: 0 };
}

export function applyCarrierMarkup(rate: Rate, markupsMap: MarkupsMap): number {
  const baseCost = (rate.shipmentCost ?? rate.amount ?? 0) + (rate.otherCost ?? 0);
  const markup = getCarrierMarkup(rate.carrierCode, rate.shippingProviderId, markupsMap);
  if (!markup || !markup.value) return baseCost;
  return markup.type === 'pct' ? baseCost * (1 + markup.value / 100) : baseCost + markup.value;
}

export function pickBestRate(rates: Rate[] | null, markupsMap: MarkupsMap): Rate | null {
  if (!rates || rates.length === 0) return null;
  const available = rates.filter(r => {
    const baseCost = (r.shipmentCost ?? r.amount ?? 0) + (r.otherCost ?? 0);
    return baseCost > 0;
  });
  if (available.length === 0) return null;
  return available.reduce((best, current) => {
    return applyCarrierMarkup(current, markupsMap) < applyCarrierMarkup(best, markupsMap) ? current : best;
  });
}
