import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import '@/app/i18n';
import i18next from 'i18next';

// ── Constants ──────────────────────────────────────────────
const INTERVAL_MS = 3000;
const HISTORY_LEN = 30;

// ── Helpers ────────────────────────────────────────────────
const parseStats = (raw) => {
  const result = { downlink: 0, uplink: 0 };
  try {
    const data = JSON.parse(raw);
    if (!data?.stat) return result;
    for (const item of data.stat) {
      if (item.name === 'outbound>>>proxy>>>traffic>>>downlink') result.downlink = item.value ?? 0;
      else if (item.name === 'outbound>>>proxy>>>traffic>>>uplink') result.uplink = item.value ?? 0;
    }
  } catch (_) {}
  return result;
};

/** Bytes/s → compact label, e.g. "12.3 Mb/s" */
const fmt = (bps) => {
  const n = parseFloat(bps) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} Mb/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} Kb/s`;
  return `${Math.round(n)} b/s`;
};

/** Shorter axis label — includes 'b' unit, e.g. "1Mb", "800Kb", "0b" */
const fmtAxis = (bps) => {
  const n = bps || 0;
  if (n === 0) return '0b';
  if (n >= 1e6) return `${Math.round(n / 1e6)}Mb`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}Kb`;
  return `${Math.round(n)}b`;
};

// ── Combined chart with Y-axis (single SVG) ────────────────
/**
 * Renders both download + upload sparklines in one SVG, sharing a
 * common Y scale, with a vertical axis on the left showing 3 ticks.
 */
function Chart({ dlHistory, ulHistory, dlColor, ulColor, height = 64 }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(300); // default before measure

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Shared scale across both series
  const maxVal = Math.max(...dlHistory, ...ulHistory, 1024);

  // SVG internal coordinate system
  const AXIS_W = 34;   // reserved width for Y-axis labels (left side)
  const PAD_R = 4;     // right padding
  const PAD_T = 6;     // top padding (so the top dot isn't clipped)
  const PAD_B = 2;     // bottom padding
  const TOTAL_W = width; // dynamic width
  const CHART_W = Math.max(10, TOTAL_W - AXIS_W - PAD_R);
  const CHART_H = height - PAD_T - PAD_B;

  // 3 evenly spaced Y ticks: top, mid, bottom
  const ticks = [maxVal, maxVal / 2, 0];

  /** Map a bytes/s value to a Y coordinate within the chart area */
  const toY = (v) => PAD_T + (1 - v / maxVal) * CHART_H;

  /** Map a series to SVG points */
  const toPoints = (series) =>
    series.map((v, i) => [
      AXIS_W + (i / (series.length - 1)) * CHART_W,
      toY(v),
    ]);

  /** Build smooth cubic-bezier path from point array */
  const buildPath = (pts) =>
    pts.reduce((acc, [x, y], i) => {
      if (i === 0) return `M ${x},${y}`;
      const [px, py] = pts[i - 1];
      const cx = (px + x) / 2;
      return `${acc} C ${cx},${py} ${cx},${y} ${x},${y}`;
    }, '');

  const renderSeries = (series, color, gradId) => {
    if (series.length < 2) return null;
    const pts = toPoints(series);
    const d = buildPath(pts);
    const [fx] = pts[0];
    const [lx] = pts[pts.length - 1];
    const bottomY = PAD_T + CHART_H;
    const area = `${d} L ${lx},${bottomY} L ${fx},${bottomY} Z`;
    const [dotX, dotY] = pts[pts.length - 1];

    return (
      <g key={gradId}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={dotX} cy={dotY} r="2.5" fill={color} />
      </g>
    );
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height }}>
      <svg
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* ── Y axis line ── */}
      <line
        x1={AXIS_W} y1={PAD_T}
        x2={AXIS_W} y2={PAD_T + CHART_H}
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
      />

      {/* ── Ticks, grid lines and labels ── */}
      {ticks.map((val, i) => {
        const y = toY(val);
        return (
          <g key={i}>
            {/* Horizontal dashed grid line */}
            <line
              x1={AXIS_W} y1={y}
              x2={TOTAL_W - PAD_R} y2={y}
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="1"
              strokeDasharray={i === ticks.length - 1 ? 'none' : '3 3'}
            />
            {/* Tick mark */}
            <line
              x1={AXIS_W - 3} y1={y}
              x2={AXIS_W} y2={y}
              stroke="rgba(0,0,0,0.18)"
              strokeWidth="1"
            />
            {/* Label — right-aligned just before the axis */}
            <text
              x={AXIS_W - 6}
              y={y}
              textAnchor="end"
              dominantBaseline={
                i === 0 ? 'hanging'    // top tick: hang below
                : i === ticks.length - 1 ? 'auto'  // bottom tick: above
                : 'middle'
              }
              fontSize="8"
              fill="rgba(0,0,0,0.35)"
              fontFamily="system-ui, sans-serif"
            >
              {fmtAxis(val)}
            </text>
          </g>
        );
      })}

      {/* ── Upload line (behind download) ── */}
      {renderSeries(ulHistory, ulColor, 'grad-ul')}

      {/* ── Download line (front) ── */}
      {renderSeries(dlHistory, dlColor, 'grad-dl')}
      </svg>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────
