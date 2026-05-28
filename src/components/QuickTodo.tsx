'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CheckSquare, Plus, Loader2, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/usePortal';
import { cn } from '@/lib/utils';

const PROJECT_KEY = 'quicktodo:project';

/**
 * App-wide quick-capture for todos. A small floating button (left of the
 * AI Hub button) opens a popover: type a todo, pick a project, add — without
 * leaving the page you're on. The project persists so a stray thought about
 * any project can be captured in two keystrokes.
 */
export function QuickTodo() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setProjects(d.data.map((p: { id: string; slug: string; name: string }) => ({ id: p.id, slug: p.slug, name: p.name })));
      })
      .catch(() => {});
    try {
      const stored = window.localStorage.getItem(PROJECT_KEY);
      if (stored) setProjectId(stored);
    } catch {
      /* ignore */
    }
  }, [user]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  function chooseProject(id: string) {
    setProjectId(id);
    try {
      if (id) window.localStorage.setItem(PROJECT_KEY, id);
      else window.localStorage.removeItem(PROJECT_KEY);
    } catch {
      /* ignore */
    }
  }

  async function add() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify({ title: text.trim(), projectId: projectId || undefined }),
      });
      if (res.ok) {
        setText('');
        setJustAdded(true);
        setTimeout(() => setJustAdded(false), 1500);
        inputRef.current?.focus();
        window.dispatchEvent(new CustomEvent('todos:changed'));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) return null;
  if (pathname === '/login') return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Quick add todo"
          title="Quick add todo"
          className="fixed top-2.5 right-[3.25rem] z-[60] inline-flex items-center justify-center h-9 w-9 rounded-full bg-portal-card border border-portal-border text-portal-muted shadow-lg hover:text-portal-text hover:border-portal-accent/40 transition-colors focus:outline-none focus:ring-2 focus:ring-portal-accent"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed top-12 right-2.5 z-[61] w-80 max-w-[calc(100vw-1.25rem)] bg-portal-card border border-portal-border rounded-xl shadow-2xl p-3 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-portal-text flex items-center gap-1.5">
                <CheckSquare className="h-3.5 w-3.5 text-portal-accent" />
                Quick todo
              </span>
              <button onClick={() => setOpen(false)} className="p-1 text-portal-muted hover:text-portal-text">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add(); }
                else if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="What needs doing?"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/40"
            />
            <div className="flex items-center gap-2 mt-2">
              <select
                value={projectId}
                onChange={(e) => chooseProject(e.target.value)}
                className="flex-1 min-w-0 bg-portal-bg border border-portal-border rounded-lg px-2 py-1.5 text-xs text-portal-text focus:outline-none"
                title="Assign to a project"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={saving || !text.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg text-xs font-medium"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : justAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {justAdded ? 'Added' : 'Add'}
              </button>
            </div>
            <p className="text-[10px] text-portal-muted mt-1.5">Enter to add · stays open for the next one</p>
          </div>
        </>
      )}
    </>
  );
}
