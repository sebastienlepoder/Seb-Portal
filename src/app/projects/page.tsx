'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  FolderGit2,
  Plus,
  GitBranch,
  Clock,
  CheckCircle2,
  PauseCircle,
  Archive,
  ListTodo,
  Pencil,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ProjectEditorModal } from '@/components/projects/ProjectEditorModal';

interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  status: string;
  icon: string | null;
  color: string | null;
  updatedAt: string;
  _count?: {
    sessions: number;
    tasks?: number;
  };
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-400', label: 'Actif' },
  paused: { icon: PauseCircle, color: 'text-yellow-400', label: 'En pause' },
  completed: { icon: CheckCircle2, color: 'text-blue-400', label: 'Terminé' },
  archived: { icon: Archive, color: 'text-gray-400', label: 'Archivé' },
};

type StatusFilter = 'all' | 'active' | 'paused' | 'completed' | 'archived';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Actif' },
  { value: 'paused', label: 'En pause' },
  { value: 'completed', label: 'Terminé' },
  { value: 'archived', label: 'Archivé' },
  { value: 'all', label: 'Tous' },
];

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  // null = closed, 'new' = create, otherwise the project id being edited.
  const [editorTarget, setEditorTarget] = useState<string | 'new' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  async function syncRepos() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch('/api/admin/github/sync', {
        method: 'POST',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
      const data = await res.json();
      if (!res.ok && !data.data) {
        setSyncMsg(data.error || 'Sync failed');
        return;
      }
      const r = data.data;
      setSyncMsg(
        `Synced ${r.fetched} repo${r.fetched === 1 ? '' : 's'} — ${r.created} new, ${r.skipped} already linked` +
          (r.errors?.length ? `, ${r.errors.length} error(s)` : '')
      );
      refresh();
    } catch {
      setSyncMsg('Sync request failed');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  function refresh() {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setProjects(data.data);
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
  }

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };

  const filteredProjects = useMemo(() => {
    if (statusFilter === 'all') return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  const filterCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: projects.length,
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    };
    for (const p of projects) {
      if (p.status in counts) counts[p.status as StatusFilter]++;
    }
    return counts;
  }, [projects]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="pl-12 sm:pl-0 min-w-0">
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <FolderGit2 className="h-6 w-6 text-portal-accent" />
                Projets
              </h1>
              <p className="text-sm text-portal-muted">Documentation et suivi des projets</p>
            </div>
            
            {isAdmin && (
              <div className="sm:ml-auto flex items-center gap-2">
                <button
                  onClick={syncRepos}
                  disabled={syncing}
                  title="Pull your GitHub repos in as projects"
                  className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/40 text-portal-text rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync repos
                </button>
                <button
                  onClick={() => setEditorTarget('new')}
                  className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau projet
                </button>
              </div>
            )}
          </div>

          {syncMsg && (
            <div className="mb-4 text-xs text-portal-muted bg-portal-card border border-portal-border rounded-lg px-3 py-2 flex items-center justify-between gap-2">
              <span>{syncMsg}</span>
              <button onClick={() => setSyncMsg(null)} className="text-portal-muted hover:text-portal-text">✕</button>
            </div>
          )}

          {/* Status filter chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors cursor-pointer',
                    active
                      ? 'bg-portal-accent/10 border-portal-accent/40 text-portal-accent'
                      : 'bg-portal-card border-portal-border text-portal-muted hover:text-portal-text hover:border-portal-accent/30'
                  )}
                  aria-pressed={active}
                >
                  <span>{f.label}</span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-full text-[10px]',
                      active ? 'bg-portal-accent/20' : 'bg-portal-bg'
                    )}
                  >
                    {filterCounts[f.value]}
                  </span>
                </button>
              );
            })}
          </div>

        {/* Projects Grid */}
        {loadingProjects ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-portal-card border border-portal-border rounded-xl p-6 animate-pulse">
                <div className="h-6 bg-portal-border rounded w-3/4 mb-3" />
                <div className="h-4 bg-portal-border rounded w-full mb-2" />
                <div className="h-4 bg-portal-border rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-portal-card border border-portal-border rounded-xl p-12 text-center">
            <FolderGit2 className="h-12 w-12 text-portal-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-portal-text mb-2">
              {projects.length === 0 ? 'Aucun projet' : 'Aucun projet pour ce filtre'}
            </h3>
            <p className="text-sm text-portal-muted mb-4">
              {projects.length === 0
                ? 'Commencez par créer votre premier projet pour organiser votre documentation.'
                : 'Essayez un autre filtre de statut.'}
            </p>
            {projects.length === 0 && isAdmin && (
              <button
                onClick={() => setEditorTarget('new')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Créer un projet
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(project => {
              const status = statusConfig[project.status] || statusConfig.active;
              const StatusIcon = status.icon;
              const taskCount = project._count?.tasks ?? 0;
              
              return (
                <div key={project.id} className="relative group">
                  {isAdmin && (
                    <button
                      onClick={() => setEditorTarget(project.id)}
                      title="Edit project settings"
                      aria-label="Edit project settings"
                      className="absolute top-3 right-3 z-10 p-1.5 rounded-md bg-portal-bg/80 border border-portal-border text-portal-muted hover:text-portal-text opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <Link
                    href={`/projects/${project.slug}`}
                    className="block bg-portal-card border border-portal-border rounded-xl p-6 hover:border-portal-accent/50 transition-all h-full"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl">{project.icon || '📁'}</span>
                        <h3 className="text-lg font-semibold text-portal-text group-hover:text-portal-accent transition-colors truncate">
                          {project.name}
                        </h3>
                      </div>
                      <div className={cn('flex items-center gap-1 text-xs shrink-0', status.color, isAdmin && 'mr-7')}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {status.label}
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-sm text-portal-muted mb-4 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-portal-muted flex-wrap">
                      {project.repoUrl && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3.5 w-3.5" />
                          GitHub
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(project.updatedAt).toLocaleDateString('fr-FR')}
                      </span>
                      {project._count?.sessions && project._count.sessions > 0 && (
                        <span>{project._count.sessions} sessions</span>
                      )}
                      {taskCount > 0 && (
                        <span className="flex items-center gap-1">
                          <ListTodo className="h-3.5 w-3.5" />
                          {taskCount} open task{taskCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      {isAdmin && editorTarget && (
        <ProjectEditorModal
          projectId={editorTarget === 'new' ? undefined : editorTarget}
          csrfToken={csrfToken}
          onClose={() => setEditorTarget(null)}
          onSaved={() => {
            setEditorTarget(null);
            setLoadingProjects(true);
            refresh();
          }}
        />
      )}
    </div>
  );
}
