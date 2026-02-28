'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { 
  ArrowLeft, FileText, GitBranch, GitCommit, GitPullRequest, CircleDot,
  ExternalLink, RefreshCw, Edit3, Save, X, MessageSquare, ListChecks,
  History, BookOpen, Folder, FolderOpen, ChevronRight, ChevronDown,
  File, Settings, Star, GitFork, Clock, Github,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface Project {
  id: string; slug: string; name: string; description: string | null;
  repoUrl: string | null; status: string; icon: string | null; updatedAt: string;
}
interface ProjectFile { name: string; content: string; exists: boolean; }
interface DocFile { name: string; path: string; type: 'file' | 'dir'; url: string; children?: DocFile[]; }
interface DocsData { tree: DocFile[]; hasDocsFolder: boolean; }
interface GitHubRepo {
  name: string; fullName: string; description: string | null; url: string;
  language: string | null; stars: number; forks: number; openIssues: number;
  defaultBranch: string; pushedAt: string; visibility: string; topics: string[];
}
interface GitHubCommit {
  sha: string; message: string; author: string; authorLogin?: string;
  authorAvatar?: string; date: string; url: string;
}
interface GitHubIssue {
  number: number; title: string; state: string; url: string;
  createdAt: string; author: string; authorAvatar: string;
  labels: { name: string; color: string }[];
}
interface GitHubData {
  repo: GitHubRepo; commits: GitHubCommit[]; issues: GitHubIssue[];
  pullRequests: GitHubIssue[]; branches: { name: string; sha: string }[];
}

const localTabs = [
  { id: 'github', label: '🐙 GitHub', file: null, icon: Github },
  { id: 'notes', label: '🦀 Notes', file: 'CLAW-NOTES.md', icon: ListChecks },
  { id: 'readme', label: '📋 README', file: 'README.md', icon: FileText },
  { id: 'docs', label: '📚 Docs', file: null, icon: BookOpen },
  { id: 'changelog', label: '📝 Changelog', file: 'CHANGELOG.md', icon: History },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr); const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return 'today'; if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago'; if (days < 30) return Math.floor(days/7) + ' weeks ago';
  return d.toLocaleDateString();
}

