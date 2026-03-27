/**
 * @file server/middleware/auth.ts
 * @description Express middleware for API key authentication.
 *
 * Validates the x-api-key header on all /api/* requests.
 * Expected key read from process.env.PROXY_API_KEY (server-only).
 *
 * Security properties:
 * - Key never appears in client bundle
 * - Missing key → 401 (not 403, to avoid hinting key existence)
 * - Invalid key → 401 (constant-time comparison to prevent timing attacks)
 * - No key configured in env → all requests rejected (fail-secure)
 */

import type { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Constant-time string comparison (prevents timing attacks)
// ─────────────────────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let mismatch = 1;
    for (let i = 0; i < a.length; i++) {
      mismatch |= (a.charCodeAt(i % a.length) ^ (b.charCodeAt(i % b.length) || 0));
    }
    return mismatch === 0;
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  }
  return mismatch === 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth validation helper (framework-agnostic — used by middleware + tests)
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthValidationResult {
  status: number;
  body: { error: string; code: string };
}

/**
 * Validate the API key from request headers.
 *
 * @param headers - HTTP headers (lowercased keys)
 * @returns null if auth passes; AuthValidationResult with 401 if auth fails
 */
export function validateAuth(
  headers: Record<string, string | string[] | undefined>,
): AuthValidationResult | null {
  const expectedKey = process.env['PROXY_API_KEY'];

  // Fail-secure: reject all requests if key not configured
  if (!expectedKey || expectedKey.trim() === '') {
    return {
      status: 401,
      body: {
        error: 'Service misconfigured: proxy authentication not configured.',
        code: 'AUTH_MISCONFIGURED',
      },
    };
  }

  // Extract provided key from headers
  const rawKey = headers['x-api-key'];
  let providedKey: string | null = null;

  if (typeof rawKey === 'string' && rawKey.trim() !== '') {
    providedKey = rawKey.trim();
  } else if (Array.isArray(rawKey) && rawKey[0]) {
    providedKey = rawKey[0].trim();
  }

  // Fallback: Authorization: Bearer <key>
  if (!providedKey) {
    const authHeader = headers['authorization'];
    const authStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (authStr && authStr.startsWith('Bearer ')) {
      const bearer = authStr.slice('Bearer '.length).trim();
      if (bearer !== '') providedKey = bearer;
    }
  }

  if (!providedKey) {
    return {
      status: 401,
      body: {
        error: 'Missing authentication. Provide x-api-key header.',
        code: 'AUTH_MISSING',
      },
    };
  }

  if (!timingSafeEqual(expectedKey, providedKey)) {
    return {
      status: 401,
      body: {
        error: 'Invalid API key.',
        code: 'AUTH_INVALID',
      },
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express middleware that enforces API key auth on all routes it's applied to.
 *
 * Usage:
 *   app.use('/api', apiAuthMiddleware);
 *
 * Returns 401 JSON on failure, calls next() on success.
 */
export function apiAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const result = validateAuth(req.headers as Record<string, string | string[] | undefined>);
  if (result) {
    res.status(result.status).json(result.body);
    return;
  }
  next();
}
