'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { 
  ArrowLeft, 
  FileText, 
  GitBranch,
  Clock,
  ExternalLink,
  RefreshCw,
  Edit3,
  Save,
  X,
  MessageSquare,
  ListChecks,
  History
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  status: string;
  icon: string | null;
  updatedAt: string;
}

interface ProjectFile {
  name: string;
  content: string;
  exists: boolean;
}

const tabs = [
  { id: 'notes', label: '🦀 Notes Claw', file: 'CLAW-NOTES.md', icon: ListChecks },
  { id: 'readme', label: '📋 README', file: 'README.md', icon: FileText },
  { id: 'changelog', label: '📝 Changelog', file: 'CHANGELOG.md', icon: History },
  { id: 'sessions', label: '💬 Sessions', file: 'SESSIONS.md', icon: MessageSquare },
];

export default function ProjectDetailPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const slug = params.slug as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState('notes');
  const [fileContent, setFileContent] = useState<Record<string, ProjectFile>>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  // Load project
  useEffect(() => {
    if (user && slug) {
      fetch(`/api/projects/${slug}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok) setProject(data.data);
        });
    }
  }, [user, slug]);

  // Load file content when tab changes
  useEffect(() => {
    if (!project || !slug) return;
    
    const tab = tabs.find(t => t.id === activeTab);
    if (!tab) return;

    // Check cache
    if (fileContent[tab.file]) return;

    setLoadingFile(true);
    fetch(`/api/projects/${slug}/files/${encodeURIComponent(tab.file)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setFileContent(prev => ({
            ...prev,
            [tab.file]: data.data
          }));
        }
        setLoadingFile(false);
      })
      .catch(() => setLoadingFile(false));
  }, [project, slug, activeTab, fileContent]);

  const currentTab = tabs.find(t => t.id === activeTab);
  const currentFile = currentTab ? fileContent[currentTab.file] : null;

  const handleEdit = () => {
    if (currentFile) {
      setEditContent(currentFile.content);
      setEditing(true);
    }
  };

  const handleSave = async () => {
    if (!currentTab || !slug) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${slug}/files/${encodeURIComponent(currentTab.file)}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: JSON.stringify({ content: editContent }),
      });
      
      const data = await res.json();
      if (data.ok) {
        setFileContent(prev => ({
          ...prev,
          [currentTab.file]: { ...prev[currentTab.file], content: editContent }
        }));
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditContent('');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-portal-muted">Chargement du projet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-portal-bg">
      {/* Header */}
      <div className="border-b border-portal-border bg-portal-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link 
                href="/projects" 
                className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-portal-text flex items-center gap-2">
                  <span className="text-2xl">{project.icon || '📁'}</span>
                  {project.name}
                </h1>
                {project.description && (
                  <p className="text-sm text-portal-muted">{project.description}</p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {project.repoUrl && (
                <a
                  href={project.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text bg-portal-card border border-portal-border rounded-lg transition-colors"
                >
                  <GitBranch className="h-4 w-4" />
                  GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 -mb-px">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border border-b-0 transition-colors ${
                    activeTab === tab.id
                      ? 'bg-portal-bg border-portal-border text-portal-text'
                      : 'bg-transparent border-transparent text-portal-muted hover:text-portal-text'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="bg-portal-card border border-portal-border rounded-xl">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-portal-border">
            <span className="text-sm text-portal-muted">
              {currentTab?.file}
            </span>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text rounded transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Annuler
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded transition-colors disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </>
              ) : (
                user.role?.toLowerCase() === 'admin' && currentFile?.exists && (
                  <button
                    onClick={handleEdit}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text bg-portal-bg rounded transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Modifier
                  </button>
                )
              )}
            </div>
          </div>

          {/* File content */}
          <div className="p-6">
            {loadingFile ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-portal-muted" />
              </div>
            ) : editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-[60vh] bg-portal-bg border border-portal-border rounded-lg p-4 text-sm text-portal-text font-mono focus:outline-none focus:border-portal-accent/50 resize-none"
                placeholder="Contenu markdown..."
              />
            ) : currentFile?.exists ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold text-portal-text mb-4">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-portal-text mt-6 mb-3">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-medium text-portal-text mt-4 mb-2">{children}</h3>,
                    p: ({ children }) => <p className="text-portal-muted mb-3">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-portal-muted mb-3 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-portal-muted mb-3 space-y-1">{children}</ol>,
                    li: ({ children }) => <li className="text-portal-muted">{children}</li>,
                    code: ({ children, className }) => {
                      const isBlock = className?.includes('language-');
                      return isBlock ? (
                        <pre className="bg-portal-bg border border-portal-border rounded-lg p-4 overflow-x-auto mb-3">
                          <code className="text-sm text-portal-text font-mono">{children}</code>
                        </pre>
                      ) : (
                        <code className="bg-portal-bg px-1.5 py-0.5 rounded text-portal-accent text-sm font-mono">{children}</code>
                      );
                    },
                    pre: ({ children }) => <>{children}</>,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-portal-accent hover:underline">
                        {children}
                      </a>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full border-collapse border border-portal-border">{children}</table>
                      </div>
                    ),
                    th: ({ children }) => <th className="border border-portal-border bg-portal-bg px-3 py-2 text-left text-sm font-medium text-portal-text">{children}</th>,
                    td: ({ children }) => <td className="border border-portal-border px-3 py-2 text-sm text-portal-muted">{children}</td>,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-portal-accent pl-4 italic text-portal-muted mb-3">{children}</blockquote>
                    ),
                    hr: () => <hr className="border-portal-border my-6" />,
                  }}
                >
                  {currentFile.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-portal-muted mx-auto mb-4" />
                <p className="text-portal-muted mb-4">Ce fichier n'existe pas encore.</p>
                {user.role?.toLowerCase() === 'admin' && (
                  <button
                    onClick={() => {
                      setEditContent(`# ${currentTab?.label}\n\n`);
                      setEditing(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
                  >
                    <Edit3 className="h-4 w-4" />
                    Créer le fichier
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
