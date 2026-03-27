import { useState, useCallback, useRef, useMemo } from 'react';
import { useUIStore, type ViewType } from '../../stores/uiStore';
import { useOrdersStore } from '../../stores/ordersStore';
import { useStoresStore } from '../../stores/storesStore';
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
  { view: 'rates', icon: '💰', label: 'Rate Shop' },
  { view: 'analysis', icon: '📊', label: 'Analysis' },
  { view: 'settings', icon: '⚙️', label: 'Settings' },
  { view: 'billing', icon: '🧾', label: 'Billing' },
  { view: 'manifests', icon: '📋', label: 'Manifests' },
];

const STATUSES: OrderStatus[] = ['awaiting_shipment', 'shipped', 'cancelled'];

export default function Sidebar() {
  const { setView, sidebarOpen, setSidebarOpen } = useUIStore();
  const { currentStatus, activeClient, setNavFilter, setSearchQuery, allOrders } = useOrdersStore();
  const { stores } = useStoresStore();

  const [expandedSections, setExpandedSections] = useState<Set<OrderStatus>>(
    new Set(['awaiting_shipment'])
  );
  const [searchValue, setSearchValue] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived counts from allOrders (or fall back to mock store counts) ──────
  // clientId in Order is a string; storeDTO.clientId is a number.
  // We build counts keyed by String(clientId).
  const countsByStatus = useMemo(() => {
    const result: Record<OrderStatus, { total: number; byClient: Record<string, number> }> = {
      awaiting_shipment: { total: 0, byClient: {} },
      shipped: { total: 0, byClient: {} },
      cancelled: { total: 0, byClient: {} },
    };
    for (const o of allOrders) {
      const s = o.status as OrderStatus;
      if (!result[s]) continue;
      result[s].total++;
      const cid = String(o.clientId);
      result[s].byClient[cid] = (result[s].byClient[cid] ?? 0) + 1;
    }
    return result;
  }, [allOrders]);

  // When allOrders is empty (pre-sync), we fall back to storesStore counts + mock data totals.
  // The sidebar will show "—" badges until first sync.
  const getStatusTotal = (status: OrderStatus): number | null => {
    if (allOrders.length > 0) return countsByStatus[status].total;
    return null; // will render as "—"
  };

  const getClientCount = (status: OrderStatus, clientId: string): number => {
    return countsByStatus[status].byClient[clientId] ?? 0;
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
          />
          {searchValue && (
            <button className={styles.clearBtn} onClick={handleClearSearch}>
              ✕
            </button>
          )}
        </div>

        {/* Nav tree */}
        <div className={styles.nav}>
          {STATUSES.map((status) => {
            const total = getStatusTotal(status);
            const isExpanded = expandedSections.has(status);

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
                >
                  <span
                    className={styles.arrow}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection(status);
                    }}
                  >
                    ▶
                  </span>
                  <span className={styles.label}>{STATUS_LABELS[status]}</span>
                  <span className={styles.badge}>{total ?? '—'}</span>
                </div>

                {/* Children: per-client rows */}
                {isExpanded && (
                  <div className={styles.storeList}>
                    {stores.map((store) => {
                      const clientId = String(store.clientId);
                      const count = allOrders.length > 0
                        ? getClientCount(status, clientId)
                        : 0;
                      const isSelected = currentStatus === status && activeClient === clientId;
                      return (
                        <div
                          key={clientId}
                          className={`${styles.storeItem} ${isSelected ? styles.selected : ''}`}
                          onClick={() => {
                            setNavFilter(status, clientId);
                            setView('orders');
                          }}
                        >
                          <span className={styles.storeName}>{store.name}</span>
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
