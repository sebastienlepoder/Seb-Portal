'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { AssistantMessage } from '@/components/ai/AssistantMessage';
import { cn } from '@/lib/utils';
import {
  Folder,
  FileText,
  ChevronRight,
  Loader2,
  Home,
  RefreshCw,
  FilePlus,
  FolderPlus,
  Save,
  Trash2,
  Pencil,
  GitBranch,
  X,
  Eye,
  Code2,
} from 'lucide-react';

interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
}

type FileContent =
  | { kind: 'text'; content: string; size: number; truncated: boolean }
  | { kind: 'image'; dataUri: string; size: number }
  | { kind: 'binary'; size: number };

interface GitStatus {
  isRepo: boolean;
  branch?: string;
  dirtyCount?: number;
}

const MD_EXT = /\.(md|markdown)$/i;

export default function FilesPage() {
  const { user, loading } = useAuth();
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [git, setGit] = useState<GitStatus>({ isRepo: false });

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<FileContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mdPreview, setMdPreview] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) window.location.href = '/dashboard';
  }, [loading, user]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;
  const csrfHeaders: Record<string, string> = csrfToken ? { 'x-csrf-token': csrfToken } : {};

  const loadDir = useCallback(async (rel: string) => {
    setListLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?mode=list&path=${encodeURIComponent(rel)}`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.data.entries);
        setCwd(data.data.relPath);
      } else {
        setError(data.error);
      }
      const gitRes = await fetch(`/api/files/git?path=${encodeURIComponent(rel)}`);
      const gitData = await gitRes.json();
      if (gitData.ok) setGit(gitData.data);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role === 'admin') loadDir('');
  }, [user, loadDir]);

  async function openFile(path: string) {
    setSelectedPath(path);
    setContentLoading(true);
    setEditing(false);
    setContent(null);
    try {
      const res = await fetch(`/api/files?mode=read&path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.ok) {
        setContent(data.data);
        if (data.data.kind === 'text') setEditValue(data.data.content);
      } else {
        setError(data.error);
      }
    } finally {
      setContentLoading(false);
    }
  }

  async function save() {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: JSON.stringify({ path: selectedPath, content: editValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Save failed');
        return;
      }
      setContent((c) => (c && c.kind === 'text' ? { ...c, content: editValue } : c));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function createEntry(type: 'file' | 'folder') {
    const name = window.prompt(`New ${type} name:`);
    if (!name?.trim()) return;
    const rel = cwd ? `${cwd}/${name.trim()}` : name.trim();
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders },
      body: JSON.stringify({ path: rel, type }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Create failed');
      return;
    }
    loadDir(cwd);
  }

  async function remove(entry: DirEntry) {
    if (!confirm(`Delete "${entry.name}"? Cannot be undone.`)) return;
    const res = await fetch(`/api/files?path=${encodeURIComponent(entry.path)}`, {
      method: 'DELETE',
      headers: csrfHeaders,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Delete failed');
      return;
    }
    if (selectedPath === entry.path) {
      setSelectedPath(null);
      setContent(null);
    }
    loadDir(cwd);
  }

  async function rename(entry: DirEntry) {
    const next = window.prompt('Rename to:', entry.name);
    if (!next?.trim() || next.trim() === entry.name) return;
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    const to = parent ? `${parent}/${next.trim()}` : next.trim();
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders },
      body: JSON.stringify({ from: entry.path, to }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      alert(data.error || 'Rename failed');
      return;
    }
    if (selectedPath === entry.path) setSelectedPath(to);
    loadDir(cwd);
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

  const crumbs = cwd ? cwd.split('/') : [];

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar: breadcrumb + git + actions */}
        <header className="shrink-0 border-b border-portal-border px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => loadDir('')}
            className="p-1 text-portal-muted hover:text-portal-text rounded"
            title="Workspace root"
          >
            <Home className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1 text-xs text-portal-muted min-w-0 overflow-x-auto scrollbar-hide">
            {crumbs.map((c, i) => {
              const target = crumbs.slice(0, i + 1).join('/');
              return (
                <span key={target} className="flex items-center gap-1 shrink-0">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => loadDir(target)}
                    className="hover:text-portal-text"
                  >
                    {c}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {git.isRepo && (
              <span className="inline-flex items-center gap-1 text-[11px] text-portal-muted">
                <GitBranch className="h-3.5 w-3.5 text-portal-accent" />
                {git.branch}
                {typeof git.dirtyCount === 'number' && git.dirtyCount > 0 && (
                  <span className="text-amber-400">· {git.dirtyCount} dirty</span>
                )}
              </span>
            )}
            <button onClick={() => createEntry('file')} className="p-1.5 text-portal-muted hover:text-portal-text rounded" title="New file">
              <FilePlus className="h-4 w-4" />
            </button>
            <button onClick={() => createEntry('folder')} className="p-1.5 text-portal-muted hover:text-portal-text rounded" title="New folder">
              <FolderPlus className="h-4 w-4" />
            </button>
            <button onClick={() => loadDir(cwd)} className="p-1.5 text-portal-muted hover:text-portal-text rounded" title="Refresh">
              <RefreshCw className={cn('h-4 w-4', listLoading && 'animate-spin')} />
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 px-4 py-1.5 text-xs flex items-center gap-2">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-3 w-3" /></button>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          {/* Tree / listing */}
          <div className="w-64 lg:w-72 shrink-0 border-r border-portal-border overflow-y-auto">
            {listLoading && entries.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-portal-muted" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8 text-xs text-portal-muted">Empty folder</div>
            ) : (
              <ul className="py-1">
                {entries.map((e) => (
                  <li key={e.path} className="group">
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-portal-card-hover',
                        selectedPath === e.path && 'bg-portal-accent/10'
                      )}
                      onClick={() => (e.type === 'folder' ? loadDir(e.path) : openFile(e.path))}
                    >
                      {e.type === 'folder' ? (
                        <Folder className="h-4 w-4 text-portal-accent shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-portal-muted shrink-0" />
                      )}
                      <span className="truncate flex-1 text-portal-text">{e.name}</span>
                      <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(ev) => { ev.stopPropagation(); rename(e); }}
                          className="p-0.5 text-portal-muted hover:text-portal-text"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(ev) => { ev.stopPropagation(); remove(e); }}
                          className="p-0.5 text-portal-muted hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Preview / editor */}
          <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
            {!selectedPath ? (
              <div className="flex-1 flex items-center justify-center text-portal-muted text-sm">
                Select a file to preview
              </div>
            ) : contentLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-portal-muted" />
              </div>
            ) : (
              <>
                <div className="shrink-0 border-b border-portal-border px-4 py-2 flex items-center gap-2">
                  <span className="text-xs font-mono text-portal-text truncate">{selectedPath}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {content?.kind === 'text' && MD_EXT.test(selectedPath) && !editing && (
                      <button
                        onClick={() => setMdPreview((v) => !v)}
                        className="p-1.5 text-portal-muted hover:text-portal-text rounded"
                        title={mdPreview ? 'Show source' : 'Render markdown'}
                      >
                        {mdPreview ? <Code2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    )}
                    {content?.kind === 'text' && !editing && (
                      <button
                        onClick={() => { setEditing(true); setMdPreview(false); }}
                        className="p-1.5 text-portal-muted hover:text-portal-text rounded"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {editing && (
                      <>
                        <button
                          onClick={() => { setEditing(false); if (content?.kind === 'text') setEditValue(content.content); }}
                          className="px-2 py-1 text-xs text-portal-muted hover:text-portal-text"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={save}
                          disabled={saving}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-portal-accent text-white rounded disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {content?.kind === 'image' && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={content.dataUri} alt={selectedPath} className="max-w-full" />
                  )}
                  {content?.kind === 'binary' && (
                    <div className="text-sm text-portal-muted">
                      Binary file ({(content.size / 1024).toFixed(1)} KB) — preview not available.
                    </div>
                  )}
                  {content?.kind === 'text' && editing && (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      spellCheck={false}
                      className="w-full h-full min-h-[400px] bg-portal-bg border border-portal-border rounded-lg p-3 text-xs font-mono text-portal-text resize-none focus:outline-none focus:border-portal-accent/40"
                    />
                  )}
                  {content?.kind === 'text' && !editing && (
                    <>
                      {content.truncated && (
                        <div className="text-[11px] text-amber-400 mb-2">
                          File truncated to 512 KB for preview.
                        </div>
                      )}
                      {MD_EXT.test(selectedPath) && mdPreview ? (
                        <AssistantMessage content={content.content} />
                      ) : (
                        <pre className="text-xs font-mono text-portal-text whitespace-pre-wrap break-all">
                          {content.content}
                        </pre>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
