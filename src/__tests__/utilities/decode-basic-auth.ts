/**
 * @file decode-basic-auth.ts
 * @description Test utility for decoding Basic Auth headers.
 *
 * This function is for test use only. It is not exported from production code.
 *
 * Usage in tests:
 * ```ts
 * import { decodeBasicAuth } from '../__tests__/utilities/decode-basic-auth';
 *
 * const decoded = decodeBasicAuth(headers['Authorization']);
 * expect(decoded).toBe('apiKey:apiSecret');
 * ```
 */

/**
 * Decode a Basic Auth header value to the raw "key:secret" string.
 *
 * @param authHeader - The full Authorization header value (e.g., "Basic <base64>")
 * @returns The decoded credential string (e.g., "key:secret")
 */
export function decodeBasicAuth(authHeader: string): string {
  return atob(authHeader.replace('Basic ', ''));
}
