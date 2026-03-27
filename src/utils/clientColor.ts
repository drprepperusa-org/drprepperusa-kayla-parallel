/**
 * clientColor.ts — deterministic color derivation from client name string.
 *
 * Design: djb2 hash → hue in HSL color space.
 * Colors are perceptually separated and NOT hardcoded per client.
 * Same client name always produces the same color.
 */

// HSL palette: high saturation, medium lightness for badge readability
const BADGE_SATURATION = 65; // %
const BADGE_LIGHTNESS = 38;  // % — dark enough for white text
const TEXT_LIGHTNESS_THRESHOLD = 50; // below = use white text, above = black text

/**
 * djb2 hash: fast, well-distributed for short strings.
 * Returns a non-negative 32-bit integer.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

export interface ClientColors {
  /** CSS background color string, e.g. "hsl(210, 65%, 38%)" */
  bg: string;
  /** CSS text color string — white or black for contrast */
  text: string;
  /** Raw hue (0–359) for custom usage */
  hue: number;
}

/**
 * Derive a stable color pair for a client name.
 * Never hardcoded — always derived from hash.
 */
export function getClientColor(clientName: string): ClientColors {
  const hash = djb2Hash(clientName);
  const hue = hash % 360;
  const bg = `hsl(${hue}, ${BADGE_SATURATION}%, ${BADGE_LIGHTNESS}%)`;
  const text = BADGE_LIGHTNESS < TEXT_LIGHTNESS_THRESHOLD ? '#ffffff' : '#111827';
  return { bg, text, hue };
}
