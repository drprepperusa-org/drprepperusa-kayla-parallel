---
title: For Albert — V2 Implementation Plan & Technical Decisions
created: 2026-03-25 22:11 EDT
audience: Albert (developer only)
purpose: Technical roadmap, architecture decisions, and API integration plan
---

# Albert: Implementation Plan & Technical Decisions

## Current Status Summary

**What we have** (from current refactor):
- Orders: 92% (list + detail, missing filters/stats/export)
- Markup: 94% (service + store, missing DB persistence)
- Billing: 96% (formula correct, missing fees)
- Labels: 90% (service + store, missing real API + batch/void)
- Rates: 82% (scaffold, missing real API + bulk fetch)

**What we're missing**:
- Real ShipStation API integration (placeholder stubs)
- DB persistence for settings/markups
- Batch label creation + void
- Order export + stats endpoints
- Real-time sync with ShipStation

---

## Architecture Decisions Needed

### 1. Settings Persistence

**Question**: Where should we store markup rules and UI preferences?

Options:
- A) Backend DB (recommended): `/api/settings` endpoint, stored in SQLite
- B) Frontend localStorage: Zustand + localStorage plugin
- C) Both: localStorage for fast UX, sync to backend periodically

**Recommendation**: A (backend DB). Persists across devices, more reliable.

**TODO**:
- Create `/api/settings` endpoint (GET, PUT)
- Add `settings` table to DB
- Wire to Zustand store on app load

---

### 2. ShipStation API Integration

**Question**: Where should ShipStation API calls live?

Options:
- A) Backend proxy: `/api/rates`, `/api/labels` endpoints call ShipStation
- B) Frontend direct: React calls ShipStation directly (requires API key on client)
- C) Both: Some calls through backend, some direct

**Recommendation**: A (backend proxy). More secure (API key never exposed to client).

**TODO**:
- Check V2 ShipStation integration in `apps/api/src/modules/rates/` and `apps/api/src/modules/labels/`
- Document endpoint URLs, error codes, rate limits
- Implement `/api/rates/fetch` endpoint
- Implement `/api/labels/create` endpoint
- Add rate limiting + retry-after handling

---

### 3. Multi-Client Support

**Question**: Do we build multi-client support now, or defer?

Depends on DJ's answer: Do you manage multiple clients?

**If YES (multi-client)**:
- Add `clientId` parameter to all API calls
- Filter orders by `clientId` in DB queries
- Store per-client markup rules
- UI: add client selector in nav

**If NO (single client)**:
- Hardcode single client (or default to first client)
- Can add multi-client later (low-risk refactor)

**TODO**: Wait for DJ's answer.

---

## V2 API Integration Checklist

### Orders Endpoint
- [ ] GET /api/orders (list, paginated, filtered)
  - Filters: status, store, date range, carrier, residential flag
  - See V2: `apps/api/src/modules/orders/api/orders-handler.ts`
- [ ] GET /api/orders/:id (detail)
- [ ] GET /api/orders/search/sku/:sku (orders containing SKU)
- [ ] POST /api/orders/picklist (aggregated SKU list)
- [ ] GET /api/orders/stats/daily (shipped count by date)
- [ ] GET /api/orders/export/csv (bulk export)

**Status**: List + detail done. Missing: search, picklist, stats, export.

**TODO**:
1. Read V2 test file: `apps/api/test/orders.test.ts`
2. Read V2 handler: `apps/api/src/modules/orders/api/orders-handler.ts`
3. Implement missing endpoints one by one
4. Test with V2's test data

---

### Rates Endpoint
- [ ] GET /api/rates (list cached rates for order)
  - Query: orderId, clientId, weight, dimensions, origin ZIP, dest ZIP, residential
- [ ] POST /api/rates/fetch (refresh rates from ShipStation)
- [ ] GET /api/rates/bulk (fetch rates for multiple orders)
- [ ] DELETE /api/rates/cache (clear cache)

**Status**: Scaffold done. Missing: real ShipStation integration.

**TODO**:
1. Read V2: `apps/api/src/modules/rates/` (all files)
2. Find ShipStation rate endpoint documentation
3. Implement `fetchRatesFromShipStation()` (replace stub)
4. Add bulk fetch
5. Add cache invalidation

