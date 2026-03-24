/**
 * rateCache.ts — Canonical Rate Cache Key Format
 *
 * BACKGROUND
 * ----------
 * The audit found three variants of the rate cache key across V2/V3 sources:
 *
 *   Variant A (FEATURE-INVENTORY.md):
 *     Described as: "weight + zip + dims + residential + storeId + signature"
 *     6 logical components; dims treated as one opaque unit.
 *
 *   Variant B (ARCHITECTURE-NOTES.md):
 *     Template string: `${weight}-${zip}-${dimsString}-${residential}-${storeId}-${signature}`
 *     Same components but dims pre-encoded as a single string; field separator = "-".
 *
 *   Variant C (API-CONTRACT.md — GET /api/rates/cached query params):
 *     ?wt=&zip=&l=&w=&h=&residential=&storeId=&signature=
 *     Splits dims into l/w/h, uses "wt" shorthand for weight, no carrier or service field.
 *
 * CONSOLIDATION RATIONALE
 * -----------------------
 * Variants A and B agree on logical components; B gives the concrete template.
 * Variant C (query params) is the wire format — it's the API boundary, not the cache key.
 * The cache key must be self-describing (no shorthand) and collision-resistant.
 *
 * CANONICAL FORMAT (this file)
 * ----------------------------
 *   `${carrier}-${service}-${weight}-${dimensions}-${origin}-${destination}-${residential}`
 *
 *   Where:
 *   - carrier       : string carrier code, e.g. "stamps_com" (lowercased, trimmed)
 *   - service       : string service code, e.g. "usps_priority_mail" (lowercased, trimmed)
 *   - weight        : numeric ounces, normalised to 4 decimal places, e.g. "16.0000"
 *   - dimensions    : "LxWxH" integers in inches, e.g. "12x8x4" (sorted: L≥W≥H)
 *   - origin        : 5-digit postal code, e.g. "92101"
 *   - destination   : 5-digit postal code, e.g. "10001"
 *   - residential   : "1" or "0" (boolean encoded as digit to avoid "true"/"false" ambiguity)
 *
 * INVARIANTS (what changes the key)
 * ----------------------------------
 *   ✅ Weight in ounces (different units → must convert before key generation)
 *   ✅ Carrier code (stamps_com ≠ fedex)
 *   ✅ Service code (priority ≠ ground)
 *   ✅ Package dimensions L×W×H (different sizes → different rate buckets)
 *   ✅ Origin ZIP (5-digit; different origin → different rate)
 *   ✅ Destination ZIP (5-digit; different dest → different rate)
 *   ✅ Residential flag ("1"/"0"; residential surcharges differ)
 *
 * DOES NOT CHANGE THE KEY (do not include)
 * -----------------------------------------
 *   ❌ orderId — rates are reusable across orders with same params
 *   ❌ storeId — rate lookup is per-carrier-account; storeId is a lookup hint, not a rate input
 *   ❌ signature — a rate response field, not a rate request input
 *   ❌ clientId — resolved upstream via carrier-for-store lookup
 *   ❌ timestamps — rates have their own TTL
 *
 * COLLISION RISKS
 * ---------------
 *   1. Weight unit mismatch (grams vs ounces → always convert to ounces before calling)
 *   2. Dimension ordering (e.g. 12x8x4 vs 4x12x8 → dimensions are sorted descending)
 *   3. Case sensitivity (e.g. "USPS" vs "usps" → all codes lowercased)
 *   4. ZIP padding (e.g. "92101" vs "092101" → always 5-digit, strip non-digits)
 *   5. Residential ambiguity ("true" vs "1" vs true → always "1"/"0")
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Known carrier codes used in PrepShip V2/V3.
 * Non-exhaustive — use `string` type in the key params to allow future carriers.
 */
export enum KnownCarrier {
  StampsCom = 'stamps_com',
  FedEx = 'fedex',
  UPS = 'ups',
  DHLExpress = 'dhl_express',
  DHLEcommerce = 'dhl_ecommerce',
  APC = 'apc',
  Endicia = 'endicia',
  Sendle = 'sendle',
}

