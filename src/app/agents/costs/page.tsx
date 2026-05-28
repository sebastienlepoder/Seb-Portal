'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { ArrowLeft, DollarSign, Loader2, Sparkles, HelpCircle } from 'lucide-react';
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
              <p className="text-sm text-portal-muted mt-1 max-w-2xl">
                <span className="text-amber-300">Billed</span> = real money charged via{' '}
                <span className="font-mono">ANTHROPIC_API_KEY</span> (matches your Anthropic console
                within SDK estimation error).{' '}
                <span className="text-emerald-300">OAuth estimate</span> = informational SDK
                token-cost figure for Max-subscription runs — you weren&apos;t actually charged
                for these.
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

          <StatStrip data={data} loading={loading} days={days} />

          <div className="bg-portal-card border border-portal-border rounded-lg p-4 mb-6">
            <div className="text-xs text-portal-muted mb-2 flex items-center gap-2">
              <span>Daily spend</span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />
                billed
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <span className="w-2 h-2 rounded-sm bg-emerald-500/60 inline-block" />
                OAuth estimate
              </span>
            </div>
            {loading || !data ? (
              <div className="h-48 flex items-center justify-center text-portal-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <DailyCostChart daily={data.daily} />
            )}
          </div>

          {data && data.unknownTaskCount > 0 && (
            <div className="mb-4 bg-portal-bg border border-portal-border text-portal-muted rounded-md px-3 py-2 text-xs flex items-start gap-2">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {data.unknownTaskCount} task{data.unknownTaskCount === 1 ? '' : 's'} in this window
                ran before the auth-path column existed. They&apos;re shown below as
                <span className="font-mono text-portal-muted/80"> unknown</span> and excluded from
                the totals above.
              </span>
            </div>
          )}

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
                No completed tasks in this window yet.
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
  const billed = data?.billedUsd ?? 0;
  const oauthEst = data?.estimatedOauthUsd ?? 0;
  const billedCount = data?.billedTaskCount ?? 0;
  const oauthCount = data?.oauthTaskCount ?? 0;
  const billedColor =
    billed === 0 ? 'text-emerald-300' : billed < 5 ? 'text-amber-300' : 'text-red-300';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Tile
        label={`Billed via API key, last ${days}d`}
        value={loading ? '…' : `$${billed.toFixed(4)}`}
        valueClass={billedColor}
        sub={loading ? '' : `${billedCount} task${billedCount === 1 ? '' : 's'}`}
      />
      <Tile
        label={`OAuth estimate, last ${days}d`}
        value={loading ? '…' : `$${oauthEst.toFixed(4)}`}
        valueClass="text-emerald-300"
        icon={<Sparkles className="h-3 w-3" />}
        sub={loading ? '' : `${oauthCount} task${oauthCount === 1 ? '' : 's'} (not charged)`}
      />
      <Tile
        label="API-key tasks"
        value={loading ? '…' : String(billedCount)}
        valueClass={billedCount > 0 ? 'text-amber-300' : 'text-portal-text'}
      />
      <Tile
        label="OAuth tasks"
        value={loading ? '…' : String(oauthCount)}
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
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  icon?: React.ReactNode;
  sub?: string;
}): JSX.Element {
  return (
    <div className="bg-portal-card border border-portal-border rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-portal-muted flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-portal-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function DailyCostChart({ daily }: { daily: CostDailyBucket[] }): JSX.Element {
  // Chart shows TWO stacked bars per day: billed (amber, bottom) +
  // OAuth estimate (emerald-muted, on top). Max-of-totals drives scale.
  const max = Math.max(
    0.0001,
    ...daily.map((d) => d.billedUsd + d.estimatedOauthUsd),
  );
  const colWidth = 12;
  const gap = 2;
  const chartHeight = 160;
  const width = daily.length * (colWidth + gap);
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
            const billedH = (d.billedUsd / max) * chartHeight;
            const oauthH = (d.estimatedOauthUsd / max) * chartHeight;
            const total = d.billedUsd + d.estimatedOauthUsd;
            const x = i * (colWidth + gap);
            const billedY = chartHeight - billedH;
            const oauthY = billedY - oauthH;
            return (
              <g key={d.date}>
                {oauthH > 0 && (
                  <rect
                    x={x}
                    y={oauthY}
                    width={colWidth}
                    height={Math.max(oauthH, 1)}
                    fill="#34d399"
                    opacity={0.5}
                    rx="1"
                  >
                    <title>
                      {d.date} — OAuth est. ${d.estimatedOauthUsd.toFixed(4)} ({d.oauthCount} run
                      {d.oauthCount === 1 ? '' : 's'})
                    </title>
                  </rect>
                )}
                {billedH > 0 && (
                  <rect
                    x={x}
                    y={billedY}
                    width={colWidth}
                    height={Math.max(billedH, 1)}
                    fill="#f59e0b"
                    rx="1"
                  >
                    <title>
                      {d.date} — billed ${d.billedUsd.toFixed(4)} ({d.billedCount} API-key run
                      {d.billedCount === 1 ? '' : 's'})
                    </title>
                  </rect>
                )}
                {total === 0 && (
                  <rect
                    x={x}
                    y={chartHeight - 1}
                    width={colWidth}
                    height={1}
                    fill="#374151"
                    rx="1"
                  />
                )}
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
          <line x1="0" y1="0" x2={width} y2="0" stroke="#1f2937" strokeDasharray="2 4" />
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
          {rows.map((r) => {
            const isOauth = r.authPath === 'oauth';
            const isApiKey = r.authPath === 'api_key';
            return (
              <tr
                key={r.taskId}
                className="border-b border-portal-border/50 last:border-0 hover:bg-portal-border/20"
              >
                <td className="px-3 py-2 text-portal-muted whitespace-nowrap text-xs">
                  {r.completedAt
                    ? new Date(r.completedAt).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })
                    : '—'}
                </td>
                <td className="px-3 py-2 text-portal-text">
                  <Link href={`/agents?task=${r.taskId}`} className="hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-portal-muted">{r.projectName}</td>
                <td className="px-3 py-2 text-portal-muted">{r.agentName ?? '—'}</td>
                <td className="px-3 py-2">
                  {isOauth && (
                    <span className="inline-flex items-center gap-1 text-emerald-300 text-xs">
                      <Sparkles className="h-3 w-3" />
                      OAuth
                    </span>
                  )}
                  {isApiKey && <span className="text-amber-300 text-xs">API key</span>}
                  {!isOauth && !isApiKey && (
                    <span className="text-portal-muted text-xs">unknown</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono ${
                    isApiKey ? 'text-amber-300' : 'text-portal-muted'
                  }`}
                  title={
                    isOauth
                      ? 'SDK token-cost estimate — you were NOT charged for this; OAuth covered it.'
                      : isApiKey
                        ? 'Billed by Anthropic via your API key.'
                        : 'Auth path not recorded for this run.'
                  }
                >
                  ${r.costUsd.toFixed(4)}
                  {isOauth && <span className="text-[10px] text-portal-muted ml-1">est.</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