---

### Labels Endpoint
- [ ] POST /api/labels/create (single label)
- [ ] POST /api/labels/batch (multiple labels)
- [ ] POST /api/labels/void (cancel label, refund)
- [ ] GET /api/labels/:labelId (retrieve label PDF)
- [ ] Rate limiting: Handle 429 responses, implement retry-after

**Status**: Single label (mock). Missing: real API, batch, void, rate limiting.

**TODO**:
1. Read V2: `apps/api/src/modules/labels/` (all files)
2. Find ShipStation label endpoint documentation
3. Implement real API (replace mock)
4. Add batch creation (loop + parallel requests)
5. Add void label + refund tracking
6. Add rate limiting

---

### Billing Endpoint
- [ ] GET /api/billing/calculate (calculate order cost)
  - Input: baseRate, residentialSurcharge, markupPercent
  - Output: totalCost, breakdown, audit trail
- [ ] GET /api/billing/invoice (generate invoice)
- [ ] GET /api/billing/summary (date range summary)

**Status**: Service done (96%). Missing: fees, reference rates, invoices.

**TODO**:
1. Read V2: `apps/api/src/modules/billing/application/billing-service.ts`
2. List all fee types (pick, pack, unit, storage)
3. Add fee calculation to formula
4. Implement invoice generation (if MVP)
5. Test with realistic V2 orders

---

### Settings Endpoint
- [ ] GET /api/settings/:key (get setting)
- [ ] PUT /api/settings/:key (save setting)
- [ ] GET /api/settings/all (get all settings)

**Status**: Not started.

**TODO**:
1. Design settings schema (which keys are allowed?)
2. Create `/api/settings` endpoints
3. Wire to frontend via Zustand
4. Test persistence across sessions

---

## Database Schema

**What's needed**:
- Orders table (already implied, extend if needed)
- Settings table (key-value pairs)
- Labels table (track created labels)
- Rates cache table (optional, for persistence)
- Markups table (per-client rules)

**See V2**: Check `apps/api/src/modules/` for schema hints.

---

## Testing Strategy

### Unit Tests
- We have 198 tests passing (✅)
- Add tests for V2 API integration
- Test billing fees + rounding
- Test label batch creation + void

### Integration Tests
- Run our app against V2's test data
- Compare billing calculations
- Validate rate fetching
- Test label creation (mock ShipStation for now)

### E2E Tests (Later)
- DJ tests for 1 hour with real orders
- Compare results to V2 (same orders, same costs)
- Validate label PDF generation

---

## Remaining Work

### Phase 1: Lock MVP (1-2 days)
1. Wait for DJ's answers on scope
2. Document MVP feature list
3. Create implementation tickets

### Phase 2: API Integration (3-4 days)
1. Implement missing Orders endpoints
2. Integrate real ShipStation API (Rates + Labels)
3. Implement Settings persistence
4. Add Billing fees

### Phase 3: Testing & Validation (2-3 days)
1. Run against V2's test data
2. Side-by-side comparison (our app vs V2)
3. Bug fixes based on diff

### Phase 4: Deployment (1 day)
1. Final QA
2. DJ sign-off
3. Deploy to staging

**Total**: 1-2 weeks to MVP at 99% confidence.

---

## Questions for Albert (Self)

1. Should we build backend? (Or assume it exists like V2?)
2. Where's the V2 test data? (fixtures, sample orders)
3. What's the ShipStation API auth method? (API key, OAuth?)
4. Do we use V2's error codes, or define our own?
5. What's the DB? (SQLite, PostgreSQL, MySQL?)

---

## Links to V2 Source

- Orders module: V2 path/apps/api/src/modules/orders/
- Rates module: V2 path/apps/api/src/modules/rates/
- Labels module: V2 path/apps/api/src/modules/labels/
- Billing module: V2 path/apps/api/src/modules/billing/
- Settings module: V2 path/apps/api/src/modules/settings/
- Tests: V2 path/apps/api/test/

**Where is V2?**
/Users/albert_mini/workspace/projects/dannyjeon/prepship-v2

---

**Last Updated**: 2026-03-25 22:11 EDT
