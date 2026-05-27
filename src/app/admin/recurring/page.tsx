'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  Clock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  Power,
  PowerOff,
  AlertTriangle,
  CheckCircle2,
  Webhook,
  Wrench,
  ListChecks,
} from 'lucide-react';

type Kind = 'mcp' | 'webhook' | 'task';

interface RecurringDTO {
  id: string;
  title: string;
  description: string | null;
  naturalText: string;
  cronExpr: string;
  humanReadable: string;
  kind: Kind;
  payload: unknown;
  enabled: boolean;
  lastSpawnedAt: string | null;
  nextRunAt: string | null;
  spawnCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PreviewData {
  cronExpr: string;
  humanReadable: string;
  upcoming: string[];
}

interface Draft {
  title: string;
  description: string;
  naturalText: string;
  kind: Kind;
  payloadJson: string;
  enabled: boolean;
}

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  naturalText: '',
  kind: 'webhook',
  payloadJson: '{\n  "url": "https://example.com/hook"\n}',
  enabled: true,
};

const PAYLOAD_TEMPLATES: Record<Kind, string> = {
  mcp: '{\n  "toolName": "create_portal_tile",\n  "input": {\n    "name": "Example",\n    "url": "https://example.com"\n  }\n}',
  webhook: '{\n  "url": "https://example.com/hook",\n  "method": "POST",\n  "body": { "event": "scheduled" }\n}',
  task: '{\n  "projectId": "PROJECT_ID_HERE",\n  "title": "Daily sweep",\n  "description": "Run the morning routine",\n  "priority": "normal"\n}',
};