const NetworkMonitor = ({ isConnected }) => {
  const [speed, setSpeed] = useState({ downlink: 0, uplink: 0 });
  const [dlHistory, setDlHistory] = useState(Array(HISTORY_LEN).fill(0));
  const [ulHistory, setUlHistory] = useState(Array(HISTORY_LEN).fill(0));
  const prevStatsRef = useRef({ downlink: 0, uplink: 0 });

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!isConnected) {
        setSpeed({ downlink: 0, uplink: 0 });
        setDlHistory(Array(HISTORY_LEN).fill(0));
        setUlHistory(Array(HISTORY_LEN).fill(0));
        prevStatsRef.current = { downlink: 0, uplink: 0 };
        return;
      }
      try {
        const raw = await invoke('get_xray_stats');
        const newStats = parseStats(raw);
        const prev = prevStatsRef.current;
        const dl = Math.max(0, (newStats.downlink - prev.downlink) / (INTERVAL_MS / 1000));
        const ul = Math.max(0, (newStats.uplink - prev.uplink) / (INTERVAL_MS / 1000));
        prevStatsRef.current = newStats;
        setSpeed({ downlink: dl, uplink: ul });
        setDlHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), dl]);
        setUlHistory((h) => [...h.slice(-(HISTORY_LEN - 1)), ul]);
      } catch (e) {
        console.error('NetworkMonitor:', e);
      }
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isConnected]);

  const dlColor = '#6366f1';
  const ulColor = '#f59e0b';

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.labelGroup}>
          <span style={{ ...styles.dot, background: dlColor }} />
          <span style={styles.label}>{i18next.t('Download')}</span>
          <span style={{ ...styles.value, color: dlColor }}>{fmt(speed.downlink)}</span>
        </div>
        <div style={styles.labelGroup}>
          <span style={{ ...styles.dot, background: ulColor }} />
          <span style={styles.label}>{i18next.t('Upload')}</span>
          <span style={{ ...styles.value, color: ulColor }}>{fmt(speed.uplink)}</span>
        </div>
      </div>

      {/* Chart */}
      <div style={styles.chartWrap}>
        <Chart
          dlHistory={dlHistory}
          ulHistory={ulHistory}
          dlColor={dlColor}
          ulColor={ulColor}
          height={64}
        />
      </div>
    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────
const styles = {
  card: {
    width: '90%',
    maxWidth: 448,
    margin: '12px auto 0',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.60)',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(6px)',
    padding: '10px 14px 8px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  labelGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 500,
  },
  value: {
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 72,
    textAlign: 'right',
  },
  chartWrap: {
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.55)',
    borderRadius: 8,
  },
  overlayText: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};

export default NetworkMonitor;
