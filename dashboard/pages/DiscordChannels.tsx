/**
 * DiscordChannels page — 21-channel status grid with color coding and detail panel.
 */

import React, { useMemo, useState } from 'react';
import { StatusGrid, Alert, type ChannelStatus } from '../components/Charts';
import type { Metrics } from '../hooks/useMetrics';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface DiscordChannelsProps {
  metrics: Metrics | null;
  loading: boolean;
  error: Error | null;
  /** Polling interval in ms (for display only) */
  pollInterval?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Detail panel
// ──────────────────────────────────────────────────────────────────────────────

function ChannelDetail({
  channel,
  onClose,
}: {
  channel: ChannelStatus;
  onClose: () => void;
}) {
  const diffMs = Date.now() - new Date(channel.last_sync).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const secs = Math.floor((diffMs % 60_000) / 1000);
  const syncStatus = mins < 5 ? 'Synced' : mins < 30 ? 'Stale' : 'Out of sync';
  const syncColor =
    mins < 5 ? 'text-green-600' : mins < 30 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="channel-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-start mb-4">
          <h3 id="channel-detail-title" className="text-lg font-semibold text-gray-900">
            #{channel.name}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close channel detail"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none focus:outline-none focus:ring-2 focus:ring-blue-400 rounded"
          >
            ×
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">Status</dt>
            <dd className={`font-semibold ${syncColor}`}>{syncStatus}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">Last Sync</dt>
            <dd className="text-gray-800">
              {new Date(channel.last_sync).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'medium',
              })}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">Time Since Sync</dt>
            <dd className={syncColor}>
              {mins}m {secs}s ago
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs uppercase tracking-wide">Error Count</dt>
            <dd className={channel.error_count > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
              {channel.error_count}
            </dd>
          </div>
          {channel.errors && channel.errors.length > 0 && (
            <div>
              <dt className="text-gray-500 text-xs uppercase tracking-wide mb-1">Error Log</dt>
              <dd>
                <ul className="space-y-1" aria-label="Error log">
                  {channel.errors.map((err, i) => (
                    <li
                      key={i}
                      className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 font-mono"
                    >
                      {err}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary bar
// ──────────────────────────────────────────────────────────────────────────────

function SyncSummary({ channels }: { channels: ChannelStatus[] }) {
  const { green, yellow, red } = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const ch of channels) {
      const mins = (Date.now() - new Date(ch.last_sync).getTime()) / 60_000;
      if (mins < 5) g++;
      else if (mins < 30) y++;
      else r++;
    }
    return { green: g, yellow: y, red: r };
  }, [channels]);

  return (
    <div className="flex gap-3" role="group" aria-label="Sync status summary">
      <div className="flex items-center gap-1.5 text-sm" aria-label={`${green} synced channels`}>
        <span className="w-2.5 h-2.5 rounded-full bg-green-500" aria-hidden="true" />
        <span className="font-semibold text-green-700">{green}</span>
        <span className="text-gray-500">synced</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm" aria-label={`${yellow} stale channels`}>
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" aria-hidden="true" />
        <span className="font-semibold text-yellow-700">{yellow}</span>
        <span className="text-gray-500">stale</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm" aria-label={`${red} out-of-sync channels`}>
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />
        <span className="font-semibold text-red-700">{red}</span>
        <span className="text-gray-500">out of sync</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function DiscordChannelsPage({
  metrics,
  loading,
  error,
  pollInterval = 10_000,
}: DiscordChannelsProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelStatus | null>(null);

  const channels: ChannelStatus[] = useMemo(
    () => metrics?.discord_channels ?? [],
    [metrics],
  );

  const totalErrors = useMemo(
    () => channels.reduce((sum, ch) => sum + ch.error_count, 0),
    [channels],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" aria-live="polite">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" aria-hidden="true" />
        <span className="ml-3 text-gray-500">Loading channel data…</span>
      </div>
    );
  }

  return (
    <section aria-labelledby="discord-channels-heading" className="flex flex-col gap-4">
      <div className="flex justify-between items-start flex-wrap gap-2">
        <h2 id="discord-channels-heading" className="text-lg font-semibold text-gray-900">
          Discord Channels
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span>Polling every {pollInterval / 1000}s</span>
          {totalErrors > 0 && (
            <span
              className="bg-red-500 text-white font-bold px-2 py-0.5 rounded-full"
              aria-label={`${totalErrors} total errors`}
            >
              {totalErrors} errors
            </span>
          )}
        </div>
      </div>

      {error && <Alert severity="warn" message={`Data may be stale: ${error.message}`} />}

      {/* Sync summary */}
      {channels.length > 0 && <SyncSummary channels={channels} />}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500" aria-label="Color legend">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" /> &lt;5m (synced)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400" aria-hidden="true" /> 5–30m (stale)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" /> &gt;30m (out of sync)
        </span>
      </div>

      {/* Channel grid */}
      {channels.length > 0 ? (
        <StatusGrid items={channels} onSelect={setSelectedChannel} />
      ) : (
        <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
          No Discord channel data available
        </div>
      )}

      {/* Rate limit indicator */}
      {metrics && (
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span>API rate limit remaining:</span>
          <span
            className={`font-mono font-semibold ${
              metrics.discord_api_rate_limit_remaining < 10
                ? 'text-red-600'
                : metrics.discord_api_rate_limit_remaining < 30
                ? 'text-yellow-600'
                : 'text-green-600'
            }`}
          >
            {metrics.discord_api_rate_limit_remaining}
          </span>
        </div>
      )}

      {/* Detail modal */}
      {selectedChannel && (
        <ChannelDetail
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
        />
      )}
    </section>
  );
}
