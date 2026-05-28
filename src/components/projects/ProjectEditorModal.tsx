'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Trash2, X, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Draft {
  slug: string;
  name: string;
  description: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  workingBranch: string;
  clonePath: string;
  allowWrite: boolean;
  status: string;
  icon: string;
  color: string;
  sortOrder: number;
}

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

const STATUSES = ['active', 'paused', 'completed', 'archived'];

export function ProjectEditorModal({
  projectId,
  csrfToken,
  onClose,
  onSaved,
}: {
  /** undefined = create mode */
  projectId?: string;
  csrfToken?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!projectId;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csrfHeaders: Record<string, string> = csrfToken ? { 'x-csrf-token': csrfToken } : {};

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/admin/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          const p = d.data;
          setDraft({
            slug: p.slug ?? '',
            name: p.name ?? '',
            description: p.description ?? '',
            repoUrl: p.repoUrl ?? '',
            repoOwner: p.repoOwner ?? '',
            repoName: p.repoName ?? '',
            workingBranch: p.workingBranch ?? 'main',
            clonePath: p.clonePath ?? '',
            allowWrite: !!p.allowWrite,
            status: p.status ?? 'active',
            icon: p.icon ?? '',
            color: p.color ?? '',
            sortOrder: p.sortOrder ?? 0,
          });
        } else {
          setError(d.error || 'Failed to load project');
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: draft.name,
        description: draft.description.trim() || null,
        repoUrl: draft.repoUrl.trim() || null,
        repoOwner: draft.repoOwner.trim() || null,
        repoName: draft.repoName.trim() || null,
        workingBranch: draft.workingBranch || 'main',
        clonePath: draft.clonePath.trim() || null,
        allowWrite: draft.allowWrite,
        status: draft.status,
        icon: draft.icon.trim() || null,
        color: draft.color.trim() || null,
        sortOrder: draft.sortOrder,
      };
      if (!isEdit) body.slug = draft.slug;

      const res = isEdit
        ? await fetch(`/api/admin/projects/${projectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...csrfHeaders },
            body: JSON.stringify(body),
          })
        : await fetch('/api/admin/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...csrfHeaders },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Save failed (${res.status})`);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!projectId) return;
    if (!confirm(`Delete "${draft.name || draft.slug}"? This removes its tasks and sessions. Cannot be undone.`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/projects/${projectId}`, {
      method: 'DELETE',
      headers: csrfHeaders,
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok || !data.ok) {
      setError(data.error || 'Delete failed');
      return;
    }
    onSaved();
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={isEdit ? 'Edit project' : 'New project'}
        className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      >
        <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg my-8 shadow-2xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-portal-border">
            <h2 className="text-sm font-semibold text-portal-text">
              {isEdit ? 'Edit project' : 'New project'}
            </h2>
            <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-portal-muted" />
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className={inputCls}
                    placeholder="My Project"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                    className={inputCls}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {!isEdit && (
                <div>
                  <Label>Slug</Label>
                  <input
                    value={draft.slug}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    className={cn(inputCls, 'font-mono')}
                    placeholder="my-project"
                  />
                  <Hint>Lowercase, numbers, hyphens. Permanent — can&apos;t be changed later.</Hint>
                </div>
              )}

              <div>
                <Label>Description</Label>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                  className={cn(inputCls, 'resize-y')}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Repo URL</Label>
                  <input
                    value={draft.repoUrl}
                    onChange={(e) => setDraft({ ...draft, repoUrl: e.target.value })}
                    className={cn(inputCls, 'font-mono text-xs')}
                    placeholder="https://github.com/owner/repo"
                  />
                </div>
                <div>
                  <Label>Repo owner</Label>
                  <input
                    value={draft.repoOwner}
                    onChange={(e) => setDraft({ ...draft, repoOwner: e.target.value })}
                    className={cn(inputCls, 'font-mono text-xs')}
                  />
                </div>
                <div>
                  <Label>Repo name</Label>
                  <input
                    value={draft.repoName}
                    onChange={(e) => setDraft({ ...draft, repoName: e.target.value })}
                    className={cn(inputCls, 'font-mono text-xs')}
                  />
                </div>
                <div>
                  <Label>Working branch</Label>
                  <input
                    value={draft.workingBranch}
                    onChange={(e) => setDraft({ ...draft, workingBranch: e.target.value })}
                    className={cn(inputCls, 'font-mono text-xs')}
                  />
                </div>
                <div>
                  <Label>Clone path</Label>
                  <input
                    value={draft.clonePath}
                    onChange={(e) => setDraft({ ...draft, clonePath: e.target.value })}
                    className={cn(inputCls, 'font-mono text-xs')}
                    placeholder="(optional)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Icon</Label>
                  <input
                    value={draft.icon}
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                    className={inputCls}
                    placeholder="📁"
                  />
                </div>
                <div>
                  <Label>Accent color</Label>
                  <input
                    value={draft.color}
                    onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    className={inputCls}
                    placeholder="#6366f1"
                  />
                </div>
                <div>
                  <Label>Sort order</Label>
                  <input
                    type="number"
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
                    className={inputCls}
                  />
                </div>
              </div>

              <button
                onClick={() => setDraft({ ...draft, allowWrite: !draft.allowWrite })}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm w-full transition-colors',
                  draft.allowWrite
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-portal-border text-portal-muted hover:text-portal-text'
                )}
              >
                {draft.allowWrite ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span className="flex-1 text-left">
                  Worker write access {draft.allowWrite ? 'enabled' : 'disabled'}
                </span>
                <span className="text-[11px]">
                  {draft.allowWrite ? 'can push / open PRs' : 'read-only'}
                </span>
              </button>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {isEdit ? (
                  <button
                    onClick={remove}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button onClick={onClose} className="px-3 py-2 text-sm text-portal-text hover:bg-portal-card-hover rounded-lg">
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving || !draft.name.trim() || (!isEdit && !draft.slug.trim())}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const inputCls =
  'w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/40';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-portal-muted mb-1">{children}</label>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-portal-muted mt-1">{children}</p>;
}
