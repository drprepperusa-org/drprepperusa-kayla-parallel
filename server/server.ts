/**
 * @file server/server.ts
 * @description DrPrepperUSA backend — Express server entry point.
 *
 * Endpoints:
 *   GET  /health                      → Health check (no auth required)
 *   GET  /api/rates/:orderId          → Fetch shipping rates (30-min cache)
 *   POST /api/labels                  → Create shipping label
 *   POST /api/sync                    → Sync orders from ShipStation
 *   GET  /api/billing                 → List billing records
 *   POST /api/billing/:orderId        → Create billing
 *   PUT  /api/billing/:orderId        → Recalculate billing
 *   PUT  /api/billing/:orderId/void   → Void billing
 *   POST /api/billing/recalculate-bulk → Bulk recalculate
 *   GET  /api/settings/billing        → Get billing settings
 *   PUT  /api/settings/billing        → Update billing settings
 *
 * Setup: See BACKEND-SETUP.md
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { logger } from './lib/logger.js';
import { getDb } from './db/knex.js';
import { apiAuthMiddleware } from './middleware/auth.js';
import { ratesRouter } from './routes/rates.js';
import { labelsRouter } from './routes/labels.js';
import { syncRouter } from './routes/sync.js';
import { billingRouter } from './routes/billing.js';
import { settingsRouter } from './routes/settings.js';

// ─────────────────────────────────────────────────────────────────────────────
// App setup
// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const CLIENT_ORIGIN = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// Security middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(helmet());

// CORS — only allow the frontend origin
app.use(cors({
  origin: CLIENT_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

// Global rate limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
});
app.use(globalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// Logging middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(pinoHttp({
  logger,
  // Skip health check logging in production (noisy)
  autoLogging: {
    ignore: (req) => process.env['NODE_ENV'] === 'production' && req.url === '/health',
  },
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    // Redact sensitive headers
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Body parsing
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────────────────────────────────────
// Health check (no auth, no logging in production)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'drprepperusa-backend',
    version: process.env['npm_package_version'] ?? '1.0.0',
    node: process.version,
    env: process.env['NODE_ENV'] ?? 'development',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API auth middleware (applies to all /api/* routes)
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api', apiAuthMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// API routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/rates', ratesRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/billing', billingRouter);
app.use('/api/settings', settingsRouter);

// ─────────────────────────────────────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler (never leak stack traces to client)
// ─────────────────────────────────────────────────────────────────────────────

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────────────────────

export async function startServer(): Promise<void> {
  // Run migrations on startup
  try {
    const db = getDb();
    await db.migrate.latest();
    logger.info({ event: 'db.migrated' }, 'Database migrations complete');
  } catch (err) {
    logger.error({ err }, 'Database migration failed — check DATABASE_URL');
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, () => {
      logger.info({ event: 'server.start', port: PORT, env: process.env['NODE_ENV'] }, `Server listening on :${PORT}`);
      resolve();
    });
    server.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  logger.info({ event: 'server.shutdown' }, 'SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info({ event: 'server.shutdown' }, 'SIGINT received — shutting down gracefully');
  process.exit(0);
});

// Export app for testing
export { app };

// Run if invoked directly
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  startServer().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}