/**
 * Known service codes (non-exhaustive).
 * Lowercased ShipStation service codes.
 */
export enum KnownService {
  // USPS (via stamps_com or endicia)
  USPSFirstClass = 'usps_first_class_mail',
  USPSPriorityMail = 'usps_priority_mail',
  USPSPriorityMailExpress = 'usps_priority_mail_express',
  USPSGroundAdvantage = 'usps_ground_advantage',
  USPSParcelSelect = 'usps_parcel_select',
  // FedEx
  FedExGround = 'fedex_ground',
  FedExHomeDelivery = 'fedex_home_delivery',
  FedExSmartPost = 'fedex_smart_post',
  FedEx2Day = 'fedex_2_day',
  FedExStandardOvernight = 'fedex_standard_overnight',
  // UPS
  UPSGround = 'ups_ground',
  UPS2DayAir = 'ups_2nd_day_air',
  UPSNextDayAir = 'ups_next_day_air',
}

/**
 * Weight units supported by the key builder.
 * Always normalise to ounces before caching.
 */
export enum WeightUnit {
  Ounces = 'ounces',
  Grams = 'grams',
  Pounds = 'pounds',
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * All parameters required to generate a canonical rate cache key.
 */
export interface RateCacheKeyParams {
  /** Carrier code, e.g. "stamps_com" (case-insensitive; will be lowercased). */
  carrier: string;

  /** Service code, e.g. "usps_priority_mail" (case-insensitive; will be lowercased). */
  service: string;

  /** Package weight value. Must be paired with `weightUnit`. */
  weight: number;

  /** Unit of the weight value. Converted to ounces internally. */
  weightUnit: WeightUnit;

  /** Package dimensions in inches (any unit conversion must happen before this call). */
  dimensions: {
    /** Longest side in inches (positive integer). */
    length: number;
    /** Middle side in inches (positive integer). */
    width: number;
    /** Shortest side in inches (positive integer). */
    height: number;
  };

  /** 5-digit origin ZIP code. Non-digit characters are stripped. */
  originZip: string;

  /** 5-digit destination ZIP code. Non-digit characters are stripped. */
  destinationZip: string;

  /** Whether the destination is a residential address. */
  residential: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const GRAMS_PER_OUNCE = 28.3495;
const OUNCES_PER_POUND = 16;

/**
 * Convert weight to ounces and return as a 4-decimal-place string.
 * Invariant: weight ≥ 0.
 */
function normaliseWeight(value: number, unit: WeightUnit): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new RateCacheKeyError(`weight must be a non-negative finite number, got: ${value}`);
  }
  let ounces: number;
  switch (unit) {
    case WeightUnit.Ounces:
      ounces = value;
      break;
    case WeightUnit.Grams:
      ounces = value / GRAMS_PER_OUNCE;
      break;
    case WeightUnit.Pounds:
      ounces = value * OUNCES_PER_POUND;
      break;
  }
  return ounces.toFixed(4);
}

/**
 * Encode dimensions as "LxWxH" with sides sorted descending.
 * Invariant: all dimensions ≥ 1.
 */
function normaliseDimensions(length: number, width: number, height: number): string {
  for (const [name, val] of [['length', length], ['width', width], ['height', height]] as [string, number][]) {
    if (!Number.isFinite(val) || val <= 0) {
      throw new RateCacheKeyError(`${name} must be a positive finite number, got: ${val}`);
    }
  }
  const sorted = [Math.round(length), Math.round(width), Math.round(height)].sort((a, b) => b - a);
  return `${sorted[0]}x${sorted[1]}x${sorted[2]}`;
}

/**
 * Normalise a ZIP code to exactly 5 digits.
 * Invariant: result must be exactly 5 digits.
 */
function normaliseZip(zip: string, label: string): string {
  const digits = zip.replace(/\D/g, '').slice(0, 5).padStart(5, '0');
  if (digits.length !== 5) {
    throw new RateCacheKeyError(`${label} must resolve to a 5-digit ZIP code, got: "${zip}"`);
  }
  return digits;
}