export default function AdminRecurringPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<RecurringDTO[]>([]);
  const [editing, setEditing] = useState<RecurringDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  async function refresh() {
    const res = await fetch('/api/admin/recurring');
    const data = await res.json();
    if (data.ok) setItems(data.data);
  }

  useEffect(() => {
    if (user && user.role === 'admin') refresh();
  }, [user]);

  // Live preview of the parsed schedule whenever naturalText changes.
  useEffect(() => {
    if (!draft.naturalText.trim()) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/recurring/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ naturalText: draft.naturalText }),
          signal: ctl.signal,
        });
        const data = await res.json();
        if (data.ok) {
          setPreview(data.data);
          setPreviewError(null);
        } else {
          setPreview(null);
          setPreviewError(data.hint || data.error || 'Could not parse schedule');
        }
      } catch {
        /* aborted */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [draft.naturalText]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setPreview(null);
    setPreviewError(null);
  }

  function startEdit(item: RecurringDTO) {
    setCreating(false);
    setEditing(item);
    setDraft({
      title: item.title,
      description: item.description ?? '',
      naturalText: item.naturalText,
      kind: item.kind,
      payloadJson:
        typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload, null, 2),
      enabled: item.enabled,
    });
    setError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setPreview(null);
    setPreviewError(null);
  }

  function changeKind(kind: Kind) {
    setDraft((d) => ({
      ...d,
      kind,
      payloadJson: PAYLOAD_TEMPLATES[kind],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(draft.payloadJson);
      } catch {
        setError('Payload is not valid JSON');
        return;
      }
      const body = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        naturalText: draft.naturalText.trim(),
        kind: draft.kind,
        payload,
        enabled: draft.enabled,
      };
      const res = editing
        ? await fetch(`/api/admin/recurring/${editing.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(body),
          })
        : await fetch('/api/admin/recurring', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      await refresh();
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: RecurringDTO) {
    await fetch(`/api/admin/recurring/${item.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    refresh();
  }

  async function remove(item: RecurringDTO) {
    if (!confirm(`Delete "${item.title}"? Cannot be undone.`)) return;
    await fetch(`/api/admin/recurring/${item.id}`, {
      method: 'DELETE',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
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

  const showForm = creating || editing;

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-portal-text flex items-center gap-2">
                <Clock className="h-5 w-5 text-portal-accent" />
                Recurring tasks
              </h1>
              <p className="text-sm text-portal-muted mt-1">
                Schedule MCP tools, webhooks, or worker tasks with plain-English timing.
              </p>
            </div>
            {!showForm && (
              <button
                onClick={startCreate}
                className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                New schedule
              </button>
            )}
          </header>

          {showForm && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-portal-text">
                  {editing ? 'Edit schedule' : 'New schedule'}
                </h2>
                <button
                  onClick={closeForm}
                  className="p-1 text-portal-muted hover:text-portal-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <Field label="Title">
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Morning briefing"
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text"
                  />
                </Field>

                <Field
                  label="Schedule"
                  hint='e.g. "every weekday at 9am", "every 30 minutes", "daily at 7am", or a raw 5-field cron'
                >
                  <input
                    type="text"
                    value={draft.naturalText}
                    onChange={(e) => setDraft({ ...draft, naturalText: e.target.value })}
                    placeholder="every weekday at 9am"
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text font-mono"
                  />
                  {preview && (
                    <div className="mt-2 text-xs flex items-start gap-2 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <div>
                          <span className="font-medium">{preview.humanReadable}</span>{' '}
                          <span className="text-portal-muted font-mono">({preview.cronExpr})</span>
                        </div>
                        {preview.upcoming.length > 0 && (
                          <div className="text-portal-muted mt-0.5">
                            Next:{' '}
                            {preview.upcoming
                              .map((d) => new Date(d).toLocaleString())
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {previewError && (
                    <div className="mt-2 text-xs flex items-start gap-2 text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{previewError}</span>
                    </div>
                  )}
                </Field>

                <Field label="What to run">
                  <div className="grid grid-cols-3 gap-2">
                    <KindButton
                      active={draft.kind === 'mcp'}
                      onClick={() => changeKind('mcp')}
                      icon={<Wrench className="h-4 w-4" />}
                      label="MCP tool"
                    />
                    <KindButton
                      active={draft.kind === 'webhook'}
                      onClick={() => changeKind('webhook')}
                      icon={<Webhook className="h-4 w-4" />}
                      label="Webhook"
                    />
                    <KindButton
                      active={draft.kind === 'task'}
                      onClick={() => changeKind('task')}
                      icon={<ListChecks className="h-4 w-4" />}
                      label="Agent task"
                    />
                  </div>
                </Field>

                <Field
                  label="Payload (JSON)"
                  hint={
                    draft.kind === 'mcp'
                      ? 'Shape: { toolName, input }'
                      : draft.kind === 'webhook'
                      ? 'Shape: { url, method?, headers?, body? }'
                      : 'Shape: { projectId, title, description, priority?, agentProfileId? }'
                  }
                >
                  <textarea
                    value={draft.payloadJson}
                    onChange={(e) => setDraft({ ...draft, payloadJson: e.target.value })}
                    rows={8}
                    spellCheck={false}
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-xs text-portal-text font-mono"
                  />
                </Field>

                <label className="flex items-center gap-2 text-sm text-portal-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  />
                  Enabled
                </label>

                {error && (
                  <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={closeForm}
                    className="px-3 py-2 text-sm text-portal-text hover:bg-portal-card-hover rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !draft.title.trim() || !preview}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {items.length === 0 && !showForm && (
              <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center text-sm text-portal-muted">
                No recurring schedules yet.
              </div>
            )}
            {items.map((item) => (
              <RecurringRow
                key={item.id}
                item={item}
                onEdit={() => startEdit(item)}
                onToggle={() => toggle(item)}
                onDelete={() => remove(item)}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-portal-muted uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {hint && <div className="text-[11px] text-portal-muted mt-1">{hint}</div>}
    </div>
  );
}

function KindButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
        active
          ? 'border-portal-accent bg-portal-accent/10 text-portal-accent'
          : 'border-portal-border text-portal-muted hover:text-portal-text hover:border-portal-accent/30'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function RecurringRow({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: RecurringDTO;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const KindIcon =
    item.kind === 'mcp' ? Wrench : item.kind === 'webhook' ? Webhook : ListChecks;
  return (
    <div
      className={cn(
        'bg-portal-card border border-portal-border rounded-xl p-4 flex items-start gap-3',
        !item.enabled && 'opacity-60'
      )}
    >
      <KindIcon className="h-4 w-4 text-portal-accent mt-1 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-portal-text">{item.title}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-portal-bg border border-portal-border text-portal-muted">
            {item.kind}
          </span>
        </div>
        {item.description && (
          <div className="text-xs text-portal-muted mt-0.5">{item.description}</div>
        )}
        <div className="text-xs text-portal-muted mt-1">
          {item.humanReadable}{' '}
          <span className="font-mono text-portal-muted/70">({item.cronExpr})</span>
        </div>
        <div className="text-[11px] text-portal-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {item.nextRunAt && (
            <span>Next: {new Date(item.nextRunAt).toLocaleString()}</span>
          )}
          {item.lastSpawnedAt && (
            <span>Last: {formatRelativeTime(item.lastSpawnedAt)}</span>
          )}
          <span>Runs: {item.spawnCount}</span>
        </div>
        {item.lastError && (
          <div className="text-[11px] text-red-400 mt-1 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="truncate">{item.lastError}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 text-portal-muted hover:text-portal-text rounded-md"
          title={item.enabled ? 'Disable' : 'Enable'}
        >
          {item.enabled ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
        </button>
        <button
          onClick={onEdit}
          className="p-1.5 text-portal-muted hover:text-portal-text rounded-md"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-portal-muted hover:text-red-400 rounded-md"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
