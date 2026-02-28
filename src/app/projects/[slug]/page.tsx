'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { 
  ArrowLeft,
  Settings, 
  FileText, 
  GitBranch,
  ExternalLink,
  RefreshCw,
  Edit3,
  Save,
  X,
  MessageSquare,
  ListChecks,
  History,
  BookOpen,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  File,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

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

interface DocFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  url: string;
  children?: DocFile[];
}

interface DocsData {
  tree: DocFile[];
  hasDocsFolder: boolean;
}

const localTabs = [
  { id: 'notes', label: '🦀 Notes Claw', file: 'CLAW-NOTES.md', icon: ListChecks },
  { id: 'readme', label: '📋 README', file: 'README.md', icon: FileText },
  { id: 'changelog', label: '📝 Changelog', file: 'CHANGELOG.md', icon: History },
  { id: 'sessions', label: '💬 Sessions', file: 'SESSIONS.md', icon: MessageSquare },
];

export default function ProjectDetailPage() {
  const { user, loading, logout } = useAuth();
  const params = useParams();
  const slug = params.slug as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState('notes');
  const [fileContent, setFileContent] = useState<Record<string, ProjectFile>>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Docs state
  const [docsData, setDocsData] = useState<DocsData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [loadingDocContent, setLoadingDocContent] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    repoUrl: '',
    icon: '',
    status: 'active',
  });
  const [savingSettings, setSavingSettings] = useState(false);

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

  // Load local file content when tab changes (for non-docs tabs)
  useEffect(() => {
    if (!project || !slug || activeTab === 'docs') return;
    
    const tab = localTabs.find(t => t.id === activeTab);
    if (!tab) return;

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

  // Load docs tree when docs tab is selected
  useEffect(() => {
    if (activeTab !== 'docs' || !project?.repoUrl || docsData) return;

    setLoadingDocs(true);
    fetch(`/api/github/docs?repo=${encodeURIComponent(project.repoUrl)}&action=tree`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDocsData(data.data);
          // Auto-select first markdown file if exists
          const firstMd = findFirstMarkdownFile(data.data.tree);
          if (firstMd) {
            setSelectedDocPath(firstMd.path);
          }
        }
        setLoadingDocs(false);
      })
      .catch(() => setLoadingDocs(false));
  }, [activeTab, project?.repoUrl, docsData]);

  // Load selected doc content
  useEffect(() => {
    if (!selectedDocPath || !project?.repoUrl) return;

    setLoadingDocContent(true);
    fetch(`/api/github/docs?repo=${encodeURIComponent(project.repoUrl)}&action=file&file=${encodeURIComponent(selectedDocPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDocContent(data.data.content);
        }
        setLoadingDocContent(false);
      })
      .catch(() => setLoadingDocContent(false));
  }, [selectedDocPath, project?.repoUrl]);

  const findFirstMarkdownFile = (tree: DocFile[]): DocFile | null => {
    for (const item of tree) {
      if (item.type === 'file' && item.name.endsWith('.md')) {
        return item;
      }
      if (item.children) {
        const found = findFirstMarkdownFile(item.children);
        if (found) return found;
      }
    }
    return null;
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  
  const openSettings = () => {
    if (project) {
      setSettingsForm({
        name: project.name || '',
        description: project.description || '',
        repoUrl: project.repoUrl || '',
        icon: project.icon || '',
        status: project.status || 'active',
      });
      setShowSettings(true);
    }
  };

  const saveSettings = async () => {
    if (!slug) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/projects/${slug}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (data.ok) {
        setProject(data.data);
        setShowSettings(false);
        // Reset docs data to reload with new repo URL
        setDocsData(null);
        setSelectedDocPath(null);
        setDocContent(null);
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSavingSettings(false);
    }
  };

  const currentTab = localTabs.find(t => t.id === activeTab);
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
      <div className="h-screen bg-portal-bg flex overflow-hidden">
        <MainSidebar user={user} onLogout={logout} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-portal-muted">Loading project...</p>
          </div>
        </div>
      </div>
    );
  }

  // Build tabs array with docs if repo exists
  const tabs = [
    ...localTabs,
    ...(project.repoUrl ? [{ id: 'docs', label: '📚 Docs', file: null, icon: BookOpen }] : []),
  ];

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />
      
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card/50 backdrop-blur sticky top-0 z-10">
          <div className="px-6 py-4">
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
                {user?.role?.toLowerCase() === 'admin' && (
                  <button
                    onClick={openSettings}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text bg-portal-card border border-portal-border rounded-lg transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-4 -mb-px overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border border-b-0 transition-colors whitespace-nowrap ${
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
        <div className="p-6">
          {activeTab === 'docs' ? (
            // Docs Tab Content
            <div className="flex gap-6">
              {/* Docs Sidebar / Tree */}
              <div className="w-64 flex-shrink-0">
                <div className="bg-portal-card border border-portal-border rounded-xl">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-blue-400" />
                      Documentation
                    </h3>
                  </div>
                  <div className="p-2 max-h-[60vh] overflow-y-auto">
                    {loadingDocs ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin text-portal-muted" />
                      </div>
                    ) : docsData?.hasDocsFolder ? (
                      <DocsTree
                        items={docsData.tree}
                        selectedPath={selectedDocPath}
                        expandedFolders={expandedFolders}
                        onSelectFile={setSelectedDocPath}
                        onToggleFolder={toggleFolder}
                      />
                    ) : (
                      <div className="text-center py-8">
                        <Folder className="h-8 w-8 text-portal-muted mx-auto mb-2" />
                        <p className="text-sm text-portal-muted">No docs folder found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Docs Content */}
              <div className="flex-1">
                <div className="bg-portal-card border border-portal-border rounded-xl">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-portal-border">
                    <span className="text-sm text-portal-muted font-mono">
                      {selectedDocPath || 'Select a file'}
                    </span>
                    {selectedDocPath && (
                      <a
                        href={`${project.repoUrl}/blob/main/${selectedDocPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-portal-muted hover:text-portal-text flex items-center gap-1"
                      >
                        View on GitHub
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="p-6">
                    {loadingDocContent ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="h-6 w-6 animate-spin text-portal-muted" />
                      </div>
                    ) : docContent ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <MarkdownRenderer content={docContent} />
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <FileText className="h-12 w-12 text-portal-muted mx-auto mb-4" />
                        <p className="text-portal-muted">Select a file to view its contents</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Local Files Tab Content
            <div className="bg-portal-card border border-portal-border rounded-xl">
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
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded transition-colors disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    </>
                  ) : (
                    user.role?.toLowerCase() === 'admin' && currentFile?.exists && (
                      <button
                        onClick={handleEdit}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text bg-portal-bg rounded transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    )
                  )}
                </div>
              </div>

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
                    placeholder="Markdown content..."
                  />
                ) : currentFile?.exists ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <MarkdownRenderer content={currentFile.content} />
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-portal-muted mx-auto mb-4" />
                    <p className="text-portal-muted mb-4">This file doesn't exist yet.</p>
                    {user.role?.toLowerCase() === 'admin' && (
                      <button
                        onClick={() => {
                          setEditContent(`# ${currentTab?.label}\n\n`);
                          setEditing(true);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"
                      >
                        <Edit3 className="h-4 w-4" />
                        Create File
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border">
              <h2 className="text-lg font-semibold text-portal-text">Project Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-portal-muted hover:text-portal-text rounded transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-portal-muted mb-1">Name</label>
                <input
                  type="text"
                  value={settingsForm.name}
                  onChange={(e) => setSettingsForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-portal-muted mb-1">Description</label>
                <input
                  type="text"
                  value={settingsForm.description}
                  onChange={(e) => setSettingsForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-portal-muted mb-1">GitHub Repository URL</label>
                <input
                  type="url"
                  value={settingsForm.repoUrl}
                  onChange={(e) => setSettingsForm(f => ({ ...f, repoUrl: e.target.value }))}
                  placeholder="https://github.com/user/repo"
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"
                />
                <p className="text-xs text-portal-muted mt-1">Required to view docs from GitHub</p>
              </div>
              <div>
                <label className="block text-sm text-portal-muted mb-1">Icon (emoji)</label>
                <input
                  type="text"
                  value={settingsForm.icon}
                  onChange={(e) => setSettingsForm(f => ({ ...f, icon: e.target.value }))}
                  placeholder="📁"
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-portal-muted mb-1">Status</label>
                <select
                  value={settingsForm.status}
                  onChange={(e) => setSettingsForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-portal-border">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-sm text-portal-muted hover:text-portal-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="px-4 py-2 text-sm bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Docs Tree Component
function DocsTree({
  items,
  selectedPath,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
  depth = 0,
}: {
  items: DocFile[];
  selectedPath: string | null;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className={cn(depth > 0 && 'ml-3 border-l border-portal-border pl-2')}>
      {items.map((item) => (
        <div key={item.path}>
          {item.type === 'dir' ? (
            <>
              <button
                onClick={() => onToggleFolder(item.path)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded transition-colors"
              >
                {expandedFolders.has(item.path) ? (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    <FolderOpen className="h-4 w-4 text-yellow-400" />
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-3 w-3" />
                    <Folder className="h-4 w-4 text-yellow-400" />
                  </>
                )}
                <span className="truncate">{item.name}</span>
              </button>
              {expandedFolders.has(item.path) && item.children && (
                <DocsTree
                  items={item.children}
                  selectedPath={selectedPath}
                  expandedFolders={expandedFolders}
                  onSelectFile={onSelectFile}
                  onToggleFolder={onToggleFolder}
                  depth={depth + 1}
                />
              )}
            </>
          ) : (
            <button
              onClick={() => onSelectFile(item.path)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors',
                selectedPath === item.path
                  ? 'bg-portal-accent/20 text-portal-accent'
                  : 'text-portal-muted hover:text-portal-text hover:bg-portal-bg'
              )}
            >
              <File className="h-4 w-4 ml-3" />
              <span className="truncate">{item.name}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Markdown Renderer Component  
function MarkdownRenderer({ content }: { content: string }) {
  return (
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
      {content}
    </ReactMarkdown>
  );
}
