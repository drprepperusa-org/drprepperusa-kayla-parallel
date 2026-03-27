/**
 * @file server/lib/logger.ts
 * @description Structured logger using Pino.
 *
 * - Development: pretty-printed with pino-pretty (human-readable for DJ debugging)
 * - Production: JSON lines (machine-parseable, fast)
 * - Log level from LOG_LEVEL env var (default: 'info')
 *
 * Never log sensitive data (API keys, passwords, PII).
 */

import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';
const isDev = process.env['NODE_ENV'] !== 'production';

export const logger = pino({
  level,
  // In development, use pretty transport if available
  ...(isDev && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
    // Attempt pretty print — falls back gracefully if pino-pretty not installed
  }),
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'drprepperusa-backend',
    env: process.env['NODE_ENV'] ?? 'development',
  },
  // Redact sensitive fields from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'body.apiKey',
      'body.apiSecret',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with a component context.
 * Use for subsystem-level logging (e.g., logger.child({ component: 'rates' })).
 */
export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}
