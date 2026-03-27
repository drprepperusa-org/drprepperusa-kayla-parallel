/**
 * Sidebar — Section 3 (revised)
 *
 * Navigation tree with collapsible groups per OrderStatus.
 * Reads allOrders for live per-client counts.
 * Shows SyncIndicator in footer.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { useUIStore, type ViewType } from '../../stores/uiStore';
import { useOrdersStore } from '../../stores/ordersStore';
import { useStoresStore } from '../../stores/storesStore';
import { useClients } from '../../hooks/useClients';
import SyncIndicator from '../shared/SyncIndicator';
import type { OrderStatus } from '../../types/orders';
import styles from './Sidebar.module.scss';

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  cancelled: 'Cancelled',
};

const TOOL_ITEMS: Array<{ view: ViewType; icon: string; label: string }> = [
  { view: 'inventory', icon: '📦', label: 'Inventory' },
  { view: 'locations', icon: '📍', label: 'Locations' },
  { view: 'packages', icon: '📐', label: 'Packages' },
  { view: 'rates', icon: '🔍', label: 'Rate Shop' },
  { view: 'analysis', icon: '📊', label: 'Analysis' },
  { view: 'settings', icon: '⚙️', label: 'Settings' },
  { view: 'billing', icon: '💰', label: 'Billing' },
  { view: 'manifests', icon: '📋', label: 'Manifests' },
];

const STATUSES: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled'];

export default function Sidebar() {
  const { setView, sidebarOpen, setSidebarOpen } = useUIStore();
  const { currentStatus, activeClient, setNavFilter, setSearchQuery, allOrders, sync, startSync } = useOrdersStore();
  const { stores } = useStoresStore();

  // React Query: clients list from backend for richer display names.
  // Falls back to store-derived names if the backend is unavailable.
  const { data: clientsData } = useClients();

  // Build clientId → name map from backend; falls back to empty map
  const clientNameMap = useMemo(() => {
    const map = new Map<number, string>();
    if (clientsData) {
      for (const c of clientsData) {
        map.set(c.clientId, c.name);
      }
    }
    return map;
  }, [clientsData]);

  const [expandedSections, setExpandedSections] = useState<Set<OrderStatus>>(
    new Set(['awaiting_shipment'])
  );
  const [searchValue, setSearchValue] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived nav counts from allOrders ────────────────────────────────────
  // navCounts[status][clientId] = count
  const navCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {
      awaiting_shipment: {},
      shipped: {},
      cancelled: {},
    };
    for (const order of allOrders) {
      const status = order.status;
      const client = order.clientId;
      if (counts[status]) {
        counts[status][client] = (counts[status][client] ?? 0) + 1;
      }
    }
    return counts;
  }, [allOrders]);

  const getStatusTotal = (status: OrderStatus): number | null => {
    if (allOrders.length > 0) {
      return Object.values(navCounts[status] ?? {}).reduce((a, b) => a + b, 0);
    }
    return null; // will render as "—" pre-sync
  };

  const getClientCount = (status: OrderStatus, clientId: string): number => {
    return navCounts[status]?.[clientId] ?? 0;
  };

  const toggleSection = (status: OrderStatus) => {
    const next = new Set(expandedSections);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setExpandedSections(next);
  };

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => setSearchQuery(value), 300);
    },
    [setSearchQuery]
  );

  const handleClearSearch = () => {
    setSearchValue('');
    setSearchQuery('');
  };

  // Build sorted client list per status (sorted by count desc).
  // Prefer display name from backend clients list; fall back to store name.
  const getSortedClients = (status: OrderStatus) => {
    return stores
      .map((store) => ({
        clientId: String(store.clientId),
        name: clientNameMap.get(store.clientId) ?? store.name,
        count: getClientCount(status, String(store.clientId)),
      }))
      .sort((a, b) => b.count - a.count);
  };

  return (
    <>
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`${styles.sidebar} ${sidebarOpen ? styles.mobileOpen : ''}`}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoWordmark}>
            PREP<span>SHIP</span>
          </div>
          <div className={styles.logoSub}>DR PREPPER Fulfillment</div>
        </div>

        {/* Search */}
        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search Orders…"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search orders"
          />
          {searchValue && (
            <button className={styles.clearBtn} onClick={handleClearSearch} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {/* Sync indicator (below search) */}
        <div className={styles.syncRow}>
          <SyncIndicator
            syncing={sync.syncing}
            lastSyncTime={sync.lastSyncTime}
            onManualSync={startSync}
            variant="full"
          />
        </div>

        {/* Nav tree */}
        <div className={styles.nav}>
          {STATUSES.map((status) => {
            const total = getStatusTotal(status);
            const isExpanded = expandedSections.has(status);
            const sortedClients = getSortedClients(status);

            return (
              <div
                key={status}
                className={`${styles.section} ${isExpanded ? styles.expanded : ''}`}
              >
                {/* Parent row */}
                <div
                  className={`${styles.sectionHeader} ${currentStatus === status && activeClient === null ? styles.active : ''}`}
                  onClick={() => {
                    setNavFilter(status, null);
                    setView('orders');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setNavFilter(status, null);
                      setView('orders');
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <span
                    className={styles.arrow}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(status);
                    }}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    ▶
                  </span>
                  <span className={styles.label}>{STATUS_LABELS[status]}</span>
                  <span className={styles.badge}>{total ?? '—'}</span>
                </div>

                {/* Children: per-client rows, sorted by count desc */}
                {isExpanded && (
                  <div className={styles.storeList}>
                    {sortedClients.map(({ clientId, name, count }) => {
                      const isSelected = currentStatus === status && activeClient === clientId;
                      return (
                        <div
                          key={clientId}
                          className={`${styles.storeItem} ${isSelected ? styles.selected : ''}`}
                          onClick={() => {
                            setNavFilter(status, clientId);
                            setView('orders');
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setNavFilter(status, clientId);
                              setView('orders');
                            }
                          }}
                        >
                          <span className={styles.storeName}>{name}</span>
                          <span className={styles.storeCount}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className={styles.divider} />

          {/* Bottom nav tools */}
          <div className={styles.tools}>
            {TOOL_ITEMS.map(({ view, icon, label }) => (
              <div
                key={view}
                className={styles.toolItem}
                onClick={() => setView(view)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setView(view);
                }}
              >
                <span className={styles.toolIcon}>{icon}</span> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.bottom}>
          <div>
            <span className={styles.connDot} />
            ShipStation Connected
          </div>
          <div className={styles.bottomSub}>DR PREPPER USA · Gardena CA</div>
        </div>
      </div>
    </>
  );
}
