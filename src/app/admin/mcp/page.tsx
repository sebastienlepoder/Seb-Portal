'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  Wrench,
  Loader2,
  Shield,
  AlertTriangle,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  Bot,
  User as UserIcon,
} from 'lucide-react';

interface ToolRow {
  toolName: string;
  description: string;
  adminOnly: boolean;
  registered: boolean;
  totalCalls: number;
  totalCalls7d: number;
  successRate7d: number;
  errors24h: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastCalledAt: string | null;
  lastError: string | null;
  trustScore: number;
}

interface CallDetail {
  id: string;
  callerId: string | null;
  callerKind: string;
  success: boolean;
  durationMs: number;
  inputJson: string | null;
  resultPreview: string | null;
  error: string | null;
  createdAt: string;
}

export default function AdminMcpPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<ToolRow[]>([]);
  const [selected, setSelected] = useState<ToolRow | null>(null);
  const [calls, setCalls] = useState<CallDetail[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    fetch('/api/admin/mcp')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setRows(d.data);
      });
  }, [user]);

  useEffect(() => {
    if (!selected) {
      setCalls([]);
      return;
    }
    setCallsLoading(true);
    fetch(`/api/admin/mcp/${encodeURIComponent(selected.toolName)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setCalls(d.data);
      })
      .finally(() => setCallsLoading(false));
  }, [selected]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-6 w-6 animate-spin text-portal-accent" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-portal-text flex items-center gap-2">
              <Shield className="h-5 w-5 text-portal-accent" />
              MCP audit
            </h1>
            <p className="text-sm text-portal-muted mt-1">
              Per-tool trust score, call history, and recent errors. Inputs and results are
              scrubbed for known secret patterns before being stored.
            </p>
          </header>

          <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 border-b border-portal-border text-[10px] uppercase tracking-wider text-portal-muted">
              <div>Tool</div>
              <div className="text-right">Trust</div>
              <div className="text-right">Calls (7d)</div>
              <div className="text-right">Avg</div>
              <div className="text-right">Last call</div>
            </div>
            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-portal-muted">
                No MCP tools registered.
              </div>
            )}
            {rows.map((r) => (
              <button
                key={r.toolName}
                onClick={() => setSelected(r)}
                className={cn(
                  'w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center border-b border-portal-border/50 last:border-0 text-left hover:bg-portal-card-hover transition-colors',
                  !r.registered && 'opacity-60'
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 text-portal-accent shrink-0" />
                    <span className="font-mono text-sm text-portal-text truncate">{r.toolName}</span>
                    {r.adminOnly && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        admin
                      </span>
                    )}
                    {!r.registered && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        retired
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-portal-muted truncate mt-0.5">
                    {r.description}
                  </div>
                  {r.lastError && (
                    <div className="text-[11px] text-red-400 mt-1 flex items-start gap-1 truncate">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span className="truncate">{r.lastError}</span>
                    </div>
                  )}
                </div>
                <TrustBadge score={r.trustScore} hasData={r.totalCalls > 0} />
                <div className="text-right text-xs text-portal-muted tabular-nums">
                  {r.totalCalls7d}
                  <div className="text-[10px] text-portal-muted/70">
                    {Math.round(r.successRate7d * 100)}% ok
                  </div>
                </div>
                <div className="text-right text-xs text-portal-muted tabular-nums">
                  {r.avgDurationMs ? `${r.avgDurationMs}ms` : '—'}
                  {r.p95DurationMs ? (
                    <div className="text-[10px] text-portal-muted/70">p95 {r.p95DurationMs}ms</div>
                  ) : null}
                </div>
                <div className="text-right text-xs text-portal-muted">
                  {r.lastCalledAt ? formatRelativeTime(r.lastCalledAt) : 'never'}
                  <ChevronRight className="h-3.5 w-3.5 text-portal-muted inline ml-1" />
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 text-[11px] text-portal-muted">
            Trust score = successRate(7d) × volumeConfidence(min 20 calls) − errorPenalty(24h) − noveltyDock.
          </div>
        </div>
      </main>

      {selected && (
        <ToolDetailDrawer tool={selected} calls={calls} loading={callsLoading} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function TrustBadge({ score, hasData }: { score: number; hasData: boolean }) {
  if (!hasData) {
    return (
      <span className="text-right text-xs text-portal-muted">
        <span className="inline-block tabular-nums w-9">—</span>
      </span>
    );
  }
  const tone =
    score >= 80
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : score >= 50
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-mono text-xs px-2 py-0.5 rounded-full border tabular-nums',
        tone
      )}
      title={`Trust ${score}/100`}
    >
      {score}
    </span>
  );
}

function ToolDetailDrawer({
  tool,
  calls,
  loading,
  onClose,
}: {
  tool: ToolRow;
  calls: CallDetail[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-portal-card border-l border-portal-border z-50 flex flex-col animate-slide-up">
        <header className="flex items-center justify-between p-4 border-b border-portal-border shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-portal-muted">MCP tool</div>
            <div className="font-mono text-sm text-portal-text truncate">{tool.toolName}</div>
          </div>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-4 border-b border-portal-border">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Stat label="Trust" value={`${tool.trustScore} / 100`} />
            <Stat label="Total calls" value={tool.totalCalls.toString()} />
            <Stat label="Last 7 days" value={`${tool.totalCalls7d} (${Math.round(tool.successRate7d * 100)}% ok)`} />
            <Stat label="Errors (24h)" value={tool.errors24h.toString()} />
            <Stat label="Avg duration" value={tool.avgDurationMs ? `${tool.avgDurationMs}ms` : '—'} />
            <Stat label="p95 duration" value={tool.p95DurationMs ? `${tool.p95DurationMs}ms` : '—'} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-[10px] uppercase tracking-wider text-portal-muted mb-2">
            Recent calls
          </div>
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-portal-muted" />
            </div>
          )}
          {!loading && calls.length === 0 && (
            <div className="text-xs text-portal-muted py-4 text-center">No calls yet</div>
          )}
          <div className="space-y-2">
            {calls.map((c) => (
              <CallRow key={c.id} call={c} />
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-portal-muted">{label}</div>
      <div className="text-sm text-portal-text font-mono tabular-nums">{value}</div>
    </div>
  );
}

function CallRow({ call }: { call: CallDetail }) {
  const [open, setOpen] = useState(false);
  const Icon = call.success ? CheckCircle2 : XCircle;
  const tone = call.success ? 'text-emerald-400' : 'text-red-400';
  const KindIcon = call.callerKind === 'scheduler' ? Bot : UserIcon;
  return (
    <div className="border border-portal-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-portal-card-hover transition-colors"
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', tone)} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-portal-text flex items-center gap-1.5">
            <span>{formatRelativeTime(call.createdAt)}</span>
            <span className="text-portal-muted">·</span>
            <span className="font-mono tabular-nums">{call.durationMs}ms</span>
            <KindIcon className="h-3 w-3 text-portal-muted ml-auto" />
          </div>
          {call.error && (
            <div className="text-[11px] text-red-400 mt-0.5 truncate">{call.error}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-[11px] font-mono">
          {call.inputJson && (
            <div>
              <div className="text-portal-muted mb-1">input:</div>
              <pre className="bg-portal-bg border border-portal-border rounded p-2 text-portal-text whitespace-pre-wrap break-all">
                {call.inputJson}
              </pre>
            </div>
          )}
          {call.resultPreview && (
            <div>
              <div className="text-portal-muted mb-1">result preview:</div>
              <pre className="bg-portal-bg border border-portal-border rounded p-2 text-portal-text whitespace-pre-wrap break-all">
                {call.resultPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
