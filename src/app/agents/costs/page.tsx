'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { ArrowLeft, DollarSign, Loader2, Sparkles } from 'lucide-react';
import type { CostDailyBucket, CostRow, CostsResponse } from '@/app/api/agents/costs/route';

const RANGES: { value: number; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];

export default function AgentsCostsPage() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<CostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.href = '/login';
  }, [authLoading, user]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/agents/costs?days=${days}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error || 'load failed');
        if (!cancelled) setData(json.data as CostsResponse);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-6 w-6 animate-spin text-portal-accent" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div className="pl-12 sm:pl-0">
              <div className="flex items-center gap-2 text-xs text-portal-muted mb-1">
                <Link href="/agents" className="hover:text-portal-text inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" />
                  Agents
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <DollarSign className="h-6 w-6 text-portal-accent" />
                Agent costs
              </h1>
              <p className="text-sm text-portal-muted mt-1">
                Dollar cost of tasks that ran via <span className="font-mono">ANTHROPIC_API_KEY</span>.
                Max-subscription OAuth tasks show <span className="font-mono">$0.00</span>.
              </p>
            </div>
            <div className="flex gap-2">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setDays(r.value)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${
                    days === r.value
                      ? 'bg-portal-accent/10 border-portal-accent/40 text-portal-accent'
                      : 'bg-portal-card border-portal-border text-portal-muted hover:text-portal-text hover:border-portal-accent/30'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg px-4 py-3 text-sm">
              Failed to load: {error}
            </div>
          )}

          {/* Stat strip */}
          <StatStrip data={data} loading={loading} days={days} />

          {/* Chart */}
          <div className="bg-portal-card border border-portal-border rounded-lg p-4 mb-6">
            <div className="text-xs text-portal-muted mb-2">Daily spend</div>
            {loading || !data ? (
              <div className="h-48 flex items-center justify-center text-portal-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <DailyCostChart daily={data.daily} />
            )}
          </div>

          {/* Table */}
          <div className="bg-portal-card border border-portal-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-portal-border text-xs text-portal-muted">
              Tasks in this window
            </div>
            {loading || !data ? (
              <div className="h-32 flex items-center justify-center text-portal-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : data.rows.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-sm text-portal-muted">
                No tasks with recorded cost in this window yet.
              </div>
            ) : (
              <CostTable rows={data.rows} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatStrip({
  data,
  loading,
  days,
}: {
  data: CostsResponse | null;
  loading: boolean;
  days: number;
}): JSX.Element {
  const total = data?.totalUsd ?? 0;
  const paid = data?.paidTaskCount ?? 0;
  const free = (data?.taskCount ?? 0) - paid;
  const color =
    total === 0
      ? 'text-emerald-300'
      : total < 5
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Tile
        label={`Spend, last ${days} days`}
        value={loading ? '…' : `$${total.toFixed(4)}`}
        valueClass={color}
      />
      <Tile
        label="Tasks with cost"
        value={loading ? '…' : String(data?.taskCount ?? 0)}
      />
      <Tile
        label="API-key path"
        value={loading ? '…' : String(paid)}
        valueClass={paid > 0 ? 'text-amber-300' : 'text-portal-text'}
      />
      <Tile
        label="OAuth path"
        value={loading ? '…' : String(free)}
        valueClass="text-emerald-300"
        icon={<Sparkles className="h-3 w-3" />}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass = 'text-portal-text',
  icon,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: React.ReactNode;
}): JSX.Element {
  return (
    <div className="bg-portal-card border border-portal-border rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-portal-muted flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${valueClass}`}>{value}</div>
    </div>
  );
}

function DailyCostChart({ daily }: { daily: CostDailyBucket[] }): JSX.Element {
  const max = Math.max(0.0001, ...daily.map((d) => d.totalUsd));
  // Bars get plenty of room: 12px column + 2px gap.
  const colWidth = 12;
  const gap = 2;
  const chartHeight = 160;
  const width = daily.length * (colWidth + gap);

  // Show ~5 evenly-spaced date labels along the x-axis.
  const labelEvery = Math.max(1, Math.ceil(daily.length / 5));

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: Math.max(width, 320) }}>
        <svg
          width="100%"
          height={chartHeight + 40}
          viewBox={`0 0 ${width} ${chartHeight + 40}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Daily cost chart"
        >
          {daily.map((d, i) => {
            const h = (d.totalUsd / max) * chartHeight;
            const x = i * (colWidth + gap);
            const y = chartHeight - h;
            const fill = d.totalUsd > 0 ? '#f59e0b' : '#374151';
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={y}
                  width={colWidth}
                  height={Math.max(h, 1)}
                  fill={fill}
                  rx="1"
                >
                  <title>
                    {d.date} — ${d.totalUsd.toFixed(4)} ({d.paidCount} paid, {d.freeCount} free)
                  </title>
                </rect>
                {i % labelEvery === 0 && (
                  <text
                    x={x + colWidth / 2}
                    y={chartHeight + 14}
                    fontSize="9"
                    textAnchor="middle"
                    fill="#6b7280"
                  >
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
          {/* y-axis max marker */}
          <line
            x1="0"
            y1="0"
            x2={width}
            y2="0"
            stroke="#1f2937"
            strokeDasharray="2 4"
          />
        </svg>
        <div className="flex justify-between text-[10px] text-portal-muted mt-1">
          <span>$0</span>
          <span>${max.toFixed(4)} max/day</span>
        </div>
      </div>
    </div>
  );
}

function CostTable({ rows }: { rows: CostRow[] }): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-portal-muted border-b border-portal-border">
            <th className="text-left px-3 py-2 font-normal">When</th>
            <th className="text-left px-3 py-2 font-normal">Task</th>
            <th className="text-left px-3 py-2 font-normal">Project</th>
            <th className="text-left px-3 py-2 font-normal">Agent</th>
            <th className="text-left px-3 py-2 font-normal">Path</th>
            <th className="text-right px-3 py-2 font-normal">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.taskId} className="border-b border-portal-border/50 last:border-0 hover:bg-portal-border/20">
              <td className="px-3 py-2 text-portal-muted whitespace-nowrap text-xs">
                {r.completedAt ? new Date(r.completedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
              </td>
              <td className="px-3 py-2 text-portal-text">
                <Link href={`/agents?task=${r.taskId}`} className="hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-portal-muted">{r.projectName}</td>
              <td className="px-3 py-2 text-portal-muted">{r.agentName ?? '—'}</td>
              <td className="px-3 py-2">
                {r.authPath === 'oauth' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
                    <Sparkles className="h-3 w-3" />
                    OAuth
                  </span>
                ) : (
                  <span className="text-amber-300 text-xs">API key</span>
                )}
              </td>
              <td className={`px-3 py-2 text-right font-mono ${r.costUsd > 0 ? 'text-amber-300' : 'text-portal-muted'}`}>
                ${r.costUsd.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
