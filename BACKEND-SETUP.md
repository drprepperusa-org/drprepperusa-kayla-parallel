# Backend Setup Guide

**Ready for DJ testing with real ShipStation credentials.**

---

## Prerequisites

- Node.js 18+ (project uses v22)
- ShipStation API key + secret (from ShipStation → Settings → API → API Keys)

---

## Quick Start (5 minutes)

### 1. Clone and install

```bash
cd drprepperusa-kayla-parallel
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
SHIPSTATION_API_KEY=your_key_here
SHIPSTATION_API_SECRET=your_secret_here
```

Everything else has sensible defaults for local dev.

### 3. Start the backend

```bash
npm run server:dev
```

This starts the Express server on **http://localhost:3001**  
Migrations run automatically on startup (SQLite DB created as `dev.sqlite3`).

### 4. Start the frontend (separate terminal)

```bash
npm run dev
```

Frontend runs on **http://localhost:3000**.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (no auth) |
| GET | `/api/rates/:orderId` | Fetch shipping rates (30-min cache) |
| POST | `/api/labels` | Create shipping label |
| POST | `/api/sync` | Sync orders from ShipStation |
| POST | `/api/billing/:orderId` | Create billing record |
| PUT | `/api/billing/:orderId` | Recalculate billing |
| PUT | `/api/billing/:orderId/void` | Void billing |
| GET | `/api/billing` | List billing records |
| POST | `/api/billing/recalculate-bulk` | Bulk recalculate billings |
| GET | `/api/settings/billing` | Get billing settings |
| PUT | `/api/settings/billing` | Update billing settings |
| GET | `/api/rates/cache/stats` | Cache diagnostics |

---

## Testing

```bash
# Run all tests (includes backend integration tests)
npm test

# Run only backend tests
npx vitest run server/__tests__

# Watch mode
npx vitest
```

**Current test count:** 572 passing (437 pre-existing + 135 new backend tests)

---

## Verifying ShipStation Integration

Once your API key is in `.env`, test the connection:

```bash
# Health check
curl http://localhost:3001/health

# Fetch rates (replace with a real orderId and ZIP codes)
curl "http://localhost:3001/api/rates/ORD-12345?fromZip=92101&toZip=10001&weightOz=24"

# Sync orders from ShipStation
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{"lastSyncTime": null}'
```

---

## Architecture

```
server/
├── server.ts              # Express app, CORS, middleware, startup
├── lib/
│   ├── logger.ts          # Pino structured logger
│   ├── cache.ts           # In-memory TTL cache (30-min rates)
│   └── shipstation.ts     # ShipStation V1+V2 HTTP client
├── routes/
│   ├── rates.ts           # GET /api/rates/:orderId
│   ├── labels.ts          # POST /api/labels
│   ├── sync.ts            # POST /api/sync
│   ├── billing.ts         # Billing CRUD
│   └── settings.ts        # Billing settings
├── db/
│   ├── knex.ts            # Database connection (SQLite/PostgreSQL)
│   ├── migrate.ts         # Migration runner
│   └── migrations/
│       ├── 001_create_order_billing.ts
│       └── 002_create_billing_settings.ts
└── __tests__/
    ├── helpers/
    │   ├── testDb.ts          # In-memory SQLite for tests
    │   └── mockShipStation.ts # Mock HTTP server
    ├── health.test.ts
    └── routes/
        ├── rates.test.ts
        ├── labels.test.ts
        ├── sync.test.ts
        ├── billing.test.ts
        └── settings.test.ts
```

---

## Database

**Development:** SQLite file (`dev.sqlite3`) — zero config, auto-created.

**Production:** PostgreSQL — set `DATABASE_URL=postgres://...`

### Tables
- `order_billing` — one billing record per order (created on ship, updatable)
- `billing_settings` — global billing config (prepCost, packageCostPerOz, syncFrequency)

### Manual migration commands
```bash
npm run server:migrate          # Run pending migrations
npm run server:migrate:rollback # Rollback last batch
```

---

## Caching

Shipping rates are cached for **30 minutes** per unique set of parameters.  
Cache is automatically invalidated when billing settings change.

```bash
# View cache stats
curl http://localhost:3001/api/rates/cache/stats
```

---

## Logging

Structured JSON logs via Pino. Level controlled by `LOG_LEVEL` env var.

```bash
LOG_LEVEL=debug npm run server:dev  # Verbose logging for debugging
```

Logs include:
- All API requests/responses
- ShipStation calls (events: rates.request, label.created, sync.complete)
- Cache hits/misses
- Billing calculations
- Error details (never leaks stack traces to clients)

---

## Production

```bash
NODE_ENV=production \
DATABASE_URL=postgres://... \
SHIPSTATION_API_KEY=... \
SHIPSTATION_API_SECRET=... \
PORT=3001 \
npm run server:start
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `SHIPSTATION_API_KEY missing` | Copy `.env.example` → `.env` and fill in credentials |
| `Database migration failed` | Check `DATABASE_URL` or delete `dev.sqlite3` to reset |
| `401 from ShipStation` | Verify API key/secret at ShipStation → Settings → API |
| `429 rate limited` | ShipStation has a request limit; the client auto-retries with backoff |
| Server won't start | Check `PORT` isn't in use (`lsof -i :3001`) |
