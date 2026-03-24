# FEATURES-AUDIT.md — drprepperusa-kayla-parallel

**Generated:** 2026-03-24  
**Build strategy:** Parallel sub-agent orchestration  
**Source audited:** drprepperusa-audit/ (FEATURE-INVENTORY.md, COMPONENT-MAPPING.md, ARCHITECTURE-NOTES.md)

---

## ✅ What Worked

### Core Infrastructure
| Item | Status | Notes |
|------|--------|-------|
| Rsbuild + React 18 + TypeScript | ✅ | Clean build, 175KB total (56KB gzip) |
| Zustand v5 stores | ✅ | ordersStore, storesStore, markupsStore, uiStore |
| SCSS Modules + Tailwind CSS v4 | ✅ | Dark sidebar, clean table design |
| Mock data layer | ✅ | Full offline demo with realistic order data |
| ESLint 0 errors | ✅ | Custom config matching shared rules (no @next/eslint) |
| TypeScript 0 errors | ✅ | Strict mode, all types satisfied |
| Vercel deployment | ✅ | HTTP 200, SPA rewrites working |

### Layout & Navigation
| Item | Status | Notes |
|------|--------|-------|
| Dark sidebar (prepship-v3 parity) | ✅ | PREP**SHIP** wordmark, DR PREPPER branding |
| Status section headers (collapsible) | ✅ | Awaiting Shipment, Shipped, Cancelled |
| Store sub-items per status | ✅ | Sorted by count descending |
| Store count badges | ✅ | From storesStore |
| Mobile drawer with overlay | ✅ | Responsive ≤768px |
| Search bar with debounce (300ms) | ✅ | Clears with ✕ button |
| Tool nav items (Inventory, Locations, etc.) | ✅ | All 8 tools present |
| ShipStation connection indicator | ✅ | Footer dot + text |

### Orders View
| Item | Status | Notes |
|------|--------|-------|
| Status tab switcher | ✅ | Awaiting/Shipped/Cancelled with counts |
| Order table (18 columns) | ✅ | All columns from V3 columnDefs ported |
| Multi-select checkboxes | ✅ | Header select-all + row toggle |
| Pagination (prev/next) | ✅ | Page/total display |
| Age color coding (green/orange/red) | ✅ | 24h/48h thresholds |
| Margin display (positive/negative) | ✅ | Green/red coloring |
| Best rate with markup applied | ✅ | applyCarrierMarkup utility |
| Store badges per order | ✅ | Mapped from storeId |
| SKU primary logic | ✅ | getPrimarySku util (max qty) |
| Weight formatting | ✅ | fmtWeight util |
| Loading / empty states | ✅ | Full UI states handled |
| Fixed sticky thead | ✅ | z-index: 5, table scroll |

### Zustand State
| Item | Status | Notes |
|------|--------|-------|
| ordersStore: fetch, paginate, filter | ✅ | Status/page/search/dateRange |
| storesStore: stores + counts per status | ✅ | Per-store counts sorted by volume |
| markupsStore: carrier markup map | ✅ | Type-safe MarkupsMap |
| uiStore: view, sidebar, toasts | ✅ | Full toast infrastructure |
| Zustand v5 API (no `immer`, no `devtools`) | ✅ | Pure Zustand v5 pattern |

---

## ⚠️ What's Partial / Earmarked

### API Integration (Mock Data Only)
All stores use mock data. The API client (`src/api/client.ts`) is fully typed and matches the V2 API contract, but stores call mock functions instead of the live client.

**Why:** No backend available in standalone Vercel deployment. Switching to live API requires:
1. `VITE_API_BASE` env var pointing to V2 backend
2. Swap `getMockOrdersByStatus()` → `apiClient.listOrders()` in ordersStore
3. Swap `MOCK_STORES` → `apiClient.listClients()` in storesStore

### Secondary Views (Placeholder)
| View | Status | Effort to complete |
|------|--------|--------------------|
| Inventory | 🚧 Placeholder | High — receive/adjust flows, ledger, SKU grouping |
| Locations | 🚧 Placeholder | Low — simple CRUD table |
| Packages | 🚧 Placeholder | Medium — stock tracking, ledger, auto-create |
| Rate Shop | 🚧 Placeholder | High — live rate shopping modal, carrier accounts |
| Analysis | 🚧 Placeholder | Medium — SKU analytics charts |
| Settings | 🚧 Placeholder | Low — markups config, column prefs |
| Billing | 🚧 Placeholder | High — per-client billing config, invoice HTML |
| Manifests | 🚧 Placeholder | Low — CSV export |

### Order Detail Panel
Not implemented. Tap/click on row does nothing.  
**Complexity:** HIGH — needs shipments, rates, label creation, dims override.

### Batch Operations
Multi-select works but batch actions (create batch labels, mark shipped) have no UI.  
**Complexity:** HIGH — label creation touches ShipStation v2 API with rate limiting + retries.

---

## ❌ What Didn't Make It (Complex Logic Earmarked)

Per `FEATURE-INVENTORY.md` — these require human review before implementation:

1. **Markup calculation chain** — Rate display uses `applyCarrierMarkup` from utils. Full billing markup chain (carrier %, flat, per-unit fees) is not connected to billing views.

2. **Rate cache key generation** — API client has `/api/rates/cached` mapped correctly but the 6-component cache key (weight+zip+dims+residential+storeId+signature) needs careful V2-matching implementation.

3. **Label creation flow** — ShipStation v2 API, rate limiting, exponential backoff, return label generation. High risk of money impact if implemented incorrectly.

4. **Order enrichment pipeline** — bulk cached rates → product defaults → dims resolution → best rate selection. Client-side complexity, needs server-side pagination first.

5. **Billing generation** — Per-client fee modes (per-unit, per-pallet, per-cuft). Not safe to implement without verified billing config schema.

6. **Reference rate backfill** — Async job with running/queued state machine. Worker stub in V2 — not ready to port.

---

## Known Issues

- `storeCountsByStatus` in storesStore uses mock data; real implementation needs per-status API calls
- `selectedOrderIds` uses `Set<number>` which Zustand v5 handles but doesn't deep-compare — `immer` would simplify this pattern
- `fmtWeight` and `fmtDate` utilities exist in `utils/orders.ts` but `fmtWeight`, `fmtDate`, `fmtCurrency` are defined inline in `OrdersView.tsx` — should consolidate to utils
- Mobile view: sidebar drawer works but table needs horizontal scroll on small screens

---

## Recommendations for V2

1. **Wire real API** — Add env var support, replace mock calls in stores
2. **Order detail panel** — High visual impact, medium complexity
3. **Settings view** — Quick win, enables markup config
4. **Locations CRUD** — Quick win, simple REST table
5. **Server-side pagination** — Fix `useOrdersWithDetails` anti-pattern from V3 audit
