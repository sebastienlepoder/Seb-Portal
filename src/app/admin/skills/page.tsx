'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  Sparkles,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronRight,
  X,
  HelpCircle,
} from 'lucide-react';

type Severity = 'info' | 'warning' | 'critical';

interface ScanMatch {
  rule: string;
  severity: Severity;
  description?: string;
  snippet: string;
  source: 'raw' | 'normalized' | 'decoded';
}

interface ScanReport {
  status: 'clean' | 'warning' | 'rejected';
  matches: ScanMatch[];
}

interface SkillDTO {
  id: string;
  source: string;
  name: string;
  filePath: string;
  description: string | null;
  contentHash: string;
  securityStatus: 'clean' | 'warning' | 'rejected' | 'unchecked';
  securityReport: ScanReport | null;
  enabled: boolean;
  lastScannedAt: string | null;
  installedAt: string;
  updatedAt: string;
}

export default function AdminSkillsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<SkillDTO[]>([]);
  const [selected, setSelected] = useState<SkillDTO | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  async function refresh() {
    const res = await fetch('/api/admin/skills');
    const data = await res.json();
    if (data.ok) setItems(data.data);
  }

  useEffect(() => {
    if (user && user.role === 'admin') refresh();
  }, [user]);

  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Sync failed (${res.status})`);
        return;
      }
      const r = data.data;
      setSyncResult(
        `${r.scanned} scanned · ${r.added} added · ${r.updated} updated · ${r.removed} removed · ${r.rejected} rejected · ${r.warnings} warnings`
      );
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(skill: SkillDTO) {
    if (!skill.enabled && skill.securityStatus === 'rejected') {
      alert('Rejected skills cannot be enabled. Fix the file and re-sync.');
      return;
    }
    const res = await fetch(`/api/admin/skills/${skill.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ enabled: !skill.enabled }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Toggle failed');
      return;
    }
    refresh();
  }

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
        <div className="max-w-4xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6 gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-portal-text flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-portal-accent" />
                Skills hub
              </h1>
              <p className="text-sm text-portal-muted mt-1">
                Local Markdown skills under{' '}
                <code className="bg-portal-card border border-portal-border rounded px-1.5 py-0.5 text-xs">skills/</code>
                . Each sync re-scans changed files for prompt-injection, shell-exec, SSRF, and secret-leak patterns.
              </p>
            </div>
            <button
              onClick={sync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync from disk
            </button>
          </header>

          {syncResult && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-3 mb-4 text-xs text-portal-muted font-mono">
              {syncResult}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center">
              <HelpCircle className="h-6 w-6 text-portal-muted mx-auto mb-2" />
              <div className="text-sm text-portal-text">No skills installed yet</div>
              <div className="text-xs text-portal-muted mt-1">
                Drop a Markdown file under{' '}
                <code className="bg-portal-bg border border-portal-border rounded px-1 py-0.5">skills/</code>{' '}
                and click <strong>Sync from disk</strong>.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((s) => (
                <SkillRow
                  key={s.id}
                  skill={s}
                  onOpen={() => setSelected(s)}
                  onToggle={() => toggle(s)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {selected && (
        <SkillDrawer skill={selected} onClose={() => setSelected(null)} onToggle={() => toggle(selected)} />
      )}
    </div>
  );
}

function SkillRow({
  skill,
  onOpen,
  onToggle,
}: {
  skill: SkillDTO;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 flex items-start gap-3">
      <StatusIcon status={skill.securityStatus} />
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-portal-text">{skill.name}</span>
          <StatusBadge status={skill.securityStatus} />
          {skill.enabled && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-portal-accent/10 text-portal-accent border border-portal-accent/30">
              enabled
            </span>
          )}
        </div>
        {skill.description && (
          <div className="text-xs text-portal-muted mt-0.5 line-clamp-2">{skill.description}</div>
        )}
        <div className="text-[11px] text-portal-muted mt-1 flex flex-wrap gap-x-3 font-mono">
          <span>{skill.filePath}</span>
          <span>sha {skill.contentHash.slice(0, 7)}</span>
          {skill.lastScannedAt && <span>scanned {formatRelativeTime(skill.lastScannedAt)}</span>}
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggle}
          disabled={!skill.enabled && skill.securityStatus === 'rejected'}
          className={cn(
            'px-2 py-1 text-xs rounded-md border transition-colors',
            skill.enabled
              ? 'bg-portal-accent text-white border-portal-accent hover:bg-portal-accent-dark'
              : skill.securityStatus === 'rejected'
              ? 'border-portal-border text-portal-muted/50 cursor-not-allowed'
              : 'border-portal-border text-portal-text hover:bg-portal-card-hover'
          )}
          title={
            !skill.enabled && skill.securityStatus === 'rejected'
              ? 'Cannot enable a rejected skill'
              : skill.enabled
              ? 'Disable'
              : 'Enable'
          }
        >
          {skill.enabled ? 'Enabled' : 'Disabled'}
        </button>
        <button
          onClick={onOpen}
          className="p-1.5 text-portal-muted hover:text-portal-text rounded-md"
          aria-label="Details"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: SkillDTO['securityStatus'] }) {
  if (status === 'clean') return <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-1 shrink-0" />;
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-400 mt-1 shrink-0" />;
  if (status === 'rejected') return <XCircle className="h-4 w-4 text-red-400 mt-1 shrink-0" />;
  return <HelpCircle className="h-4 w-4 text-portal-muted mt-1 shrink-0" />;
}

function StatusBadge({ status }: { status: SkillDTO['securityStatus'] }) {
  const tone =
    status === 'clean'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : status === 'warning'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : status === 'rejected'
      ? 'bg-red-500/10 text-red-400 border-red-500/30'
      : 'bg-portal-bg text-portal-muted border-portal-border';
  return (
    <span
      className={cn(
        'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border',
        tone
      )}
    >
      {status}
    </span>
  );
}

function SkillDrawer({
  skill,
  onClose,
  onToggle,
}: {
  skill: SkillDTO;
  onClose: () => void;
  onToggle: () => void;
}) {
  const matches = skill.securityReport?.matches ?? [];
  const critical = matches.filter((m) => m.severity === 'critical');
  const warnings = matches.filter((m) => m.severity === 'warning');
  const infos = matches.filter((m) => m.severity === 'info');

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} aria-hidden />
      <aside className="fixed right-0 top-0 bottom-0 w-full sm:w-[520px] bg-portal-card border-l border-portal-border z-50 flex flex-col animate-slide-up">
        <header className="flex items-start justify-between p-4 border-b border-portal-border shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-portal-muted">skill</div>
            <div className="text-sm text-portal-text truncate">{skill.name}</div>
            <div className="text-[11px] text-portal-muted truncate font-mono mt-0.5">{skill.filePath}</div>
          </div>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text shrink-0">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center gap-2">
            <StatusBadge status={skill.securityStatus} />
            <button
              onClick={onToggle}
              disabled={!skill.enabled && skill.securityStatus === 'rejected'}
              className={cn(
                'px-2.5 py-1 text-xs rounded-md border transition-colors',
                skill.enabled
                  ? 'bg-portal-accent text-white border-portal-accent'
                  : skill.securityStatus === 'rejected'
                  ? 'border-portal-border text-portal-muted/50 cursor-not-allowed'
                  : 'border-portal-border text-portal-text hover:bg-portal-card-hover'
              )}
            >
              {skill.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>

          {skill.description && (
            <div className="text-sm text-portal-text">{skill.description}</div>
          )}

          {matches.length === 0 ? (
            <div className="text-xs text-portal-muted py-4 text-center border border-portal-border rounded-lg bg-portal-bg">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
              No security findings.
            </div>
          ) : (
            <div className="space-y-3">
              {critical.length > 0 && (
                <MatchSection title="Critical" tone="red" matches={critical} />
              )}
              {warnings.length > 0 && (
                <MatchSection title="Warnings" tone="amber" matches={warnings} />
              )}
              {infos.length > 0 && <MatchSection title="Info" tone="muted" matches={infos} />}
            </div>
          )}

          <div className="text-[11px] text-portal-muted border-t border-portal-border pt-3 space-y-1">
            <div>
              <span className="text-portal-muted/70">sha256: </span>
              <span className="font-mono">{skill.contentHash}</span>
            </div>
            <div>
              <span className="text-portal-muted/70">installed: </span>
              {new Date(skill.installedAt).toLocaleString()}
            </div>
            {skill.lastScannedAt && (
              <div>
                <span className="text-portal-muted/70">last scanned: </span>
                {new Date(skill.lastScannedAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function MatchSection({
  title,
  tone,
  matches,
}: {
  title: string;
  tone: 'red' | 'amber' | 'muted';
  matches: ScanMatch[];
}) {
  const toneClass =
    tone === 'red'
      ? 'border-red-500/30 bg-red-500/5'
      : tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-portal-border bg-portal-bg';
  const headClass =
    tone === 'red' ? 'text-red-400' : tone === 'amber' ? 'text-amber-400' : 'text-portal-muted';
  return (
    <div>
      <div className={cn('text-[10px] uppercase tracking-wider mb-1.5', headClass)}>{title}</div>
      <div className="space-y-2">
        {matches.map((m, i) => (
          <div key={`${m.rule}-${i}`} className={cn('border rounded-lg p-2.5 text-xs', toneClass)}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <code className="font-mono text-portal-text">{m.rule}</code>
              {m.source !== 'raw' && (
                <span className="text-[10px] text-portal-muted">
                  via {m.source}
                </span>
              )}
            </div>
            {m.description && (
              <div className="text-portal-muted mb-1">{m.description}</div>
            )}
            <pre className="bg-portal-card border border-portal-border rounded p-1.5 text-[11px] font-mono text-portal-text whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
              {m.snippet}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
