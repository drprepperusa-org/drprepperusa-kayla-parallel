/**
 * @file src/server/auth.ts
 * @description Server-side auth validation for proxy endpoints.
 *
 * Validates the x-api-key header on all /api/* requests.
 * The expected key is read from process.env.PROXY_API_KEY (server-only).
 *
 * Security properties:
 * - Key never appears in client bundle (process.env, not import.meta.env)
 * - Missing key → 401 (not 403, to avoid hinting key existence)
 * - Invalid key → 401 (constant-time comparison to prevent timing attacks)
 * - No key configured in env → all requests rejected (fail-secure)
 */

import type { HandlerRequest, HandlerResponse, ApiErrorResponse } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Header name for proxy API key authentication. */
export const AUTH_HEADER = 'x-api-key';

/** Alternative: Bearer token in Authorization header. */
export const AUTH_BEARER_PREFIX = 'Bearer ';

// ─────────────────────────────────────────────────────────────────────────────
// Constant-time string comparison (prevents timing attacks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compares two strings in constant time.
 * Always iterates the full length of both strings to prevent timing leaks.
 *
 * @param a - Expected (trusted) string
 * @param b - Provided (untrusted) string
 * @returns true if strings match, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to prevent length oracle
    let mismatch = 1;
    for (let i = 0; i < a.length; i++) {
      mismatch |= (a.charCodeAt(i % a.length) ^ (b.charCodeAt(i % b.length) || 0));
    }
    return mismatch === 0; // Always false since lengths differ, but timing is consistent
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return mismatch === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the API key from the request.
 *
 * Accepts key via:
 * 1. x-api-key header (preferred)
 * 2. Authorization: Bearer <key> header (alternative)
 *
 * @returns null if auth succeeds; HandlerResponse with 401 if auth fails
 */
export function validateAuth(request: HandlerRequest): HandlerResponse | null {
  const expectedKey = process.env['PROXY_API_KEY'];

  // Fail-secure: if no key is configured in env, reject all requests
  if (!expectedKey || expectedKey.trim() === '') {
    const body: ApiErrorResponse = {
      error: 'Service misconfigured: proxy authentication not configured.',
      code: 'AUTH_MISCONFIGURED',
    };
    return { status: 401, body };
  }

  // Extract provided key from headers
  const providedKey = extractApiKey(request.headers);

  if (!providedKey) {
    const body: ApiErrorResponse = {
      error: 'Missing authentication. Provide x-api-key header.',
      code: 'AUTH_MISSING',
    };
    return { status: 401, body };
  }

  // Constant-time comparison
  if (!timingSafeEqual(expectedKey, providedKey)) {
    const body: ApiErrorResponse = {
      error: 'Invalid API key.',
      code: 'AUTH_INVALID',
    };
    return { status: 401, body };
  }

  // Auth passed
  return null;
}

/**
 * Extract API key from request headers.
 * Checks x-api-key first, then Authorization: Bearer.
 *
 * @returns The key string, or null if not found
 */
function extractApiKey(headers: Record<string, string | undefined>): string | null {
  // Priority 1: x-api-key header
  const xApiKey = headers[AUTH_HEADER];
  if (xApiKey && xApiKey.trim() !== '') {
    return xApiKey.trim();
  }

  // Priority 2: Authorization: Bearer <key>
  const authHeader = headers['authorization'];
  if (authHeader && authHeader.startsWith(AUTH_BEARER_PREFIX)) {
    const bearerKey = authHeader.slice(AUTH_BEARER_PREFIX.length).trim();
    if (bearerKey !== '') {
      return bearerKey;
    }
  }

  return null;
}