/**
 * Normalise a string identifier to lowercase trimmed form.
 * Invariant: result must be non-empty.
 */
function normaliseCode(value: string, label: string): string {
  const normalised = value.toLowerCase().trim();
  if (!normalised) {
    throw new RateCacheKeyError(`${label} must be a non-empty string, got: "${value}"`);
  }
  return normalised;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Error thrown when rate cache key generation fails an invariant.
 */
export class RateCacheKeyError extends Error {
  constructor(message: string) {
    super(`[RateCacheKey] ${message}`);
    this.name = 'RateCacheKeyError';
  }
}

/**
 * Generate the canonical rate cache key.
 *
 * Format: `${carrier}-${service}-${weight}-${dimensions}-${origin}-${destination}-${residential}`
 *
 * Example:
 *   buildRateCacheKey({
 *     carrier: 'stamps_com',
 *     service: 'usps_priority_mail',
 *     weight: 16,
 *     weightUnit: WeightUnit.Ounces,
 *     dimensions: { length: 12, width: 8, height: 4 },
 *     originZip: '92101',
 *     destinationZip: '10001',
 *     residential: true,
 *   })
 *   → "stamps_com-usps_priority_mail-16.0000-12x8x4-92101-10001-1"
 *
 * @throws {RateCacheKeyError} if any invariant is violated
 */
export function buildRateCacheKey(params: RateCacheKeyParams): string {
  const carrier = normaliseCode(params.carrier, 'carrier');
  const service = normaliseCode(params.service, 'service');
  const weight = normaliseWeight(params.weight, params.weightUnit);
  const dimensions = normaliseDimensions(
    params.dimensions.length,
    params.dimensions.width,
    params.dimensions.height,
  );
  const origin = normaliseZip(params.originZip, 'originZip');
  const destination = normaliseZip(params.destinationZip, 'destinationZip');
  const residential = params.residential ? '1' : '0';

  return `${carrier}-${service}-${weight}-${dimensions}-${origin}-${destination}-${residential}`;
}

/**
 * Parse a canonical rate cache key back into its components.
 * Useful for debugging and logging.
 *
 * @throws {RateCacheKeyError} if the key does not have 7 components
 */
export function parseRateCacheKey(key: string): {
  carrier: string;
  service: string;
  weightOunces: number;
  dimensions: string;
  originZip: string;
  destinationZip: string;
  residential: boolean;
} {
  const parts = key.split('-');
  // carrier and service may themselves contain '-', so we must parse from both ends
  // Format: carrier-service-weight-dimensions-origin-destination-residential
  // dimensions = "LxWxH" (no dash), weight = "NNNN.NNNN" (no dash)
  // Parse from the end: residential, destination, origin, dimensions, weight, then service+carrier
  if (parts.length < 7) {
    throw new RateCacheKeyError(`Cannot parse key: expected at least 7 dash-separated parts, got ${parts.length}: "${key}"`);
  }
  const residential = parts[parts.length - 1];
  const destinationZip = parts[parts.length - 2];
  const originZip = parts[parts.length - 3];
  const dimensions = parts[parts.length - 4];
  const weight = parts[parts.length - 5];
  // Everything before weight is carrier + service (joined back)
  const carrierService = parts.slice(0, parts.length - 5).join('-');
  // carrier and service: split on first '-' after recognising standard carrier patterns
  // We use a greedy split: the first known carrier prefix, or fall back to first '-'
  const firstDash = carrierService.indexOf('-');
  if (firstDash === -1) {
    throw new RateCacheKeyError(`Cannot split carrier/service from: "${carrierService}"`);
  }
  const carrier = carrierService.slice(0, firstDash);
  const service = carrierService.slice(firstDash + 1);

  if (!residential || (residential !== '0' && residential !== '1')) {
    throw new RateCacheKeyError(`Invalid residential field in key: "${residential}"`);
  }

  return {
    carrier,
    service,
    weightOunces: parseFloat(weight),
    dimensions,
    originZip,
    destinationZip,
    residential: residential === '1',
  };
}