export default function ProjectDetailPage() {
  const { user, loading, logout } = useAuth();
  const params = useParams(); const slug = params.slug as string;
  
  const [project, setProject] = useState<Project | null>(null);
  const [activeTab, setActiveTab] = useState('github');
  const [fileContent, setFileContent] = useState<Record<string, ProjectFile>>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [githubData, setGithubData] = useState<GitHubData | null>(null);
  const [loadingGithub, setLoadingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubSubTab, setGithubSubTab] = useState<'overview'|'commits'|'issues'|'prs'>('overview');
  const [docsData, setDocsData] = useState<DocsData | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [loadingDocContent, setLoadingDocContent] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ name: '', description: '', repoUrl: '', icon: '', status: 'active' });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { if (!loading && !user) window.location.href = '/login'; }, [loading, user]);

  useEffect(() => {
    if (user && slug) {
      fetch('/api/projects/' + slug).then(r => r.json()).then(d => { if (d.ok) setProject(d.data); });
    }
  }, [user, slug]);

  useEffect(() => {
    if (activeTab !== 'github' || !project?.repoUrl || githubData) return;
    setLoadingGithub(true); setGithubError(null);
    fetch('/api/github/repo?repo=' + encodeURIComponent(project.repoUrl) + '&action=overview')
      .then(r => r.json())
      .then(d => { if (d.ok) setGithubData(d.data); else setGithubError(d.error); setLoadingGithub(false); })
      .catch(e => { setGithubError(e.message); setLoadingGithub(false); });
  }, [activeTab, project?.repoUrl, githubData]);

  useEffect(() => {
    if (!project || !slug || activeTab === 'docs' || activeTab === 'github') return;
    const tab = localTabs.find(t => t.id === activeTab);
    if (!tab?.file || fileContent[tab.file]) return;
    setLoadingFile(true);
    fetch('/api/projects/' + slug + '/files/' + encodeURIComponent(tab.file))
      .then(r => r.json())
      .then(d => { if (d.ok) setFileContent(p => ({ ...p, [tab.file!]: d.data })); setLoadingFile(false); })
      .catch(() => setLoadingFile(false));
  }, [project, slug, activeTab, fileContent]);

  useEffect(() => {
    if (activeTab !== 'docs' || !project?.repoUrl || docsData) return;
    setLoadingDocs(true);
    fetch('/api/github/docs?repo=' + encodeURIComponent(project.repoUrl) + '&action=tree')
      .then(r => r.json())
      .then(d => { if (d.ok) { setDocsData(d.data); const f = findFirstMd(d.data.tree); if (f) setSelectedDocPath(f.path); } setLoadingDocs(false); })
      .catch(() => setLoadingDocs(false));
  }, [activeTab, project?.repoUrl, docsData]);

  useEffect(() => {
    if (!selectedDocPath || !project?.repoUrl) return;
    setLoadingDocContent(true);
    fetch('/api/github/docs?repo=' + encodeURIComponent(project.repoUrl) + '&action=file&file=' + encodeURIComponent(selectedDocPath))
      .then(r => r.json())
      .then(d => { if (d.ok) setDocContent(d.data.content); setLoadingDocContent(false); })
      .catch(() => setLoadingDocContent(false));
  }, [selectedDocPath, project?.repoUrl]);

  const findFirstMd = (tree: DocFile[]): DocFile | null => {
    for (const i of tree) { if (i.type === 'file' && i.name.endsWith('.md')) return i; if (i.children) { const f = findFirstMd(i.children); if (f) return f; } }
    return null;
  };

  const toggleFolder = (p: string) => setExpandedFolders(prev => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  const openSettings = () => {
    if (project) { setSettingsForm({ name: project.name || '', description: project.description || '', repoUrl: project.repoUrl || '', icon: project.icon || '', status: project.status || 'active' }); setShowSettings(true); }
  };

  const saveSettings = async () => {
    if (!slug) return; setSavingSettings(true);
    try {
      const res = await fetch('/api/projects/' + slug, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}) }, body: JSON.stringify(settingsForm) });
      const d = await res.json();
      if (d.ok) { setProject(d.data); setShowSettings(false); setGithubData(null); setDocsData(null); setSelectedDocPath(null); setDocContent(null); }
      else alert(d.error || 'Failed');
    } catch (e) { alert((e as Error).message); }
    finally { setSavingSettings(false); }
  };

  const refreshGithub = () => { setGithubData(null); setGithubError(null); };

  const currentTab = localTabs.find(t => t.id === activeTab);
  const currentFile = currentTab?.file ? fileContent[currentTab.file] : null;

  const handleEdit = () => { if (currentFile) { setEditContent(currentFile.content); setEditing(true); } };

  const handleSave = async () => {
    if (!currentTab?.file || !slug) return; setSaving(true);
    try {
      const res = await fetch('/api/projects/' + slug + '/files/' + encodeURIComponent(currentTab.file), { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}) }, body: JSON.stringify({ content: editContent }) });
      const d = await res.json();
      if (d.ok) { setFileContent(p => ({ ...p, [currentTab.file!]: { ...p[currentTab.file!], content: editContent } })); setEditing(false); }
    } finally { setSaving(false); }
  };

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center bg-portal-bg"><div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" /></div>;
  if (!project) return <div className="h-screen bg-portal-bg flex overflow-hidden"><MainSidebar user={user} onLogout={logout} /><div className="flex-1 flex items-center justify-center"><div className="text-center"><div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full mx-auto mb-4" /><p className="text-portal-muted">Loading project...</p></div></div></div>;

  const tabs = project.repoUrl ? localTabs : localTabs.filter(t => t.id !== 'github' && t.id !== 'docs');

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-portal-border bg-portal-card/50 backdrop-blur sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/projects" className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"><ArrowLeft className="h-4 w-4" /></Link>
                <div>
                  <h1 className="text-xl font-bold text-portal-text flex items-center gap-2"><span className="text-2xl">{project.icon || '📁'}</span>{project.name}</h1>
                  {project.description && <p className="text-sm text-portal-muted">{project.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {project.repoUrl && <a href={project.repoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text bg-portal-card border border-portal-border rounded-lg transition-colors"><GitBranch className="h-4 w-4" />GitHub<ExternalLink className="h-3 w-3" /></a>}
                {user?.role?.toLowerCase() === 'admin' && <button onClick={openSettings} className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text bg-portal-card border border-portal-border rounded-lg transition-colors"><Settings className="h-4 w-4" />Settings</button>}
              </div>
            </div>
            <div className="flex gap-1 mt-4 -mb-px overflow-x-auto">
              {tabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-2 px-4 py-2 text-sm rounded-t-lg border border-b-0 transition-colors whitespace-nowrap', activeTab === tab.id ? 'bg-portal-bg border-portal-border text-portal-text' : 'bg-transparent border-transparent text-portal-muted hover:text-portal-text')}><Icon className="h-4 w-4" />{tab.label}</button>; })}
            </div>
          </div>
        </div>
        <div className="p-6">
          {activeTab === 'github' && <GitHubTab data={githubData} loading={loadingGithub} error={githubError} subTab={githubSubTab} onSubTabChange={setGithubSubTab} onRefresh={refreshGithub} repoUrl={project.repoUrl} />}
          {activeTab === 'docs' && <DocsTab data={docsData} loading={loadingDocs} selectedPath={selectedDocPath} docContent={docContent} loadingContent={loadingDocContent} expandedFolders={expandedFolders} onSelectFile={setSelectedDocPath} onToggleFolder={toggleFolder} repoUrl={project.repoUrl} />}
          {activeTab !== 'github' && activeTab !== 'docs' && <FileTab file={currentFile} loading={loadingFile} editing={editing} editContent={editContent} saving={saving} isAdmin={user?.role?.toLowerCase() === 'admin'} tabLabel={currentTab?.label} onEdit={handleEdit} onSave={handleSave} onCancel={() => { setEditing(false); setEditContent(''); }} onEditChange={setEditContent} onCreate={() => { setEditContent('# ' + (currentTab?.label || '') + '\n\n'); setEditing(true); }} />}
        </div>
      </div>
      {showSettings && <SettingsModal form={settingsForm} saving={savingSettings} onChange={setSettingsForm} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function GitHubTab({ data, loading, error, subTab, onSubTabChange, onRefresh, repoUrl }: { data: GitHubData | null; loading: boolean; error: string | null; subTab: 'overview'|'commits'|'issues'|'prs'; onSubTabChange: (t: 'overview'|'commits'|'issues'|'prs') => void; onRefresh: () => void; repoUrl: string | null; }) {
  if (!repoUrl) return <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center"><Github className="h-12 w-12 text-portal-muted mx-auto mb-4" /><p className="text-portal-muted">No GitHub repository linked</p></div>;
  if (loading) return <div className="bg-portal-card border border-portal-border rounded-xl p-12 text-center"><RefreshCw className="h-8 w-8 animate-spin text-portal-muted mx-auto" /></div>;
  if (error) return <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center"><p className="text-red-400">{error}</p><button onClick={onRefresh} className="mt-4 text-sm text-portal-muted hover:text-portal-text">Try again</button></div>;
  if (!data) return null;
  const { repo, commits, issues, pullRequests } = data;
  return (
    <div className="space-y-6">
      <div className="bg-portal-card border border-portal-border rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-portal-text">{repo.fullName}</h2>
            {repo.description && <p className="text-sm text-portal-muted mt-1">{repo.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {repo.language && <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">{repo.language}</span>}
              <span className="px-2 py-0.5 text-xs bg-portal-bg text-portal-muted rounded">{repo.visibility}</span>
              {repo.topics.slice(0,5).map(t => <span key={t} className="px-2 py-0.5 text-xs bg-portal-bg text-portal-muted rounded">{t}</span>)}
            </div>
          </div>
          <button onClick={onRefresh} className="p-2 text-portal-muted hover:text-portal-text rounded-lg transition-colors"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-6 mt-4 pt-4 border-t border-portal-border">
          <div className="flex items-center gap-2 text-sm text-portal-muted"><Star className="h-4 w-4" />{repo.stars}</div>
          <div className="flex items-center gap-2 text-sm text-portal-muted"><GitFork className="h-4 w-4" />{repo.forks}</div>
          <div className="flex items-center gap-2 text-sm text-portal-muted"><CircleDot className="h-4 w-4" />{repo.openIssues} issues</div>
          <div className="flex items-center gap-2 text-sm text-portal-muted"><GitBranch className="h-4 w-4" />{repo.defaultBranch}</div>
          <div className="flex items-center gap-2 text-sm text-portal-muted"><Clock className="h-4 w-4" />Updated {formatDate(repo.pushedAt)}</div>
        </div>
      </div>
      <div className="flex gap-2">
        {(['overview','commits','issues','prs'] as const).map(tab => <button key={tab} onClick={() => onSubTabChange(tab)} className={cn('px-4 py-2 text-sm rounded-lg transition-colors', subTab === tab ? 'bg-portal-accent text-white' : 'bg-portal-card text-portal-muted hover:text-portal-text')}>{tab === 'overview' ? 'Overview' : tab === 'commits' ? 'Commits ('+commits.length+')' : tab === 'issues' ? 'Issues ('+issues.length+')' : 'PRs ('+pullRequests.length+')'}</button>)}
      </div>
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-portal-card border border-portal-border rounded-xl">
            <div className="px-4 py-3 border-b border-portal-border flex items-center justify-between"><h3 className="text-sm font-semibold text-portal-text flex items-center gap-2"><GitCommit className="h-4 w-4 text-green-400" />Recent Commits</h3><button onClick={() => onSubTabChange('commits')} className="text-xs text-portal-muted hover:text-portal-text">View all →</button></div>
            <div className="divide-y divide-portal-border">{commits.slice(0,5).map(c => <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 hover:bg-portal-bg/50 transition-colors"><code className="text-xs text-portal-accent font-mono">{c.sha.substring(0,7)}</code><div className="flex-1 min-w-0"><p className="text-sm text-portal-text truncate">{c.message}</p><p className="text-xs text-portal-muted mt-0.5">{c.author} • {formatDate(c.date)}</p></div></a>)}</div>
          </div>
          <div className="space-y-6">
            <div className="bg-portal-card border border-portal-border rounded-xl">
              <div className="px-4 py-3 border-b border-portal-border flex items-center justify-between"><h3 className="text-sm font-semibold text-portal-text flex items-center gap-2"><CircleDot className="h-4 w-4 text-yellow-400" />Open Issues</h3><button onClick={() => onSubTabChange('issues')} className="text-xs text-portal-muted hover:text-portal-text">View all →</button></div>
              <div className="divide-y divide-portal-border">{issues.length === 0 ? <p className="px-4 py-6 text-sm text-portal-muted text-center">No open issues</p> : issues.slice(0,3).map(i => <a key={i.number} href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 hover:bg-portal-bg/50 transition-colors"><span className="text-xs text-portal-muted">#{i.number}</span><div className="flex-1 min-w-0"><p className="text-sm text-portal-text truncate">{i.title}</p><p className="text-xs text-portal-muted mt-0.5">{formatDate(i.createdAt)}</p></div></a>)}</div>
            </div>
            <div className="bg-portal-card border border-portal-border rounded-xl">
              <div className="px-4 py-3 border-b border-portal-border flex items-center justify-between"><h3 className="text-sm font-semibold text-portal-text flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-purple-400" />Pull Requests</h3><button onClick={() => onSubTabChange('prs')} className="text-xs text-portal-muted hover:text-portal-text">View all →</button></div>
              <div className="divide-y divide-portal-border">{pullRequests.length === 0 ? <p className="px-4 py-6 text-sm text-portal-muted text-center">No open PRs</p> : pullRequests.slice(0,3).map(p => <a key={p.number} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 px-4 py-3 hover:bg-portal-bg/50 transition-colors"><span className="text-xs text-portal-muted">#{p.number}</span><div className="flex-1 min-w-0"><p className="text-sm text-portal-text truncate">{p.title}</p><p className="text-xs text-portal-muted mt-0.5">{formatDate(p.createdAt)}</p></div></a>)}</div>
            </div>
          </div>
        </div>
      )}
      {subTab === 'commits' && <div className="bg-portal-card border border-portal-border rounded-xl"><div className="divide-y divide-portal-border">{commits.map(c => <a key={c.sha} href={c.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 px-4 py-3 hover:bg-portal-bg/50 transition-colors">{c.authorAvatar && <img src={c.authorAvatar} alt="" className="w-8 h-8 rounded-full" />}<div className="flex-1 min-w-0"><p className="text-sm text-portal-text">{c.message}</p><p className="text-xs text-portal-muted mt-1"><span className="font-medium">{c.authorLogin || c.author}</span> committed <code className="text-portal-accent">{c.sha.substring(0,7)}</code> • {formatDate(c.date)}</p></div></a>)}</div></div>}
      {subTab === 'issues' && <div className="bg-portal-card border border-portal-border rounded-xl"><div className="divide-y divide-portal-border">{issues.length === 0 ? <p className="px-4 py-12 text-sm text-portal-muted text-center">No open issues</p> : issues.map(i => <a key={i.number} href={i.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 px-4 py-3 hover:bg-portal-bg/50 transition-colors"><CircleDot className="h-4 w-4 text-green-400 mt-0.5" /><div className="flex-1 min-w-0"><p className="text-sm text-portal-text">{i.title}<span className="text-portal-muted ml-2">#{i.number}</span></p><div className="flex items-center gap-2 mt-1">{i.labels.map(l => <span key={l.name} className="px-1.5 py-0.5 text-[10px] rounded" style={{backgroundColor:'#'+l.color+'20',color:'#'+l.color}}>{l.name}</span>)}<span className="text-xs text-portal-muted">opened {formatDate(i.createdAt)} by {i.author}</span></div></div></a>)}</div></div>}
      {subTab === 'prs' && <div className="bg-portal-card border border-portal-border rounded-xl"><div className="divide-y divide-portal-border">{pullRequests.length === 0 ? <p className="px-4 py-12 text-sm text-portal-muted text-center">No open pull requests</p> : pullRequests.map(p => <a key={p.number} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 px-4 py-3 hover:bg-portal-bg/50 transition-colors"><GitPullRequest className="h-4 w-4 text-purple-400 mt-0.5" /><div className="flex-1 min-w-0"><p className="text-sm text-portal-text">{p.title}<span className="text-portal-muted ml-2">#{p.number}</span></p><div className="flex items-center gap-2 mt-1">{p.labels.map(l => <span key={l.name} className="px-1.5 py-0.5 text-[10px] rounded" style={{backgroundColor:'#'+l.color+'20',color:'#'+l.color}}>{l.name}</span>)}<span className="text-xs text-portal-muted">opened {formatDate(p.createdAt)} by {p.author}</span></div></div></a>)}</div></div>}
    </div>
  );
}

function DocsTab({ data, loading, selectedPath, docContent, loadingContent, expandedFolders, onSelectFile, onToggleFolder, repoUrl }: { data: DocsData | null; loading: boolean; selectedPath: string | null; docContent: string | null; loadingContent: boolean; expandedFolders: Set<string>; onSelectFile: (p: string) => void; onToggleFolder: (p: string) => void; repoUrl: string | null; }) {
  if (!repoUrl) return <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center"><BookOpen className="h-12 w-12 text-portal-muted mx-auto mb-4" /><p className="text-portal-muted">No GitHub repository linked</p></div>;
  if (loading) return <div className="bg-portal-card border border-portal-border rounded-xl p-12 text-center"><RefreshCw className="h-8 w-8 animate-spin text-portal-muted mx-auto" /></div>;
  if (!data?.hasDocsFolder) return <div className="bg-portal-card border border-portal-border rounded-xl p-8 text-center"><Folder className="h-12 w-12 text-portal-muted mx-auto mb-4" /><p className="text-portal-muted">No docs folder found</p></div>;
  return (
    <div className="flex gap-6">
      <div className="w-64 flex-shrink-0"><div className="bg-portal-card border border-portal-border rounded-xl"><div className="px-4 py-3 border-b border-portal-border"><h3 className="text-sm font-semibold text-portal-text flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-400" />Documentation</h3></div><div className="p-2 max-h-[60vh] overflow-y-auto"><DocsTree items={data.tree} selectedPath={selectedPath} expandedFolders={expandedFolders} onSelectFile={onSelectFile} onToggleFolder={onToggleFolder} /></div></div></div>
      <div className="flex-1"><div className="bg-portal-card border border-portal-border rounded-xl"><div className="flex items-center justify-between px-4 py-2 border-b border-portal-border"><span className="text-sm text-portal-muted font-mono">{selectedPath || 'Select a file'}</span>{selectedPath && <a href={repoUrl + '/blob/main/' + selectedPath} target="_blank" rel="noopener noreferrer" className="text-xs text-portal-muted hover:text-portal-text flex items-center gap-1">View on GitHub <ExternalLink className="h-3 w-3" /></a>}</div><div className="p-6">{loadingContent ? <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-portal-muted" /></div> : docContent ? <div className="prose prose-invert prose-sm max-w-none"><MarkdownRenderer content={docContent} /></div> : <div className="text-center py-12"><FileText className="h-12 w-12 text-portal-muted mx-auto mb-4" /><p className="text-portal-muted">Select a file to view</p></div>}</div></div></div>
    </div>
  );
}

function DocsTree({ items, selectedPath, expandedFolders, onSelectFile, onToggleFolder, depth = 0 }: { items: DocFile[]; selectedPath: string | null; expandedFolders: Set<string>; onSelectFile: (p: string) => void; onToggleFolder: (p: string) => void; depth?: number; }) {
  return <div className={cn(depth > 0 && 'ml-3 border-l border-portal-border pl-2')}>{items.map(i => <div key={i.path}>{i.type === 'dir' ? <><button onClick={() => onToggleFolder(i.path)} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded transition-colors">{expandedFolders.has(i.path) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{expandedFolders.has(i.path) ? <FolderOpen className="h-4 w-4 text-yellow-400" /> : <Folder className="h-4 w-4 text-yellow-400" />}<span className="truncate">{i.name}</span></button>{expandedFolders.has(i.path) && i.children && <DocsTree items={i.children} selectedPath={selectedPath} expandedFolders={expandedFolders} onSelectFile={onSelectFile} onToggleFolder={onToggleFolder} depth={depth+1} />}</> : <button onClick={() => onSelectFile(i.path)} className={cn('w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors', selectedPath === i.path ? 'bg-portal-accent/20 text-portal-accent' : 'text-portal-muted hover:text-portal-text hover:bg-portal-bg')}><File className="h-4 w-4 ml-3" /><span className="truncate">{i.name}</span></button>}</div>)}</div>;
}

function FileTab({ file, loading, editing, editContent, saving, isAdmin, tabLabel, onEdit, onSave, onCancel, onEditChange, onCreate }: { file: ProjectFile | null; loading: boolean; editing: boolean; editContent: string; saving: boolean; isAdmin: boolean; tabLabel?: string; onEdit: () => void; onSave: () => void; onCancel: () => void; onEditChange: (c: string) => void; onCreate: () => void; }) {
  return <div className="bg-portal-card border border-portal-border rounded-xl"><div className="flex items-center justify-between px-4 py-2 border-b border-portal-border"><span className="text-sm text-portal-muted">{tabLabel}</span><div className="flex items-center gap-2">{editing ? <><button onClick={onCancel} className="flex items-center gap-1 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text rounded transition-colors"><X className="h-3.5 w-3.5" /> Cancel</button><button onClick={onSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded transition-colors disabled:opacity-50"><Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save'}</button></> : isAdmin && file?.exists && <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text bg-portal-bg rounded transition-colors"><Edit3 className="h-3.5 w-3.5" /> Edit</button>}</div></div><div className="p-6">{loading ? <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-portal-muted" /></div> : editing ? <textarea value={editContent} onChange={e => onEditChange(e.target.value)} className="w-full h-[60vh] bg-portal-bg border border-portal-border rounded-lg p-4 text-sm text-portal-text font-mono focus:outline-none focus:border-portal-accent/50 resize-none" /> : file?.exists ? <div className="prose prose-invert prose-sm max-w-none"><MarkdownRenderer content={file.content} /></div> : <div className="text-center py-12"><FileText className="h-12 w-12 text-portal-muted mx-auto mb-4" /><p className="text-portal-muted mb-4">This file doesn't exist yet.</p>{isAdmin && <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm"><Edit3 className="h-4 w-4" /> Create File</button>}</div>}</div></div>;
}

function SettingsModal({ form, saving, onChange, onSave, onClose }: { form: { name: string; description: string; repoUrl: string; icon: string; status: string }; saving: boolean; onChange: (f: typeof form) => void; onSave: () => void; onClose: () => void; }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"><div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-md mx-4 shadow-2xl"><div className="flex items-center justify-between px-6 py-4 border-b border-portal-border"><h2 className="text-lg font-semibold text-portal-text">Project Settings</h2><button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text rounded transition-colors"><X className="h-5 w-5" /></button></div><div className="p-6 space-y-4"><div><label className="block text-sm text-portal-muted mb-1">Name</label><input type="text" value={form.name} onChange={e => onChange({...form, name: e.target.value})} className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent" /></div><div><label className="block text-sm text-portal-muted mb-1">Description</label><input type="text" value={form.description} onChange={e => onChange({...form, description: e.target.value})} className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent" /></div><div><label className="block text-sm text-portal-muted mb-1">GitHub Repository URL</label><input type="url" value={form.repoUrl} onChange={e => onChange({...form, repoUrl: e.target.value})} placeholder="https://github.com/user/repo" className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent" /><p className="text-xs text-portal-muted mt-1">Required for GitHub integration</p></div><div><label className="block text-sm text-portal-muted mb-1">Icon (emoji)</label><input type="text" value={form.icon} onChange={e => onChange({...form, icon: e.target.value})} placeholder="📁" className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent" /></div><div><label className="block text-sm text-portal-muted mb-1">Status</label><select value={form.status} onChange={e => onChange({...form, status: e.target.value})} className="w-full px-3 py-2 bg-portal-bg border border-portal-border rounded-lg text-portal-text text-sm focus:outline-none focus:border-portal-accent"><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div></div><div className="flex justify-end gap-3 px-6 py-4 border-t border-portal-border"><button onClick={onClose} className="px-4 py-2 text-sm text-portal-muted hover:text-portal-text rounded-lg transition-colors">Cancel</button><button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button></div></div></div>;
}

function MarkdownRenderer({ content }: { content: string }) {
  return <ReactMarkdown components={{ h1: ({children}) => <h1 className="text-2xl font-bold text-portal-text mb-4">{children}</h1>, h2: ({children}) => <h2 className="text-xl font-semibold text-portal-text mt-6 mb-3">{children}</h2>, h3: ({children}) => <h3 className="text-lg font-medium text-portal-text mt-4 mb-2">{children}</h3>, p: ({children}) => <p className="text-portal-muted mb-3">{children}</p>, ul: ({children}) => <ul className="list-disc list-inside text-portal-muted mb-3 space-y-1">{children}</ul>, ol: ({children}) => <ol className="list-decimal list-inside text-portal-muted mb-3 space-y-1">{children}</ol>, li: ({children}) => <li className="text-portal-muted">{children}</li>, code: ({children, className}) => { const isBlock = className?.includes('language-'); return isBlock ? <pre className="bg-portal-bg border border-portal-border rounded-lg p-4 overflow-x-auto mb-3"><code className="text-sm text-portal-text font-mono">{children}</code></pre> : <code className="bg-portal-bg px-1.5 py-0.5 rounded text-portal-accent text-sm font-mono">{children}</code>; }, pre: ({children}) => <>{children}</>, a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-portal-accent hover:underline">{children}</a>, blockquote: ({children}) => <blockquote className="border-l-4 border-portal-accent pl-4 italic text-portal-muted mb-3">{children}</blockquote> }}>{content}</ReactMarkdown>;
}
