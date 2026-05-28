'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { MemoryFilesPanel } from '@/components/MemoryFilesPanel';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  BrainCircuit,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  Pencil,
} from 'lucide-react';

interface MemoryEntry {
  id: string;
  key: string;
  type: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

const TYPES = ['user', 'project', 'feedback', 'reference', 'general'];
const TYPE_TONE: Record<string, string> = {
  user: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  project: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  feedback: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  reference: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  general: 'bg-portal-bg text-portal-muted border-portal-border',
};

interface Draft {
  key: string;
  type: string;
  value: string;
}

const EMPTY: Draft = { key: '', type: 'general', value: '' };

export default function MemoryPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<'files' | 'facts'>('files');
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;
  const csrfHeaders: Record<string, string> = csrfToken ? { 'x-csrf-token': csrfToken } : {};

  async function refresh() {
    setListLoading(true);
    try {
      const res = await fetch('/api/ai/memory');
      const data = await res.json();
      if (data.ok) setEntries(data.data);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDraft(EMPTY);
    setError(null);
  }

  function startEdit(e: MemoryEntry) {
    setEditingId(e.id);
    setCreating(false);
    setDraft({ key: e.key, type: e.type, value: e.value });
    setError(null);
  }

  function cancel() {
    setEditingId(null);
    setCreating(false);
    setDraft(EMPTY);
    setError(null);
  }

  async function save() {
    if (!draft.key.trim()) {
      setError('Key is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Save failed');
        return;
      }
      await refresh();
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function remove(e: MemoryEntry) {
    if (!confirm(`Delete memory "${e.key}"?`)) return;
    const res = await fetch(`/api/ai/memory?id=${encodeURIComponent(e.id)}`, {
      method: 'DELETE',
      headers: csrfHeaders,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Delete failed');
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
        <div className="max-w-3xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-portal-text flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-portal-accent" />
                AI memory
              </h1>
              <p className="text-sm text-portal-muted mt-1">
                Standing context for the assistant. <strong>Files</strong> are the
                editable Markdown identity (portal + per-project) injected into chat.
                <strong> Facts</strong> are quick key/value notes the AI can read & write.
              </p>
            </div>
            {tab === 'facts' && !creating && !editingId && (
              <button
                onClick={startCreate}
                className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Add fact
              </button>
            )}
          </header>

          <div className="flex gap-1 mb-5 border-b border-portal-border">
            {(['files', 'facts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-2 text-sm capitalize border-b-2 -mb-px transition-colors',
                  tab === t
                    ? 'border-portal-accent text-portal-text'
                    : 'border-transparent text-portal-muted hover:text-portal-text'
                )}
              >
                {t === 'files' ? 'Memory files' : 'Facts (key/value)'}
              </button>
            ))}
          </div>

          {tab === 'files' && <MemoryFilesPanel csrfToken={(user as { csrfToken?: string }).csrfToken} />}

          {tab === 'facts' && (
          <>
          {/* facts: create/edit + list */}

          {(creating || editingId) && (
            <div className="bg-portal-card border border-portal-border rounded-xl p-4 mb-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-portal-text">
                  {creating ? 'New memory' : 'Edit memory'}
                </h2>
                <button onClick={cancel} className="p-1 text-portal-muted hover:text-portal-text">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] uppercase tracking-wider text-portal-muted mb-1">Key</label>
                  <input
                    value={draft.key}
                    onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                    disabled={!!editingId}
                    placeholder="e.g. preferred_tone"
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-portal-muted mb-1">Type</label>
                  <select
                    value={draft.type}
                    onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-portal-muted mb-1">Value</label>
                <textarea
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  rows={4}
                  placeholder="Free-form text the assistant should remember…"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text resize-y"
                />
              </div>
              {error && <div className="text-xs text-red-400">{error}</div>}
              <div className="flex justify-end gap-2">
                <button onClick={cancel} className="px-3 py-2 text-sm text-portal-text hover:bg-portal-card-hover rounded-lg">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {listLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-portal-muted" />
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center text-sm text-portal-muted">
              No memories yet. The assistant will add some as you chat, or you can add your own.
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div key={e.id} className="bg-portal-card border border-portal-border rounded-xl p-4 group">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-portal-text">{e.key}</span>
                        <span className={cn('text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border', TYPE_TONE[e.type] ?? TYPE_TONE.general)}>
                          {e.type}
                        </span>
                      </div>
                      <p className="text-sm text-portal-muted mt-1 whitespace-pre-wrap">{e.value}</p>
                      <div className="text-[10px] text-portal-muted/70 mt-1">
                        updated {formatRelativeTime(e.updatedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(e)} className="p-1.5 text-portal-muted hover:text-portal-text rounded-md" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(e)} className="p-1.5 text-portal-muted hover:text-red-400 rounded-md" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>
      </main>
    </div>
  );
}
