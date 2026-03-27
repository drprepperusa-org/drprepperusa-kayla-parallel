/**
 * Dashboard.tsx — Main Phase 7.5 stakeholder visibility dashboard.
 * 4 pages: Cost Trends | Test Reliability | Discord Channels | System Health
 * Data: polling /metrics (30s) + /health (10s), mock mode for local dev.
 */

import React, { useState, useCallback } from 'react';
import { useMetrics } from './hooks/useMetrics';
import { useHealth } from './hooks/useHealth';
import { CostTrendsPage } from './pages/CostTrends';
import { TestReliabilityPage } from './pages/TestReliability';
import { DiscordChannelsPage } from './pages/DiscordChannels';
import { SystemHealthPage } from './pages/SystemHealth';


// ──────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ──────────────────────────────────────────────────────────────────────────────

type TabId = 'cost' | 'tests' | 'discord' | 'health';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { id: 'cost', label: 'Cost Trends', icon: '💰' },
  { id: 'tests', label: 'Test Reliability', icon: '🧪' },
  { id: 'discord', label: 'Discord Channels', icon: '💬' },
  { id: 'health', label: 'System Health', icon: '❤️' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Dev mode detection
// ──────────────────────────────────────────────────────────────────────────────

const IS_MOCK = import.meta.env.VITE_DASHBOARD_MOCK === 'true' || import.meta.env.DEV;

// ──────────────────────────────────────────────────────────────────────────────
// Nav tab bar
// ──────────────────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
  errors: Record<TabId, boolean>;
}

function TabBar({ active, onChange, errors }: TabBarProps) {
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + TABS.length) % TABS.length;
      onChange(TABS[nextIndex].id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % TABS.length;
      onChange(TABS[nextIndex].id);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(TABS[0].id);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(TABS[TABS.length - 1].id);
    }
  };

  return (
    <nav role="tablist" aria-label="Dashboard sections" className="flex border-b border-gray-200 bg-white">
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleTabKeyDown(e, index)}
          className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
            active === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
          {errors[tab.id] && (
            <span
              aria-label="Error indicator"
              className="absolute top-2 right-2 w-2 h-2 rounded-full bg-yellow-400"
            />
          )}
        </button>
      ))}
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────────────────

interface HeaderProps {
  onRefreshAll: () => void;
  isMock: boolean;
}

function Header({ onRefreshAll, isMock }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-gray-900 text-white">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">📊</span>
        <div>
          <h1 className="text-base font-semibold leading-tight">ChiefOfStaff Dashboard</h1>
          <p className="text-xs text-gray-400">Phase 7.5 · Stakeholder Visibility</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isMock && (
          <span className="text-xs bg-yellow-600 text-yellow-100 px-2 py-0.5 rounded font-mono">
            MOCK DATA
          </span>
        )}
        <button
          onClick={onRefreshAll}
          aria-label="Refresh all dashboard data"
          className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-white"
        >
          ↻ Refresh
        </button>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────────────────────────────────────

export interface DashboardProps {
  /** Override mock mode (useful for tests). */
  mock?: boolean;
  /** Override metrics poll interval (ms). Default 30000. */
  metricsInterval?: number;
  /** Override health poll interval (ms). Default 10000. */
  healthInterval?: number;
}

export function Dashboard({
  mock = IS_MOCK,
  metricsInterval = 30_000,
  healthInterval = 10_000,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('cost');

  const handleMetricsError = useCallback((err: Error) => {
    console.error('[Dashboard] metrics error:', err);
  }, []);
  const handleHealthError = useCallback((err: Error) => {
    console.error('[Dashboard] health error:', err);
  }, []);

  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
    refresh: refreshMetrics,
  } = useMetrics({
    interval: metricsInterval,
    onError: handleMetricsError,
    mock,
  });

  const {
    health,
    loading: healthLoading,
    error: healthError,
    lastUpdated,
    refresh: refreshHealth,
  } = useHealth({
    interval: healthInterval,
    onError: handleHealthError,
    mock,
  });

  const handleRefreshAll = useCallback(() => {
    refreshMetrics();
    refreshHealth();
  }, [refreshMetrics, refreshHealth]);

  const tabErrors: Record<TabId, boolean> = {
    cost: !!metricsError,
    tests: !!metricsError,
    discord: !!metricsError,
    health: !!healthError,
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header onRefreshAll={handleRefreshAll} isMock={mock} />

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} errors={tabErrors} />

      {/* Page panels */}
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full">
        {/* Cost Trends */}
        <div
          role="tabpanel"
          id="panel-cost"
          aria-labelledby="tab-cost"
          className={activeTab === 'cost' ? 'block' : 'hidden'}
        >
          <CostTrendsPage
            metrics={metrics}
            loading={metricsLoading}
            error={metricsError}
          />
        </div>

        {/* Test Reliability */}
        <div
          role="tabpanel"
          id="panel-tests"
          aria-labelledby="tab-tests"
          className={activeTab === 'tests' ? 'block' : 'hidden'}
        >
          <TestReliabilityPage
            metrics={metrics}
            loading={metricsLoading}
            error={metricsError}
          />
        </div>

        {/* Discord Channels */}
        <div
          role="tabpanel"
          id="panel-discord"
          aria-labelledby="tab-discord"
          className={activeTab === 'discord' ? 'block' : 'hidden'}
        >
          <DiscordChannelsPage
            metrics={metrics}
            loading={metricsLoading}
            error={metricsError}
            pollInterval={healthInterval}
          />
        </div>

        {/* System Health */}
        <div
          role="tabpanel"
          id="panel-health"
          aria-labelledby="tab-health"
          className={activeTab === 'health' ? 'block' : 'hidden'}
        >
          <SystemHealthPage
            health={health}
            metrics={metrics}
            healthLoading={healthLoading}
            healthError={healthError}
            lastUpdated={lastUpdated}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="text-xs text-center text-gray-400 py-3 border-t border-gray-200 bg-white">
        Phase 7.5 Dashboard · Metrics every {metricsInterval / 1000}s · Health every {healthInterval / 1000}s
        {mock && ' · Mock mode active'}
      </footer>
    </div>
  );
}

export default Dashboard;
