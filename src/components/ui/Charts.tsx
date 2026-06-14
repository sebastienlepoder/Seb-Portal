'use client';

/**
 * Lightweight, dependency-free SVG charts that inherit the active portal theme
 * via CSS variables (e.g. `rgb(var(--portal-accent))`). Kept in-house to match
 * the existing hand-rolled SVG style (see /agents/costs) and avoid pulling a
 * heavy charting library into the Docker bundle.
 */

import { cn } from '@/lib/utils';

const ACCENT = 'rgb(var(--portal-accent))';
const MUTED = 'rgb(var(--portal-muted))';

/** Resolve a token name or raw color into a usable stroke/fill value. */
function color(c?: string): string {
  if (!c) return ACCENT;
  if (c.startsWith('#') || c.startsWith('rgb') || c.startsWith('hsl')) return c;
  // Treat as a portal token name, e.g. "success" → rgb(var(--portal-success)).
  return `rgb(var(--portal-${c}))`;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

export function Sparkline({
  data,
  positive,
  stroke,
  fill = true,
  height = 32,
  width = 100,
  className,
}: {
  data: number[];
  /** Convenience: green when true, red when false. Overridden by `stroke`. */
  positive?: boolean;
  stroke?: string;
  fill?: boolean;
  height?: number;
  width?: number;
  className?: string;
}) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const y = (v: number) => height - ((v - min) / range) * (height - 2) - 1;

  const points = data.map((v, i) => `${(i * stepX).toFixed(2)},${y(v).toFixed(2)}`);
  const line = points.join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  const strokeColor = stroke
    ? color(stroke)
    : positive === undefined
      ? ACCENT
      : positive
        ? 'rgb(var(--portal-success))'
        : 'rgb(var(--portal-danger))';

  const gid = `spark-${Math.round(data[0]! * 1000)}-${data.length}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gid})`} />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Bar chart ───────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({
  data,
  height = 160,
  formatValue = (v) => String(v),
  className,
}: {
  data: BarDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div className="text-sm text-portal-muted text-center py-8">No data</div>;
  }

  return (
    <div className={cn('flex items-end gap-2', className)} style={{ height }}>
      {data.map((d, i) => {
        const h = Math.max(2, (d.value / max) * (height - 28));
        return (
          <div key={`${d.label}-${i}`} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
            <span className="text-[10px] text-portal-text-dim tabular-nums">{formatValue(d.value)}</span>
            <div
              className="w-full rounded-t transition-all duration-300"
              style={{ height: h, background: color(d.color) }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
            <span className="text-[10px] text-portal-muted truncate w-full text-center" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Horizontal bars (good for ranked lists / distributions) ─────────────────

export function HBarChart({
  data,
  formatValue = (v) => String(v),
  className,
}: {
  data: BarDatum[];
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <div className="text-sm text-portal-muted text-center py-8">No data</div>;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex items-center gap-3">
          <span className="text-xs text-portal-text-dim w-28 truncate shrink-0" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 h-5 bg-portal-bg rounded overflow-hidden">
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${(d.value / max) * 100}%`, background: color(d.color) }}
            />
          </div>
          <span className="text-xs text-portal-text tabular-nums w-12 text-right shrink-0">
            {formatValue(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut (distributions / category breakdowns) ─────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  size = 120,
  thickness = 16,
  centerLabel,
  centerSub,
  className,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--portal-border))" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s, i) => {
            const frac = s.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={color(s.color)}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
      </svg>
      {(centerLabel || segments.length > 0) && (
        <div className="min-w-0">
          {centerLabel && (
            <div className="mb-2">
              <div className="text-xl font-bold text-portal-text leading-none">{centerLabel}</div>
              {centerSub && <div className="text-xs text-portal-muted mt-0.5">{centerSub}</div>}
            </div>
          )}
          <ul className="space-y-1">
            {segments.map((s, i) => (
              <li key={`${s.label}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color(s.color) }} />
                <span className="text-portal-text-dim truncate">{s.label}</span>
                <span className="text-portal-muted tabular-nums ml-auto">
                  {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
