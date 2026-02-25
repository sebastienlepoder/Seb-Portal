'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import PortalSidebar from '@/components/layout/PortalSidebar';
import { 
  FolderGit2, 
  Plus, 
  ExternalLink,
  GitBranch,
  Clock,
  CheckCircle2,
  PauseCircle,
  Archive
} from 'lucide-react';
import Link from 'next/link';

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
  };
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-400', label: 'Actif' },
  paused: { icon: PauseCircle, color: 'text-yellow-400', label: 'En pause' },
  completed: { icon: CheckCircle2, color: 'text-blue-400', label: 'Terminé' },
  archived: { icon: Archive, color: 'text-gray-400', label: 'Archivé' },
};

export default function ProjectsPage() {
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  useEffect(() => {
    if (user) {
      fetch('/api/projects')
        .then(res => res.json())
        .then(data => {
          if (data.ok) setProjects(data.data);
          setLoadingProjects(false);
        })
        .catch(() => setLoadingProjects(false));
    }
  }, [user]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <PortalSidebar user={user} onLogout={handleLogout} />
      
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <FolderGit2 className="h-6 w-6 text-portal-accent" />
                Projets
              </h1>
              <p className="text-sm text-portal-muted">Documentation et suivi des projets</p>
            </div>
            
            {user.role?.toLowerCase() === 'admin' && (
              <Link
                href="/projects/new"
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Nouveau projet
              </Link>
            )}
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
        ) : projects.length === 0 ? (
          <div className="bg-portal-card border border-portal-border rounded-xl p-12 text-center">
            <FolderGit2 className="h-12 w-12 text-portal-muted mx-auto mb-4" />
            <h3 className="text-lg font-medium text-portal-text mb-2">Aucun projet</h3>
            <p className="text-sm text-portal-muted mb-4">
              Commencez par créer votre premier projet pour organiser votre documentation.
            </p>
            {user.role?.toLowerCase() === 'admin' && (
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Créer un projet
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const status = statusConfig[project.status] || statusConfig.active;
              const StatusIcon = status.icon;
              
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.slug}`}
                  className="bg-portal-card border border-portal-border rounded-xl p-6 hover:border-portal-accent/50 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{project.icon || '📁'}</span>
                      <h3 className="text-lg font-semibold text-portal-text group-hover:text-portal-accent transition-colors">
                        {project.name}
                      </h3>
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${status.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {status.label}
                    </div>
                  </div>
                  
                  {project.description && (
                    <p className="text-sm text-portal-muted mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-portal-muted">
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
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
