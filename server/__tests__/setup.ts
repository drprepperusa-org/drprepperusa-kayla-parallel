/**
 * @file server/__tests__/setup.ts
 * @description Test setup for server integration tests.
 *
 * Sets PROXY_API_KEY so auth middleware passes in tests.
 * Tests should include 'x-api-key': TEST_API_KEY in requests to /api/* endpoints.
 */

// Set test API key for auth middleware
process.env['PROXY_API_KEY'] = 'test-api-key-for-tests';

export const TEST_API_KEY = 'test-api-key-for-tests';
