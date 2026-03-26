/**
 * @file src/server/rateLimiter.ts
 * @description In-memory rate limiter for proxy endpoints.
 *
 * Basic sliding window rate limiter:
 * - 10 requests per minute per client IP
 * - Window: 60 seconds
 * - Storage: in-memory Map (resets on server restart)
 *
 * Production note: Replace with Redis-based distributed limiter
 * (e.g. ioredis + sliding-window) before multi-instance deployment.
 */

import type { HandlerResponse, ApiErrorResponse } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum requests per window per client. */
export const RATE_LIMIT_MAX = 10;

/** Window duration in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds

/** Fallback IP key when client IP is unavailable. */
const UNKNOWN_IP_KEY = '__unknown__';

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit storage
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Timestamps of requests within the current window. */
  timestamps: number[];
}

/** Module-level rate limit store. Keyed by client IP. */
const store = new Map<string, RateLimitEntry>();

/**
 * Clear the entire rate limit store (used in tests / server shutdown).
 */
export function clearRateLimitStore(): void {
  store.clear();
}

/**
 * Get current store size (for diagnostics).
 */
export function getRateLimitStoreSize(): number {
  return store.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a client is rate limited.
 *
 * Uses a sliding window algorithm:
 * 1. Prune timestamps outside the window
 * 2. Count remaining timestamps
 * 3. If count >= max: rate limited → return 429
 * 4. Otherwise: record this request's timestamp, return null
 *
 * @param ip - Client IP address (use undefined if unavailable)
 * @returns null if allowed; HandlerResponse with 429 if rate limited
 */
export function checkRateLimit(ip: string | undefined): HandlerResponse | null {
  const key = ip ?? UNKNOWN_IP_KEY;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get or create entry
  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Prune timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  // Check if rate limit exceeded
  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = entry.timestamps[0] ?? now;
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    const retryAfterSecs = Math.ceil(retryAfterMs / 1000);

    const body: ApiErrorResponse = {
      error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} requests per minute. Retry after ${retryAfterSecs}s.`,
      code: 'RATE_LIMITED',
    };
    return { status: 429, body };
  }

  // Record this request
  entry.timestamps.push(now);

  return null;
}
