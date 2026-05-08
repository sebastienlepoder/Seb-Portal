'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn } from '@/lib/utils';
import { Bot, FolderGit2, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  repoOwner: string | null;
  repoName: string | null;
  workingBranch: string;
  clonePath: string | null;
  allowWrite: boolean;
  status: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
}

type Draft = Omit<Project, 'id'>;

const EMPTY: Draft = {
  slug: '',
  name: '',
  description: '',
  repoUrl: '',
  repoOwner: '',
  repoName: '',
  workingBranch: 'main',
  clonePath: '',
  allowWrite: false,
  status: 'active',
  icon: '',
  color: '',
  sortOrder: 0,
};

export default function AdminProjectsPage() {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  async function refresh() {
    const res = await fetch('/api/admin/projects');
    const data = await res.json();
    if (data.ok) setProjects(data.data);
  }

  useEffect(() => {
    if (user && user.role === 'admin') refresh();
  }, [user]);

  function startEdit(p: Project) {
    setEditing(p);
    setDraft({
      slug: p.slug,
      name: p.name,
      description: p.description ?? '',
      repoUrl: p.repoUrl ?? '',
      repoOwner: p.repoOwner ?? '',
      repoName: p.repoName ?? '',
      workingBranch: p.workingBranch,
      clonePath: p.clonePath ?? '',
      allowWrite: p.allowWrite,
      status: p.status,
      icon: p.icon ?? '',
      color: p.color ?? '',
      sortOrder: p.sortOrder,
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
      const body: Record<string, unknown> = {
        name: draft.name,
        description: draft.description?.trim() || null,
        repoUrl: draft.repoUrl?.trim() || null,
        repoOwner: draft.repoOwner?.trim() || null,
        repoName: draft.repoName?.trim() || null,
        workingBranch: draft.workingBranch || 'main',
        clonePath: draft.clonePath?.trim() || null,
        allowWrite: draft.allowWrite,
        status: draft.status,
        icon: draft.icon?.trim() || null,
        color: draft.color?.trim() || null,
        sortOrder: draft.sortOrder,
      };
      if (!editing) body.slug = draft.slug;

      const res = editing
        ? await fetch(`/api/admin/projects/${editing.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            },
            body: JSON.stringify(body),
          })
        : await fetch('/api/admin/projects', {
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
    if (!confirm('Delete this project? Cannot be undone.')) return;
    const res = await fetch(`/api/admin/projects/${id}`, {
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
                <FolderGit2 className="h-6 w-6 text-portal-accent" />
                Projects
              </h1>
              <p className="text-sm text-portal-muted">Repos available to the agent worker</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/admin/agents"
                className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/50 text-portal-text rounded-lg text-sm"
              >
                <Bot className="h-4 w-4" />
                Agents
              </Link>
              <button
                onClick={startCreate}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg text-sm"
              >
                <Plus className="h-4 w-4" />
                New project
              </button>
            </div>
          </div>

          <div className="bg-portal-card border border-portal-border rounded-xl divide-y divide-portal-border">
            {projects.length === 0 ? (
              <div className="p-6 text-sm text-portal-muted">No projects configured.</div>
            ) : (
              projects.map((p) => (
                <div key={p.id} className="p-4 flex items-start gap-3">
                  <div className="text-2xl shrink-0">{p.icon || '📦'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-portal-text">{p.name}</span>
                      <code className="text-[11px] text-portal-muted">{p.slug}</code>
                      {p.allowWrite ? (
                        <span className="text-[10px] bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 rounded px-1.5 py-0.5">
                          write enabled
                        </span>
                      ) : (
                        <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5">
                          read-only
                        </span>
                      )}
                      <span className="text-[10px] bg-portal-bg border border-portal-border text-portal-muted rounded px-1.5 py-0.5">
                        {p.status}
                      </span>
                    </div>
                    {p.repoOwner && p.repoName && (
                      <div className="text-xs text-portal-muted mt-1">
                        {p.repoOwner}/{p.repoName} · branch <code>{p.workingBranch}</code>
                      </div>
                    )}
                    {p.description && (
                      <p className="text-xs text-portal-muted mt-1">{p.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(p)}
                      className="p-1.5 text-portal-muted hover:text-portal-text rounded-md hover:bg-portal-card-hover"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className="p-1.5 text-portal-muted hover:text-red-300 rounded-md hover:bg-red-500/10"
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
                {editing ? `Edit ${editing.name}` : 'New project'}
              </h2>
              <button onClick={closeForm} className="p-1 text-portal-muted hover:text-portal-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <Field label="Slug">
                  <input
                    value={draft.slug}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    disabled={!!editing}
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
              </div>
              <Field label="Name">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
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
              <Field label="Repository URL">
                <input
                  value={draft.repoUrl ?? ''}
                  onChange={(e) => setDraft({ ...draft, repoUrl: e.target.value })}
                  placeholder="https://github.com/owner/repo"
                  className={input}
                />
              </Field>
              <div className="flex gap-2">
                <Field label="Owner">
                  <input
                    value={draft.repoOwner ?? ''}
                    onChange={(e) => setDraft({ ...draft, repoOwner: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="Repo name">
                  <input
                    value={draft.repoName ?? ''}
                    onChange={(e) => setDraft({ ...draft, repoName: e.target.value })}
                    className={input}
                  />
                </Field>
              </div>
              <div className="flex gap-2">
                <Field label="Working branch">
                  <input
                    value={draft.workingBranch}
                    onChange={(e) => setDraft({ ...draft, workingBranch: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    className={input}
                  >
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                    <option value="archived">archived</option>
                  </select>
                </Field>
              </div>
              <Field label="Clone path on worker (optional)">
                <input
                  value={draft.clonePath ?? ''}
                  onChange={(e) => setDraft({ ...draft, clonePath: e.target.value })}
                  placeholder="(leave empty for fresh clone per task)"
                  className={input}
                />
              </Field>
              <div className="flex gap-2">
                <Field label="Icon (emoji)">
                  <input
                    value={draft.icon ?? ''}
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="Accent color">
                  <input
                    value={draft.color ?? ''}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    placeholder="#7c3aed"
                    className={input}
                  />
                </Field>
              </div>
              <Field label="Allow worker to commit/push">
                <label className="flex items-center gap-2 px-3 py-2 bg-portal-bg border border-portal-border rounded-md text-sm text-portal-text">
                  <input
                    type="checkbox"
                    checked={draft.allowWrite}
                    onChange={(e) => setDraft({ ...draft, allowWrite: e.target.checked })}
                  />
                  When off, the worker only generates a summary — no commits, no PRs.
                </label>
              </Field>

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
                  disabled={saving || !draft.name || (!editing && !draft.slug)}
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
