/**
 * Charts.tsx — Pure SVG/Tailwind chart primitives.
 * No external UI library. All rendering is done with inline SVG.
 */

import React, { useMemo } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Alert
// ──────────────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'error' | 'warn' | 'info';

interface AlertProps {
  severity: AlertSeverity;
  message: string;
  className?: string;
}

const ALERT_STYLES: Record<AlertSeverity, string> = {
  error: 'bg-red-50 border-red-400 text-red-800',
  warn: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800',
};

const ALERT_ICONS: Record<AlertSeverity, string> = {
  error: '✕',
  warn: '⚠',
  info: 'ℹ',
};

export function Alert({ severity, message, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-2 border-l-4 p-3 rounded text-sm ${ALERT_STYLES[severity]} ${className}`}
    >
      <span aria-hidden="true" className="font-bold mt-0.5">
        {ALERT_ICONS[severity]}
      </span>
      <span>{message}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// LineChart
// ──────────────────────────────────────────────────────────────────────────────

export interface LineChartSeries {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>; // x = unix ms, y = value
}

interface LineChartProps {
  series: LineChartSeries[];
  width?: number;
  height?: number;
  yLabel?: string;
  xLabel?: string;
  className?: string;
}

const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

export function LineChart({
  series,
  width = 500,
  height = 260,
  yLabel = 'USD',
  xLabel = 'Date',
  className = '',
}: LineChartProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const allPoints = series.flatMap((s) => s.points);
    return {
      xMin: Math.min(...allPoints.map((p) => p.x)),
      xMax: Math.max(...allPoints.map((p) => p.x)),
      yMin: 0,
      yMax: Math.max(...allPoints.map((p) => p.y)) * 1.1 || 1,
    };
  }, [series]);

  const toSvg = (x: number, y: number) => ({
    sx: lerp(x, xMin, xMax, 0, innerW),
    sy: lerp(y, yMin, yMax, innerH, 0),
  });

  const yTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) =>
      parseFloat(lerp(i, 0, count, yMin, yMax).toFixed(3)),
    );
  }, [yMin, yMax]);

  const xTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) =>
      lerp(i, 0, count, xMin, xMax),
    );
  }, [xMin, xMax]);

  return (
    <svg
      role="img"
      aria-label={`Line chart: ${series.map((s) => s.label).join(', ')}`}
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className}`}
      style={{ height }}
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Grid */}
        {yTicks.map((val) => {
          const y = lerp(val, yMin, yMax, innerH, 0);
          return (
            <line
              key={val}
              x1={0}
              y1={y}
              x2={innerW}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((val) => {
          const y = lerp(val, yMin, yMax, innerH, 0);
          return (
            <text key={val} x={-8} y={y + 4} textAnchor="end" fontSize={10} fill="#6b7280">
              {val.toFixed(2)}
            </text>
          );
        })}

        {/* X-axis labels */}
        {xTicks.map((val) => {
          const x = lerp(val, xMin, xMax, 0, innerW);
          const label = new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <text key={val} x={x} y={innerH + 18} textAnchor="middle" fontSize={9} fill="#6b7280">
              {label}
            </text>
          );
        })}

        {/* Axes */}
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d1d5db" strokeWidth={1} />
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d1d5db" strokeWidth={1} />

        {/* Series lines */}
        {series.map((s) => {
          const d = s.points
            .map((p, i) => {
              const { sx, sy } = toSvg(p.x, p.y);
              return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
            })
            .join(' ');
          return (
            <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2} />
          );
        })}

        {/* Axis labels */}
        <text
          x={-innerH / 2}
          y={-44}
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize={11}
          fill="#374151"
        >
          {yLabel}
        </text>
        <text x={innerW / 2} y={innerH + 36} textAnchor="middle" fontSize={11} fill="#374151">
          {xLabel}
        </text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Legend
// ──────────────────────────────────────────────────────────────────────────────

export function ChartLegend({ series }: { series: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap gap-3 mt-2" role="list" aria-label="Chart legend">
      {series.map((s) => (
        <div key={s.label} role="listitem" className="flex items-center gap-1 text-xs text-gray-600">
          <span
            aria-hidden="true"
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: s.color }}
          />
          {s.label}
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// ScatterPlot
// ──────────────────────────────────────────────────────────────────────────────

export interface ScatterPoint {
  id: string;
  x: number; // flakiness score 0-1
  y: number; // test count
  isAlert?: boolean; // >5% flakiness
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  width?: number;
  height?: number;
  alertThreshold?: number;
  className?: string;
}

export function ScatterPlot({
  points,
  width = 480,
  height = 280,
  alertThreshold = 0.05,
  className = '',
}: ScatterPlotProps) {
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const xMax = Math.max(...points.map((p) => p.x), 0.2) * 1.1;
  const yMax = Math.max(...points.map((p) => p.y), 10) * 1.1;

  const sx = (x: number) => lerp(x, 0, xMax, 0, innerW);
  const sy = (y: number) => lerp(y, 0, yMax, innerH, 0);

  // Simple linear trend line through points
  const trendLine = useMemo(() => {
    if (points.length < 2) return null;
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const b = (sumY - m * sumX) / n;
    return { m, b };
  }, [points]);

  return (
    <svg
      role="img"
      aria-label="Scatter plot: test flakiness score vs test count"
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className}`}
      style={{ height }}
    >
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = lerp(pct, 0, 1, innerH, 0);
          const x = lerp(pct, 0, 1, 0, innerW);
          return (
            <React.Fragment key={pct}>
              <line x1={0} y1={y} x2={innerW} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <line x1={x} y1={0} x2={x} y2={innerH} stroke="#e5e7eb" strokeWidth={1} />
            </React.Fragment>
          );
        })}

        {/* Alert threshold line */}
        <line
          x1={sx(alertThreshold)}
          y1={0}
          x2={sx(alertThreshold)}
          y2={innerH}
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
        <text x={sx(alertThreshold) + 3} y={12} fontSize={9} fill="#ef4444">
          Alert threshold
        </text>

        {/* Trend line */}
        {trendLine && (
          <line
            x1={sx(0)}
            y1={sy(trendLine.b)}
            x2={sx(xMax)}
            y2={sy(trendLine.m * xMax + trendLine.b)}
            stroke="#6366f1"
            strokeWidth={1.5}
            strokeDasharray="6,3"
            aria-label="Trend line"
          />
        )}

        {/* Points */}
        {points.map((p) => (
          <circle
            key={p.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={5}
            fill={p.x > alertThreshold ? '#ef4444' : '#3b82f6'}
            fillOpacity={0.75}
            stroke="white"
            strokeWidth={1}
            aria-label={`${p.id}: flakiness ${(p.x * 100).toFixed(1)}%, ${p.y} runs`}
          >
            <title>
              {p.id}: flakiness {(p.x * 100).toFixed(1)}%, {p.y} runs
            </title>
          </circle>
        ))}

        {/* Axes */}
        <line x1={0} y1={0} x2={0} y2={innerH} stroke="#d1d5db" />
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#d1d5db" />

        {/* X ticks */}
        {[0, 0.05, 0.1, 0.15, 0.2].map((v) => (
          <text key={v} x={sx(v)} y={innerH + 16} textAnchor="middle" fontSize={9} fill="#6b7280">
            {(v * 100).toFixed(0)}%
          </text>
        ))}

        {/* Axis labels */}
        <text x={innerW / 2} y={innerH + 34} textAnchor="middle" fontSize={11} fill="#374151">
          Flakiness Score
        </text>
        <text
          x={-innerH / 2}
          y={-44}
          transform="rotate(-90)"
          textAnchor="middle"
          fontSize={11}
          fill="#374151"
        >
          Test Count
        </text>
      </g>
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// StatusGrid — Discord channels
// ──────────────────────────────────────────────────────────────────────────────

export interface ChannelStatus {
  id: string;
  name: string;
  last_sync: string; // ISO
  error_count: number;
  errors?: string[];
}

interface StatusGridProps {
  items: ChannelStatus[];
  onSelect?: (channel: ChannelStatus) => void;
  className?: string;
}

function syncColor(lastSync: string): { bg: string; label: string } {
  const diffMs = Date.now() - new Date(lastSync).getTime();
  const mins = diffMs / 60_000;
  if (mins < 5) return { bg: 'bg-green-500', label: 'Synced' };
  if (mins < 30) return { bg: 'bg-yellow-400', label: 'Stale' };
  return { bg: 'bg-red-500', label: 'Out of sync' };
}

export function StatusGrid({ items, onSelect, className = '' }: StatusGridProps) {
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 ${className}`}
      role="list"
      aria-label="Discord channel status grid"
    >
      {items.map((ch) => {
        const { bg, label } = syncColor(ch.last_sync);
        return (
          <button
            key={ch.id}
            role="listitem"
            aria-label={`${ch.name}: ${label}${ch.error_count > 0 ? `, ${ch.error_count} errors` : ''}`}
            onClick={() => onSelect?.(ch)}
            className={`relative flex flex-col items-center justify-center p-2 rounded-lg border border-gray-200 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer bg-white`}
          >
            <span className={`w-3 h-3 rounded-full ${bg} mb-1`} aria-hidden="true" />
            <span className="text-xs text-gray-700 truncate w-full text-center">{ch.name}</span>
            {ch.error_count > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none"
              >
                {ch.error_count > 9 ? '9+' : ch.error_count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Gauge — circular uptime gauge
// ──────────────────────────────────────────────────────────────────────────────

interface GaugeProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

export function Gauge({
  value,
  size = 120,
  strokeWidth = 12,
  label = 'Uptime',
  className = '',
}: GaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeValue = Math.max(0, Math.min(100, value));
  const strokeDashoffset = circumference * (1 - safeValue / 100);

  const color =
    safeValue >= 99 ? '#22c55e' : safeValue >= 95 ? '#eab308' : '#ef4444';

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      role="meter"
      aria-valuenow={safeValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${safeValue.toFixed(1)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.18}
          fontWeight={700}
          fill={color}
        >
          {safeValue.toFixed(1)}%
        </text>
        <text
          x={size / 2}
          y={size / 2 + size * 0.16}
          textAnchor="middle"
          fontSize={size * 0.1}
          fill="#6b7280"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sparkline
// ──────────────────────────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  label?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 100,
  height = 32,
  color = '#3b82f6',
  label = 'Trend',
  className = '',
}: SparklineProps) {
  if (data.length < 2) return null;

  const yMin = Math.min(...data);
  const yMax = Math.max(...data);
  const xStep = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * xStep;
      const y = lerp(v, yMin, yMax, height - 2, 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→';

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      aria-label={`${label} sparkline, latest value: ${last}, trend: ${trend}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-xs text-gray-500">{trend}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Heatmap — agent type pass rates
// ──────────────────────────────────────────────────────────────────────────────

interface HeatmapProps {
  data: Record<string, number>; // agent type → pass rate 0-1
  className?: string;
}

export function Heatmap({ data, className = '' }: HeatmapProps) {
  const entries = Object.entries(data);

  const cellColor = (rate: number): string => {
    if (rate >= 0.95) return 'bg-green-500';
    if (rate >= 0.85) return 'bg-green-300';
    if (rate >= 0.7) return 'bg-yellow-300';
    if (rate >= 0.5) return 'bg-orange-400';
    return 'bg-red-500';
  };

  return (
    <div className={`${className}`} role="table" aria-label="Agent type pass rate heatmap">
      <div role="rowgroup">
        <div role="row" className="grid grid-cols-2 gap-1.5">
          {entries.map(([agent, rate]) => (
            <div
              key={agent}
              role="cell"
              aria-label={`${agent}: ${(rate * 100).toFixed(1)}% pass rate`}
              className={`flex justify-between items-center px-3 py-2 rounded text-white text-xs font-medium ${cellColor(rate)}`}
            >
              <span>{agent}</span>
              <span className="font-bold">{(rate * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
