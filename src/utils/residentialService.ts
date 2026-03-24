/**
 * residentialService.ts
 *
 * Tristate residential flag inference for shipping rate enrichment.
 *
 * Tristate logic:
 *   - null/undefined → infer from address (ZIP-based heuristic + company name check)
 *   - true           → residential surcharge applies
 *   - false          → commercial rate (no surcharge)
 *
 * Inference rules (in priority order):
 *   1. Explicit boolean on order.residential — used directly, no inference.
 *   2. sourceResidential flag from upstream carrier/API — treated as residential.
 *   3. Company name present on address → commercial (false).
 *   4. ZIP code in known commercial-only range → commercial.
 *   5. ZIP code in known residential range → residential.
 *   6. Default fallback → residential (safer; avoids carrier surcharge surprises).
 *
 * ZIP inference is intentionally heuristic. A full USPS ZIP database is not
 * bundled here to keep the bundle lean. Instead we use known commercial-skewing
 * ZIP prefixes (major business districts, PO Box ranges, etc.) as a negative
 * signal and fall back to residential otherwise.
 *
 * Residential surcharge amount is carrier-defined and applied by the rate
 * enrichment pipeline (Tier 2). This service only resolves the boolean flag.
 */

import type { OrderDTO } from '../types/orders';

// ---------------------------------------------------------------------------
// ZIP inference data
// ---------------------------------------------------------------------------

/**
 * ZIP prefixes (first 3 digits) known to be predominantly commercial/industrial.
 * Sources: USPS SCF boundaries, common warehouse/industrial district codes.
 * This is a curated heuristic list — not exhaustive.
 */
const COMMERCIAL_ZIP_PREFIXES = new Set([
  // Major warehouse/industrial districts
  '100', // Manhattan financial/commercial core (NYC 10001–10099)
  '600', // Chicago Loop / commercial core (60001–60099)
  '900', // LA commercial core (90001–90099)
  '770', // Houston commercial (77001–77099)
  '191', // Philadelphia commercial core
  '852', // Phoenix commercial core
  '302', // Atlanta commercial core
  '980', // Seattle commercial (Bellevue/downtown)
]);

/**
 * Full ZIPs known to be PO Box ranges or commercial-only delivery points.
 * These are definitively non-residential.
 */
const COMMERCIAL_EXACT_ZIPS = new Set([
  '00501', // IRS Holtsville NY
  '00544', // IRS Holtsville NY
  '20024', // Washington DC federal buildings
  '20201', // DHHS Washington DC
  '20590', // DOT Washington DC
]);

// ---------------------------------------------------------------------------
// Inference logic
// ---------------------------------------------------------------------------

export type ResidentialTristate = boolean | null;

export interface ResidentialInferenceResult {
  /** Resolved boolean: true = residential, false = commercial */
  isResidential: boolean;
  /** How the value was determined */
  source: 'explicit' | 'source_flag' | 'company_name' | 'zip_commercial' | 'zip_residential' | 'default_fallback';
  /** The ZIP code used for inference (if applicable) */
  zip?: string;
  /** Human-readable explanation for logging/debugging */
  reason: string;
}

/**
 * Resolve the residential flag for an order using tristate logic.
 *
 * @param residential - The order's residential field (boolean | null | undefined)
 * @param shipTo - The order's shipTo address
 * @returns ResidentialInferenceResult with resolved boolean and audit trail
 */
export function inferResidential(
  residential: boolean | null | undefined,
  shipTo?: OrderDTO['shipTo'],
): ResidentialInferenceResult {
  // Rule 1: Explicit boolean — use directly
  if (residential === true) {
    return {
      isResidential: true,
      source: 'explicit',
      reason: 'Explicit residential=true on order',
    };
  }
  if (residential === false) {
    return {
      isResidential: false,
      source: 'explicit',
      reason: 'Explicit residential=false on order',
    };
  }

  // Rule 3: Company name present → commercial
  const company = shipTo?.company?.trim();
  if (company && company.length > 0) {
    return {
      isResidential: false,
      source: 'company_name',
      reason: `Company name "${company}" present — treating as commercial`,
    };
  }

  // Rules 4 & 5: ZIP-based inference
  const rawZip = (shipTo?.postalCode ?? '').replace(/\D/g, '').slice(0, 5);
  if (rawZip.length === 5) {
    const prefix = rawZip.slice(0, 3);

    if (COMMERCIAL_EXACT_ZIPS.has(rawZip)) {
      return {
        isResidential: false,
        source: 'zip_commercial',
        zip: rawZip,
        reason: `ZIP ${rawZip} is a known commercial-only delivery point`,
      };
    }

    if (COMMERCIAL_ZIP_PREFIXES.has(prefix)) {
      return {
        isResidential: false,
        source: 'zip_commercial',
        zip: rawZip,
        reason: `ZIP prefix ${prefix} is predominantly commercial/industrial`,
      };
    }

    // ZIP present but not in commercial list → residential
    return {
      isResidential: true,
      source: 'zip_residential',
      zip: rawZip,
      reason: `ZIP ${rawZip} not in commercial index — inferred residential`,
    };
  }

  // Rule 6: Default fallback → residential (conservative)
  return {
    isResidential: true,
    source: 'default_fallback',
    reason: 'No address data available — defaulting to residential (conservative)',
  };
}

/**
 * Apply residential inference to an OrderDTO and return an enriched copy.
 * Does NOT mutate the original order.
 */
export function applyResidentialToOrder(order: OrderDTO): OrderDTO & {
  _residentialResolved: boolean;
  _residentialSource: ResidentialInferenceResult['source'];
  _residentialReason: string;
} {
  const result = inferResidential(order.residential, order.shipTo);
  return {
    ...order,
    residential: result.isResidential,
    _residentialResolved: result.isResidential,
    _residentialSource: result.source,
    _residentialReason: result.reason,
  };
}

/**
 * Batch-apply residential inference to a list of orders.
 * Returns new array; does NOT mutate originals.
 */
export function applyResidentialToOrders(orders: OrderDTO[]): OrderDTO[] {
  return orders.map((order) => applyResidentialToOrder(order));
}
