import { useState, useCallback, useRef } from 'react';
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
  const { currentStatus, setStatus, setSearchQuery } = useOrdersStore();
  const { stores, statusCounts, storeCountsByStatus, activeStoreId, setActiveStore } = useStoresStore();

  const [expandedSections, setExpandedSections] = useState<Set<OrderStatus>>(
    new Set(['awaiting_shipment'])
  );
  const [searchValue, setSearchValue] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        {/* Status Sections */}
        <div className={styles.nav}>
          {STATUSES.map((status) => (
            <div
              key={status}
              className={`${styles.section} ${expandedSections.has(status) ? styles.expanded : ''}`}
            >
              <div
                className={`${styles.sectionHeader} ${currentStatus === status ? styles.active : ''}`}
                onClick={() => { setStatus(status); setView('orders'); }}
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
                <span className={styles.badge}>{statusCounts[status] || '—'}</span>
              </div>
              {expandedSections.has(status) && (
                <div className={styles.storeList}>
                  {stores
                    .map((store) => {
                      const counts = storeCountsByStatus[status] || {};
                      const count = (store.storeIds || []).reduce(
                        (sum: number, sid: number) => sum + (counts[sid] || 0),
                        0
                      );
                      return { store, count };
                    })
                    .sort((a, b) => b.count - a.count)
                    .map(({ store, count }) => (
                      <div
                        key={store.clientId}
                        className={`${styles.storeItem} ${activeStoreId === store.clientId ? styles.selected : ''}`}
                        onClick={() => {
                          setStatus(status);
                          setActiveStore(store.clientId);
                          setView('orders');
                        }}
                      >
                        <span className={styles.storeName}>{store.name}</span>
                        <span className={styles.storeCount}>{count}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}

          <div className={styles.divider} />

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
