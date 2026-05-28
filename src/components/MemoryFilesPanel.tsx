'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { AssistantMessage } from '@/components/ai/AssistantMessage';
import { FileText, FolderGit2, Loader2, Save, Eye, Code2, Check } from 'lucide-react';

interface PortalFile {
  key: string;
  label: string;
  description: string;
  injected: boolean;
  content: string;
}

interface ProjectOption {
  id: string;
  slug: string;
  name: string;
}

type Target =
  | { scope: 'portal'; key: string; label: string; description: string; injected: boolean }
  | { scope: 'project'; slug: string; label: string };

export function MemoryFilesPanel({ csrfToken }: { csrfToken?: string }) {
  const [files, setFiles] = useState<PortalFile[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csrfHeaders: Record<string, string> = csrfToken ? { 'x-csrf-token': csrfToken } : {};

  useEffect(() => {
    fetch('/api/ai/memory-files?scope=portal')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setFiles(d.data);
          // Auto-open the AI identity file first.
          const first = d.data[0] as PortalFile | undefined;
          if (first) {
            openPortal(first);
          }
        }
      })
      .catch(() => {});
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setProjects(d.data.map((p: ProjectOption) => ({ id: p.id, slug: p.slug, name: p.name })));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPortal(f: PortalFile) {
    setTarget({ scope: 'portal', key: f.key, label: f.label, description: f.description, injected: f.injected });
    setContent(f.content);
    setOriginal(f.content);
    setPreview(false);
    setError(null);
  }

  async function openProject(slug: string) {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setTarget({ scope: 'project', slug, label: `${slug} / MEMORY.md` });
    try {
      const res = await fetch(`/api/ai/memory-files?scope=project&slug=${encodeURIComponent(slug)}`);
      const d = await res.json();
      if (d.ok) {
        setContent(d.data.content);
        setOriginal(d.data.content);
        setPreview(false);
      } else {
        setError(d.error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      const body =
        target.scope === 'portal'
          ? { scope: 'portal', key: target.key, content }
          : { scope: 'project', slug: target.slug, content };
      const res = await fetch('/api/ai/memory-files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d.error || 'Save failed');
        return;
      }
      setOriginal(content);
      if (target.scope === 'portal') {
        setFiles((prev) => prev.map((f) => (f.key === target.key ? { ...f, content } : f)));
      }
    } finally {
      setSaving(false);
    }
  }

  const dirty = content !== original;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      {/* File picker */}
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-portal-muted mb-1.5">Portal</div>
          <div className="space-y-1">
            {files.map((f) => (
              <button
                key={f.key}
                onClick={() => openPortal(f)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors',
                  target?.scope === 'portal' && target.key === f.key
                    ? 'bg-portal-accent/10 text-portal-accent'
                    : 'text-portal-text hover:bg-portal-card-hover'
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{f.label}</span>
                {f.injected && (
                  <span className="text-[9px] text-portal-muted" title="Injected into chat context">ctx</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-portal-muted mb-1.5">Project memory</div>
          <select
            value={target?.scope === 'project' ? target.slug : ''}
            onChange={(e) => openProject(e.target.value)}
            className="w-full bg-portal-bg border border-portal-border rounded-md px-2 py-1.5 text-sm text-portal-text"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>{p.name}</option>
            ))}
          </select>
          {target?.scope === 'project' && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-portal-muted">
              <FolderGit2 className="h-3 w-3" />
              loaded when this project is active in chat
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="min-w-0">
        {!target ? (
          <div className="border border-portal-border rounded-xl p-8 text-center text-sm text-portal-muted">
            Pick a memory file to edit.
          </div>
        ) : (
          <div className="border border-portal-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-portal-border">
              <span className="text-sm font-medium text-portal-text truncate">{target.label}</span>
              {dirty && <span className="text-[10px] text-amber-400">unsaved</span>}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setPreview((v) => !v)}
                  className="p-1.5 text-portal-muted hover:text-portal-text rounded-md"
                  title={preview ? 'Edit source' : 'Preview markdown'}
                >
                  {preview ? <Code2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  onClick={save}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-portal-accent text-white rounded-md disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
              </div>
            </div>
            {target.scope === 'portal' && (
              <div className="px-3 py-1.5 text-[11px] text-portal-muted border-b border-portal-border bg-portal-bg/40">
                {target.description}
              </div>
            )}
            {error && (
              <div className="px-3 py-1.5 text-xs text-red-400 border-b border-red-500/30 bg-red-500/5">{error}</div>
            )}
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-portal-muted" />
              </div>
            ) : preview ? (
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                <AssistantMessage content={content || '_(empty)_'} />
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className="w-full min-h-[50vh] bg-portal-bg p-4 text-sm font-mono text-portal-text resize-y focus:outline-none"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
