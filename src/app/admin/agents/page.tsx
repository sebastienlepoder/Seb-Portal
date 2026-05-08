'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn } from '@/lib/utils';
import { Bot, FolderGit2, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import type { AgentProfileDTO } from '@/types/agents';

type AgentDraft = Omit<AgentProfileDTO, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY: AgentDraft = {
  slug: '',
  name: '',
  role: '',
  expertise: [],
  description: '',
  systemPrompt: '',
  model: '',
  isActive: true,
  sortOrder: 0,
};

export default function AdminAgentsPage() {
  const { user, loading } = useAuth();
  const [agents, setAgents] = useState<AgentProfileDTO[]>([]);
  const [editing, setEditing] = useState<AgentProfileDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AgentDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  async function refresh() {
    const res = await fetch('/api/admin/agents');
    const data = await res.json();
    if (data.ok) setAgents(data.data);
  }

  useEffect(() => {
    if (user && user.role === 'admin') refresh();
  }, [user]);

  function startEdit(a: AgentProfileDTO) {
    setEditing(a);
    setDraft({
      slug: a.slug,
      name: a.name,
      role: a.role,
      expertise: a.expertise,
      description: a.description ?? '',
      systemPrompt: a.systemPrompt,
      model: a.model ?? '',
      isActive: a.isActive,
      sortOrder: a.sortOrder,
    });
    setError(null);
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setDraft(EMPTY);
    setError(null);
  }

  function closeForm() {
    setEditing(null);
    setCreating(false);
    setDraft(EMPTY);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...draft,
        description: draft.description?.trim() || null,
        model: draft.model?.trim() || null,
      };
      const res = editing
        ? await fetch(`/api/admin/agents/${editing.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(body),
          })
        : await fetch('/api/admin/agents', {
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

  async function remove(id: string) {
    if (!confirm('Delete this agent? Cannot be undone.')) return;
    const res = await fetch(`/api/admin/agents/${id}`, {
      method: 'DELETE',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
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

  const showForm = creating || editing;

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap pl-12 sm:pl-0">
            <div>
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <Bot className="h-6 w-6 text-portal-accent" />
                Agents
              </h1>
              <p className="text-sm text-portal-muted">Configure AI agent profiles for task dispatch</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/projects"
                className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/50 text-portal-text rounded-lg text-sm"
              >
                <FolderGit2 className="h-4 w-4" />
                Projects
              </Link>
              <button
                onClick={startCreate}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg text-sm"
              >
                <Plus className="h-4 w-4" />
                New agent
              </button>
            </div>
          </div>

          <div className="bg-portal-card border border-portal-border rounded-xl divide-y divide-portal-border">
            {agents.length === 0 ? (
              <div className="p-6 text-sm text-portal-muted">
                No agents configured. Run <code>npm run db:seed:agents</code> for defaults, or click <strong>New agent</strong>.
              </div>
            ) : (
              agents.map((a) => (
                <div key={a.id} className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-portal-text">{a.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-portal-accent">
                        {a.role}
                      </span>
                      <code className="text-[11px] text-portal-muted">{a.slug}</code>
                      {!a.isActive && (
                        <span className="text-[10px] bg-zinc-500/10 text-zinc-400 border border-zinc-500/30 rounded px-1.5 py-0.5">
                          disabled
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-xs text-portal-muted mt-1">{a.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.expertise.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-portal-bg border border-portal-border text-portal-muted rounded px-1.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(a)}
                      className="p-1.5 text-portal-muted hover:text-portal-text rounded-md hover:bg-portal-card-hover"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      className="p-1.5 text-portal-muted hover:text-red-300 rounded-md hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto"
          onClick={closeForm}
        >
          <div
            className="bg-portal-card border border-portal-border rounded-xl shadow-xl w-full max-w-2xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-portal-border">
              <h2 className="text-sm font-semibold text-portal-text">
                {editing ? `Edit ${editing.name}` : 'New agent'}
              </h2>
              <button
                onClick={closeForm}
                className="p-1 text-portal-muted hover:text-portal-text rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <Row>
                <Field label="Slug">
                  <input
                    value={draft.slug}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    disabled={!!editing}
                    placeholder="layout-specialist"
                    className={cn(input, editing && 'opacity-60')}
                  />
                </Field>
                <Field label="Sort order">
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) =>
                      setDraft({ ...draft, sortOrder: parseInt(e.target.value, 10) || 0 })
                    }
                    className={input}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Name">
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Layla"
                    className={input}
                  />
                </Field>
                <Field label="Role">
                  <input
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    placeholder="Layout Specialist"
                    className={input}
                  />
                </Field>
              </Row>
              <Field label="Expertise tags (comma-separated)">
                <input
                  value={draft.expertise.join(', ')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      expertise: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="frontend, css, tailwind"
                  className={input}
                />
              </Field>
              <Field label="Description">
                <input
                  value={draft.description ?? ''}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="System prompt (sent to Claude before each task)">
                <textarea
                  value={draft.systemPrompt}
                  onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                  rows={10}
                  className={cn(input, 'font-mono resize-y text-[12px]')}
                />
              </Field>
              <Row>
                <Field label="Model override (optional)">
                  <input
                    value={draft.model ?? ''}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                    placeholder="claude-opus-4-7"
                    className={input}
                  />
                </Field>
                <Field label="Active">
                  <label className="flex items-center gap-2 px-3 py-2 bg-portal-bg border border-portal-border rounded-md text-sm text-portal-text">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    />
                    Available for dispatch
                  </label>
                </Field>
              </Row>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={closeForm}
                  className="px-3 py-2 text-sm text-portal-muted hover:text-portal-text"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving || !draft.slug || !draft.name || !draft.role || !draft.systemPrompt}
                  className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 disabled:opacity-50 text-white rounded-md text-sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const input =
  'w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1">
      <span className="text-xs font-medium text-portal-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2">{children}</div>;
}
