'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  Plus,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Eye,
  Rocket,
  RefreshCw,
  MessageSquare,
  Palette,
  Search,
  Bug,
  LayoutDashboard,
  CreditCard,
  Wallet,
  PiggyBank,
  Settings,
  TrendingUp,
  Target,
  ChevronRight,
  X,
  Send,
  Image as ImageIcon,
  Save,
  History,
  FileText,
  Brain,
  Undo2,
  GitBranch,
  Pencil,
  Trash2,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Agent = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  icon: string | null;
  color: string | null;
  scope: string | null;
  status: 'idle' | 'working' | 'waiting_review';
  enabled: boolean;
  sortOrder: number;
  _count?: { tasks: number };
};

type AgentLog = {
  id: string;
  agentId: string;
  taskId: string | null;
  type: 'info' | 'thinking' | 'action' | 'error';
  message: string;
  metadata: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  agentId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  platforms: 'desktop' | 'mobile' | 'both';
  workSummary: string | null;
  filesChanged: string | null;
  screenshotBefore: string | null;
  screenshotAfter: string | null;
  screenshotBeforeMobile: string | null;
  screenshotAfterMobile: string | null;
  designerNotes: string | null;
  designerApproved: boolean | null;
  devilNotes: string | null;
  devilApproved: boolean | null;
  buildNumber: number | null;
  createdAt: string;
  updatedAt: string;
  agent?: Agent | null;
};

type Build = {
  id: string;
  buildNumber: number;
  version: string;
  status: string;
  taskIds: string | null;
  commitHash: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

const AGENT_ICONS: Record<string, React.ReactNode> = {
  budget: <LayoutDashboard className="h-5 w-5" />,
  transactions: <CreditCard className="h-5 w-5" />,
  accounts: <Wallet className="h-5 w-5" />,
  crypto: <TrendingUp className="h-5 w-5" />,
  goals: <Target className="h-5 w-5" />,
  settings: <Settings className="h-5 w-5" />,
  research: <Search className="h-5 w-5" />,
  designer: <Palette className="h-5 w-5" />,
  devil: <Bug className="h-5 w-5" />,
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pending', color: 'text-gray-400', icon: <Clock className="h-3.5 w-3.5" /> },
  assigned: { label: 'Assigned', color: 'text-blue-400', icon: <Play className="h-3.5 w-3.5" /> },
  in_progress: { label: 'In Progress', color: 'text-amber-400', icon: <RefreshCw className="h-3.5 w-3.5 animate-spin" /> },
  review_design: { label: 'Design Review', color: 'text-purple-400', icon: <Palette className="h-3.5 w-3.5" /> },
  review_devil: { label: 'QA Review', color: 'text-red-400', icon: <Bug className="h-3.5 w-3.5" /> },
  needs_review: { label: 'Needs Review', color: 'text-orange-400', icon: <Eye className="h-3.5 w-3.5" /> },
  approved: { label: 'Approved', color: 'text-green-400', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { label: 'Rejected', color: 'text-red-500', icon: <XCircle className="h-3.5 w-3.5" /> },
  done: { label: 'Done', color: 'text-emerald-400', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  reverted: { label: 'Reverted', color: 'text-gray-500', icon: <Undo2 className="h-3.5 w-3.5" /> },
};

const PRIORITY_LABELS = ['Low', 'Normal', 'High', 'Urgent'];

export default function AmonisPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', agentId: '', priority: 1, platforms: 'both' as 'desktop' | 'mobile' | 'both', screenshots: [] as string[] });
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [buildInProgress, setBuildInProgress] = useState(false);
  const [activeView, setActiveView] = useState<'board' | 'agents'>('board');

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, tasksRes, buildsRes] = await Promise.all([
        fetch('/api/amonis/agents'),
        fetch('/api/amonis/tasks'),
        fetch('/api/amonis/builds'),
      ]);
      
      const agentsData = await agentsRes.json();
      const tasksData = await tasksRes.json();
      const buildsData = await buildsRes.json();
      
      if (agentsData.ok) setAgents(agentsData.data);
      if (tasksData.ok) setTasks(tasksData.data);
      if (buildsData.ok) setBuilds(buildsData.data);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // Redirect to login
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  // Create task - returns task ID if successful
  const createTask = async (andStart = false): Promise<string | null> => {
    if (!newTaskForm.description.trim()) return null;
    
    // Build description with screenshots
    const fullDescription = newTaskForm.screenshots.length > 0
      ? `${newTaskForm.description}\n\n📸 Screenshots:\n${newTaskForm.screenshots.map((url, i) => `${i + 1}. ${url}`).join('\n')}`
      : newTaskForm.description;
    
    const res = await fetch('/api/amonis/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': user?.csrfToken || '' },
      body: JSON.stringify({
        ...newTaskForm,
        title: 'New Task', // Placeholder - AI will generate real title
        description: fullDescription,
      }),
    });
    
    if (res.ok) {
      const data = await res.json();
      const taskId = data.data?.id;
      
      // If "Create & Start", immediately set status to in_progress
      if (andStart && taskId) {
        await fetch(`/api/amonis/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': user?.csrfToken || '' },
          body: JSON.stringify({ status: 'in_progress' }),
        });
      }
      
      setNewTaskForm({ title: '', description: '', agentId: '', priority: 1, platforms: 'both', screenshots: [] });
      setShowNewTask(false);
      fetchData();
      return taskId;
    }
    return null;
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingScreenshot(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/amonis/upload', {
        method: 'POST',
        headers: { 'x-csrf-token': user?.csrfToken || '' },
        body: formData,
      });

      const data = await res.json();
      console.log('Upload response:', data);
      if (data.ok && data.url) {
        setNewTaskForm(prev => ({ ...prev, screenshots: [...prev.screenshots, data.url] }));
      } else {
        console.error('Upload error:', data.error);
        alert(`Upload failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed. Check console for details.');
    } finally {
      setUploadingScreenshot(false);
      e.target.value = ''; // Reset input
    }
  };

  const removeScreenshot = (index: number) => {
    setNewTaskForm(prev => ({
      ...prev,
      screenshots: prev.screenshots.filter((_, i) => i !== index),
    }));
  };

  // Handle paste for screenshots
  const handlePaste = async (e: ClipboardEvent) => {
    if (!showNewTask) return;
    
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        setUploadingScreenshot(true);
        try {
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/amonis/upload', {
            method: 'POST',
            headers: { 'x-csrf-token': user?.csrfToken || '' },
            body: formData,
          });

          const data = await res.json();
          console.log('Paste upload response:', data);
          if (data.ok && data.url) {
            setNewTaskForm(prev => ({ ...prev, screenshots: [...prev.screenshots, data.url] }));
          } else {
            console.error('Paste upload error:', data.error);
            alert(`Upload failed: ${data.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('Paste upload failed:', err);
          alert('Paste upload failed. Check console for details.');
        } finally {
          setUploadingScreenshot(false);
        }
        break;
      }
    }
  };

  // Listen for paste events when modal is open
  useEffect(() => {
    if (showNewTask) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [showNewTask, user?.csrfToken]);

  // Update task status
  const updateTaskStatus = async (taskId: string, status: string) => {
    await fetch(`/api/amonis/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': user?.csrfToken || '' },
      body: JSON.stringify({ status }),
    });
    fetchData();
    if (selectedTask?.id === taskId) {
      setSelectedTask({ ...selectedTask, status });
    }
  };

  // Trigger TestFlight build
  const triggerBuild = async () => {
    setBuildInProgress(true);
    try {
      const res = await fetch('/api/amonis/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': user?.csrfToken || '' },
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Build failed');
      }
      fetchData();
    } finally {
      setBuildInProgress(false);
    }
  };

  // Group tasks by status for kanban
  const tasksByStatus = {
    pending: tasks.filter(t => t.status === 'pending'),
    in_progress: tasks.filter(t => ['assigned', 'in_progress', 'review_design', 'review_devil'].includes(t.status)),
    needs_review: tasks.filter(t => t.status === 'needs_review'),
    done: tasks.filter(t => ['approved', 'done'].includes(t.status)),
  };

  const approvedCount = tasks.filter(t => t.status === 'approved').length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar
        user={user}
        onLogout={logout}
        activeSection="amonis"
        onSectionChange={() => {}}
        sections={[]}
        favoritesCount={0}
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex items-center justify-between px-4 py-3 pl-14 sm:pl-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-portal-text">Amonis Finance</h1>
                <p className="text-xs text-portal-muted">Agent Development System</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex bg-portal-card rounded-lg p-1">
                <button
                  onClick={() => setActiveView('board')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    activeView === 'board' ? 'bg-portal-accent text-white' : 'text-portal-muted hover:text-portal-text'
                  )}
                >
                  Board
                </button>
                <button
                  onClick={() => setActiveView('agents')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    activeView === 'agents' ? 'bg-portal-accent text-white' : 'text-portal-muted hover:text-portal-text'
                  )}
                >
                  Agents
                </button>
              </div>

              {/* New Task button */}
              <button
                onClick={() => setShowNewTask(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>

              {/* Push to TestFlight */}
              <button
                onClick={triggerBuild}
                disabled={buildInProgress || approvedCount === 0}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  approvedCount > 0
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white'
                    : 'bg-portal-card text-portal-muted cursor-not-allowed'
                )}
              >
                {buildInProgress ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Push to TestFlight
                {approvedCount > 0 && (
                  <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{approvedCount}</span>
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex">
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {activeView === 'board' ? (
              /* Kanban Board */
              <div className="grid grid-cols-4 gap-4 h-full">
                {/* Pending */}
                <KanbanColumn
                  title="To Do"
                  count={tasksByStatus.pending.length}
                  color="gray"
                  tasks={tasksByStatus.pending}
                  agents={agents}
                  onTaskClick={setSelectedTask}
                />
                
                {/* In Progress */}
                <KanbanColumn
                  title="In Progress"
                  count={tasksByStatus.in_progress.length}
                  color="amber"
                  tasks={tasksByStatus.in_progress}
                  agents={agents}
                  onTaskClick={setSelectedTask}
                />
                
                {/* Needs Review */}
                <KanbanColumn
                  title="Needs Review"
                  count={tasksByStatus.needs_review.length}
                  color="orange"
                  tasks={tasksByStatus.needs_review}
                  agents={agents}
                  onTaskClick={setSelectedTask}
                />
                
                {/* Done */}
                <KanbanColumn
                  title="Done"
                  count={tasksByStatus.done.length}
                  color="emerald"
                  tasks={tasksByStatus.done}
                  agents={agents}
                  onTaskClick={setSelectedTask}
                />
              </div>
            ) : (
              /* Agents View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    tasks={tasks.filter(t => t.agentId === agent.id)}
                    onClick={() => setSelectedAgent(agent)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Recent Builds sidebar */}
          <div className="w-72 border-l border-portal-border bg-portal-bg/50 p-4 overflow-y-auto hidden xl:block">
            <h3 className="text-xs font-semibold text-portal-muted uppercase tracking-wider mb-3">
              Recent Builds
            </h3>
            <div className="space-y-2">
              {builds.slice(0, 10).map((build) => (
                <BuildCard key={build.id} build={build} />
              ))}
              {builds.length === 0 && (
                <p className="text-xs text-portal-muted">No builds yet</p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-portal-border">
              <h3 className="text-sm font-semibold text-portal-text">New Task</h3>
              <button onClick={() => setShowNewTask(false)} className="p-1 text-portal-muted hover:text-portal-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">What do you want?</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Describe what you want done... The AI will figure out the title."
                  rows={4}
                  autoFocus
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-portal-muted mb-1">Assign to Agent (optional)</label>
                  <select
                    value={newTaskForm.agentId}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, agentId: e.target.value })}
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                  >
                    <option value="">Auto-assign</option>
                    {agents.filter(a => !['designer', 'devil'].includes(a.slug)).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-portal-muted mb-1">Priority</label>
                  <select
                    value={newTaskForm.priority}
                    onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: parseInt(e.target.value) })}
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                  >
                    {PRIORITY_LABELS.map((label, i) => (
                      <option key={i} value={i}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Platform Selection */}
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-2">Platform</label>
                <div className="flex gap-3">
                  {[
                    { value: 'desktop', label: 'Desktop', icon: '🖥️' },
                    { value: 'mobile', label: 'Mobile', icon: '📱' },
                    { value: 'both', label: 'Both', icon: '🖥️📱' },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNewTaskForm({ ...newTaskForm, platforms: option.value as 'desktop' | 'mobile' | 'both' })}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
                        newTaskForm.platforms === option.value
                          ? 'bg-portal-accent/20 border-portal-accent text-portal-accent'
                          : 'bg-portal-bg border-portal-border text-portal-muted hover:border-portal-accent/30'
                      )}
                    >
                      <span>{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Screenshots */}
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Screenshots (optional)</label>
                <div className="space-y-2">
                  {newTaskForm.screenshots.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {newTaskForm.screenshots.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt={`Screenshot ${i + 1}`} className="h-16 w-auto rounded border border-portal-border" />
                          <button
                            onClick={() => removeScreenshot(i)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className={cn(
                    "flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-portal-border rounded-lg cursor-pointer hover:border-portal-accent/50 transition-colors",
                    uploadingScreenshot && "opacity-50 pointer-events-none"
                  )}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleScreenshotUpload}
                      className="hidden"
                      disabled={uploadingScreenshot}
                    />
                    {uploadingScreenshot ? (
                      <RefreshCw className="h-4 w-4 text-portal-muted animate-spin" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-portal-muted" />
                    )}
                    <span className="text-xs text-portal-muted">
                      {uploadingScreenshot ? 'Uploading...' : 'Add screenshot'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 border-t border-portal-border">
              <button
                onClick={() => setShowNewTask(false)}
                className="px-4 py-2 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => createTask(false)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent text-white rounded-lg hover:bg-portal-accent-dark"
                >
                  <Send className="h-3.5 w-3.5" />
                  Create Task
                </button>
                <button
                  onClick={() => createTask(true)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Create & Start
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          agents={agents}
          csrfToken={user?.csrfToken}
          onClose={() => setSelectedTask(null)}
          onStatusChange={(status) => updateTaskStatus(selectedTask.id, status)}
          onRefresh={async () => {
            await fetchData();
            // Re-fetch the selected task to update modal state
            const res = await fetch(`/api/amonis/tasks/${selectedTask.id}`);
            const data = await res.json();
            if (data.ok) setSelectedTask(data.data);
          }}
          onCreateFollowUp={(parentTask) => {
            setNewTaskForm({
              title: `Follow-up: ${parentTask.title}`,
              description: `**Continues from:** ${parentTask.title}\n\n**Previous context:**\n${parentTask.description || 'No description'}\n\n---\n\n**New changes needed:**\n`,
              agentId: parentTask.agentId || '',
              priority: parentTask.priority,
              platforms: (parentTask.platforms as 'desktop' | 'mobile' | 'both') || 'both',
              screenshots: [],
            });
            setSelectedTask(null);
            setShowNewTask(true);
          }}
        />
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent}
          tasks={tasks.filter(t => t.agentId === selectedAgent.id)}
          csrfToken={user?.csrfToken}
          onClose={() => setSelectedAgent(null)}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function KanbanColumn({
  title,
  count,
  color,
  tasks,
  agents,
  onTaskClick,
}: {
  title: string;
  count: number;
  color: string;
  tasks: Task[];
  agents: Agent[];
  onTaskClick: (task: Task) => void;
}) {
  return (
    <div className="flex flex-col bg-portal-card/30 rounded-xl border border-portal-border/50">
      <div className="p-3 border-b border-portal-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-portal-text">{title}</h3>
          <span className={cn('text-xs font-medium', `text-${color}-400`)}>{count}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} agents={agents} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  agents,
  onClick,
}: {
  task: Task;
  agents: Agent[];
  onClick: () => void;
}) {
  const agent = agents.find(a => a.id === task.agentId);
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  
  return (
    <div
      onClick={onClick}
      className="bg-portal-card border border-portal-border rounded-lg p-3 cursor-pointer hover:border-portal-accent/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-portal-text line-clamp-2">{task.title}</p>
        {task.priority >= 2 && (
          <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0', task.priority === 3 ? 'text-red-400' : 'text-amber-400')} />
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {agent && (
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-white"
              style={{ backgroundColor: agent.color || '#6366f1' }}
            >
              {AGENT_ICONS[agent.slug] || <Sparkles className="h-3 w-3" />}
            </div>
          )}
          <span className={cn('flex items-center gap-1 text-[10px]', statusConfig.color)}>
            {statusConfig.icon}
            {statusConfig.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {task.platforms && task.platforms !== 'both' && (
            <span className="text-[10px]" title={task.platforms === 'desktop' ? 'Desktop only' : 'Mobile only'}>
              {task.platforms === 'desktop' ? '🖥️' : '📱'}
            </span>
          )}
          {task.platforms === 'both' && (
            <span className="text-[10px]" title="Desktop & Mobile">🖥️📱</span>
          )}
          {task.screenshotAfter && (
            <ImageIcon className="h-3.5 w-3.5 text-portal-muted" />
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent, tasks, onClick }: { agent: Agent; tasks: Task[]; onClick: () => void }) {
  const activeTasks = tasks.filter(t => !['done', 'approved', 'rejected'].includes(t.status));
  const completedTasks = tasks.filter(t => ['done', 'approved'].includes(t.status));
  
  return (
    <div 
      onClick={onClick}
      className="bg-portal-card border border-portal-border rounded-xl p-4 cursor-pointer hover:border-portal-accent/30 transition-colors"
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
          style={{ backgroundColor: agent.color || '#6366f1' }}
        >
          {AGENT_ICONS[agent.slug] || <Sparkles className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-portal-text">{agent.name}</h3>
          <p className="text-xs text-portal-muted truncate">{agent.description}</p>
        </div>
        <div
          className={cn(
            'w-2 h-2 rounded-full',
            agent.status === 'working' ? 'bg-amber-400 animate-pulse' :
            agent.status === 'waiting_review' ? 'bg-orange-400' : 'bg-gray-400'
          )}
        />
      </div>
      
      <div className="flex items-center gap-4 text-xs">
        <div>
          <span className="text-portal-muted">Active: </span>
          <span className="text-portal-text font-medium">{activeTasks.length}</span>
        </div>
        <div>
          <span className="text-portal-muted">Completed: </span>
          <span className="text-portal-text font-medium">{completedTasks.length}</span>
        </div>
      </div>
      
      {activeTasks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-portal-border space-y-1.5">
          {activeTasks.slice(0, 3).map((task) => (
            <div key={task.id} className="flex items-center gap-2 text-xs">
              <ChevronRight className="h-3 w-3 text-portal-muted" />
              <span className="text-portal-text truncate">{task.title}</span>
            </div>
          ))}
          {activeTasks.length > 3 && (
            <p className="text-[10px] text-portal-muted">+{activeTasks.length - 3} more</p>
          )}
        </div>
      )}
    </div>
  );
}

function BuildCard({ build }: { build: Build }) {
  const statusColors: Record<string, string> = {
    pending: 'text-gray-400',
    building: 'text-amber-400',
    uploading: 'text-blue-400',
    processing: 'text-purple-400',
    ready: 'text-emerald-400',
    failed: 'text-red-400',
  };
  
  return (
    <div className="bg-portal-card border border-portal-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-portal-text">
          Build #{build.buildNumber}
        </span>
        <span className={cn('text-[10px] capitalize', statusColors[build.status] || 'text-gray-400')}>
          {build.status}
        </span>
      </div>
      <div className="text-[10px] text-portal-muted">
        {new Date(build.startedAt).toLocaleString()}
      </div>
      {build.taskIds && (
        <div className="mt-1 text-[10px] text-portal-muted">
          {JSON.parse(build.taskIds).length} tasks included
        </div>
      )}
    </div>
  );
}

function buildTaskPrompt(task: Task, agent?: Agent | null): string {
  let prompt = `Task: ${task.title}`;
  
  if (task.description) {
    prompt += `\n\nDescription: ${task.description}`;
  }
  
  prompt += `\n\nPlatform: ${task.platforms || 'both'} (${
    task.platforms === 'desktop' ? 'only modify desktop layout' :
    task.platforms === 'mobile' ? 'only modify mobile layout' :
    'modify both desktop and mobile layouts'
  })`;
  
  if (agent) {
    prompt += `\n\nYou are acting as the ${agent.name}.`;
    if (agent.scope) {
      prompt += ` Focus on: ${agent.scope}`;
    }
    if (agent.systemPrompt) {
      prompt += `\n\nInstructions: ${agent.systemPrompt}`;
    }
  }
  
  prompt += `\n\nThe app runs at http://localhost:5173. When done, provide a summary of changes made.`;
  
  return prompt;
}

function TaskDetailModal({
  task,
  agents,
  csrfToken,
  onClose,
  onStatusChange,
  onRefresh,
  onCreateFollowUp,
}: {
  task: Task;
  agents: Agent[];
  csrfToken?: string;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onRefresh: () => void;
  onCreateFollowUp: (parentTask: Task) => void;
}) {
  const agent = agents.find(a => a.id === task.agentId);
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'logs'>('details');
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [previewMode, setPreviewMode] = useState<'mobile' | 'desktop'>('mobile');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('dark');
  const [reverting, setReverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: task.title,
    description: task.description || '',
    agentId: task.agentId || '',
    priority: task.priority,
    platforms: task.platforms || 'both',
  });
  const [saving, setSaving] = useState(false);

  // Fetch logs for this task
  useEffect(() => {
    if (activeTab === 'logs' && task.agentId) {
      setLogsLoading(true);
      fetch(`/api/amonis/agents/${task.agentId}/logs?taskId=${task.id}`)
        .then(r => r.json())
        .then(data => {
          if (data.ok) setLogs(data.data.filter((l: AgentLog) => l.taskId === task.id));
        })
        .catch(() => {})
        .finally(() => setLogsLoading(false));
    }
  }, [activeTab, task.agentId, task.id]);

  // Auto-refresh logs when task is in progress
  useEffect(() => {
    if (task.status === 'in_progress' && activeTab === 'logs') {
      const interval = setInterval(() => {
        fetch(`/api/amonis/agents/${task.agentId}/logs?taskId=${task.id}`)
          .then(r => r.json())
          .then(data => {
            if (data.ok) setLogs(data.data.filter((l: AgentLog) => l.taskId === task.id));
          });
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [task.status, task.agentId, task.id, activeTab]);

  const triggerTask = async () => {
    setTriggering(true);
    try {
      await fetch('/api/amonis/tasks/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
      onRefresh();
    } finally {
      setTriggering(false);
    }
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSubmittingFeedback(true);
    try {
      // Append feedback to description
      const newDescription = task.description 
        ? `${task.description}\n\n---\n**Feedback (${new Date().toLocaleString()}):**\n${feedbackText}`
        : `**Feedback (${new Date().toLocaleString()}):**\n${feedbackText}`;
      
      await fetch('/api/amonis/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          taskId: task.id, 
          status: 'assigned',  // Reset to assigned so agent picks it up again
          description: newDescription,
        }),
      });
      setFeedbackText('');
      setShowFeedback(false);
      onRefresh();
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const revertChanges = async () => {
    if (!confirm('This will revert the code changes made by the agent. Are you sure?')) return;
    setReverting(true);
    try {
      await fetch('/api/amonis/tasks/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id }),
      });
      onRefresh();
    } finally {
      setReverting(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await fetch('/api/amonis/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          title: editForm.title,
          description: editForm.description,
          agentId: editForm.agentId || null,
          priority: editForm.priority,
          platforms: editForm.platforms,
        }),
      });
      setIsEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/amonis/tasks/${task.id}`, { method: 'DELETE' });
      onClose();
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  const stopTask = async () => {
    if (!confirm('Stop this task? The agent will be interrupted.')) return;
    try {
      await fetch('/api/amonis/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: 'assigned' }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to stop task:', err);
    }
  };

  const isTriggerable = ['pending', 'assigned', 'rejected'].includes(task.status);
  const isRunning = task.status === 'in_progress';
  
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-portal-border">
          <div className="flex items-center gap-3">
            {agent && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: agent.color || '#6366f1' }}
              >
                {AGENT_ICONS[agent.slug] || <Sparkles className="h-4 w-4" />}
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-portal-text">{task.title}</h3>
              <span className={cn('flex items-center gap-1 text-xs', statusConfig.color)}>
                {isRunning && <RefreshCw className="h-3 w-3 animate-spin" />}
                {!isRunning && statusConfig.icon}
                {statusConfig.label}
                {isRunning && <span className="text-portal-muted ml-1">• Working...</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isTriggerable && !isEditing && (
              <>
                <button
                  onClick={deleteTask}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                  title="Delete task"
                >
                  {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-portal-muted border border-portal-border rounded-lg hover:bg-portal-bg hover:text-portal-text"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  onClick={triggerTask}
                  disabled={triggering}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                >
                  {triggering ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {triggering ? 'Starting...' : 'Start Task'}
                </button>
              </>
            )}
            {isRunning && (
              <>
                <button
                  onClick={stopTask}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              </>
            )}
            {isEditing && (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      title: task.title,
                      description: task.description || '',
                      agentId: task.agentId || '',
                      priority: task.priority,
                      platforms: task.platforms || 'both',
                    });
                  }}
                  className="px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving || !editForm.title.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-portal-border">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'details'
                ? 'border-portal-accent text-portal-accent'
                : 'border-transparent text-portal-muted hover:text-portal-text'
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'logs'
                ? 'border-portal-accent text-portal-accent'
                : 'border-transparent text-portal-muted hover:text-portal-text'
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Live Logs
            {isRunning && <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
          </button>
        </div>
        
        <div className="flex-1 overflow-hidden flex">
          {/* Left side - Details */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 border-r border-portal-border">
            {activeTab === 'details' ? (
              <>
                {isEditing ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-portal-muted mb-1">Title</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-portal-muted mb-1">Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={6}
                        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50 resize-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-portal-muted mb-1">Assign to Agent</label>
                        <select
                          value={editForm.agentId}
                          onChange={(e) => setEditForm({ ...editForm, agentId: e.target.value })}
                          className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                        >
                          <option value="">Auto-assign</option>
                          {agents.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-portal-muted mb-1">Priority</label>
                        <select
                          value={editForm.priority}
                          onChange={(e) => setEditForm({ ...editForm, priority: parseInt(e.target.value) })}
                          className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                        >
                          <option value={1}>Low</option>
                          <option value={2}>Medium</option>
                          <option value={3}>High</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-portal-muted mb-1">Platforms</label>
                      <div className="flex gap-2">
                        {[
                          { value: 'mobile', label: 'Mobile' },
                          { value: 'desktop', label: 'Desktop' },
                          { value: 'both', label: 'Both' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => setEditForm({ ...editForm, platforms: option.value as 'desktop' | 'mobile' | 'both' })}
                            className={cn(
                              'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                              editForm.platforms === option.value
                                ? 'bg-portal-accent/20 border-portal-accent text-portal-accent'
                                : 'border-portal-border text-portal-muted hover:text-portal-text'
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {task.description && (
                      <div>
                        <h4 className="text-xs font-medium text-portal-muted mb-1">Description</h4>
                        <p className="text-sm text-portal-text whitespace-pre-wrap">{task.description}</p>
                      </div>
                    )}

                {/* Progress indicator for running tasks */}
                {isRunning && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-emerald-400 animate-spin" />
                      <span className="text-sm text-emerald-400">Agent is working on this task...</span>
                    </div>
                    <p className="text-xs text-portal-muted mt-1">Check the Live Logs tab to see progress</p>
                  </div>
                )}
                
                {task.workSummary && (
                  <div>
                    <h4 className="text-xs font-medium text-portal-muted mb-1">Work Summary</h4>
                    <div className="bg-portal-bg rounded-lg p-3 text-sm text-portal-text whitespace-pre-wrap">
                      {task.workSummary}
                    </div>
                  </div>
                )}
                
                {task.filesChanged && (
                  <div>
                    <h4 className="text-xs font-medium text-portal-muted mb-1">Files Changed</h4>
                    <div className="bg-portal-bg rounded-lg p-3">
                      {(() => {
                        try {
                          return JSON.parse(task.filesChanged).map((file: string, i: number) => (
                            <div key={i} className="text-xs text-portal-text font-mono">{file}</div>
                          ));
                        } catch {
                          return <div className="text-xs text-portal-text font-mono">{task.filesChanged}</div>;
                        }
                      })()}
                    </div>
                  </div>
                )}
              
              {(task.screenshotBefore || task.screenshotAfter || task.screenshotBeforeMobile || task.screenshotAfterMobile) && (
                <div className="space-y-4">
                  {/* Desktop Screenshots */}
                  {(task.screenshotBefore || task.screenshotAfter) && (
                    <div>
                      <h4 className="text-xs font-medium text-portal-muted mb-2 flex items-center gap-1.5">
                        🖥️ Desktop
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {task.screenshotBefore && (
                          <div>
                            <p className="text-[10px] text-portal-muted mb-1">Before</p>
                            <img src={task.screenshotBefore} alt="Desktop Before" className="rounded-lg border border-portal-border" />
                          </div>
                        )}
                        {task.screenshotAfter && (
                          <div>
                            <p className="text-[10px] text-portal-muted mb-1">After</p>
                            <img src={task.screenshotAfter} alt="Desktop After" className="rounded-lg border border-portal-border" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Mobile Screenshots */}
                  {(task.screenshotBeforeMobile || task.screenshotAfterMobile) && (
                    <div>
                      <h4 className="text-xs font-medium text-portal-muted mb-2 flex items-center gap-1.5">
                        📱 Mobile
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        {task.screenshotBeforeMobile && (
                          <div>
                            <p className="text-[10px] text-portal-muted mb-1">Before</p>
                            <img src={task.screenshotBeforeMobile} alt="Mobile Before" className="rounded-lg border border-portal-border max-w-[200px]" />
                          </div>
                        )}
                        {task.screenshotAfterMobile && (
                          <div>
                            <p className="text-[10px] text-portal-muted mb-1">After</p>
                            <img src={task.screenshotAfterMobile} alt="Mobile After" className="rounded-lg border border-portal-border max-w-[200px]" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {task.designerNotes && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Palette className="h-4 w-4 text-purple-400" />
                    <h4 className="text-xs font-medium text-purple-400">Designer Review</h4>
                    {task.designerApproved !== null && (
                      task.designerApproved
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-400 ml-auto" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-sm text-portal-text">{task.designerNotes}</p>
                </div>
              )}
              
              {task.devilNotes && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bug className="h-4 w-4 text-red-400" />
                    <h4 className="text-xs font-medium text-red-400">QA Review</h4>
                    {task.devilApproved !== null && (
                      task.devilApproved
                        ? <CheckCircle className="h-3.5 w-3.5 text-green-400 ml-auto" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 ml-auto" />
                    )}
                  </div>
                  <p className="text-sm text-portal-text">{task.devilNotes}</p>
                </div>
              )}
                  </>
                )}
              </>
          ) : (
            /* Logs Tab */
            <div className="space-y-2">
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-portal-muted" />
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-portal-muted text-center py-8">
                  {isRunning ? 'Waiting for logs...' : 'No logs yet. Start the task to see agent activity.'}
                </p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-lg p-3 text-xs',
                      log.type === 'thinking' ? 'bg-purple-500/10 border border-purple-500/20' :
                      log.type === 'action' ? 'bg-blue-500/10 border border-blue-500/20' :
                      log.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                      'bg-portal-bg border border-portal-border'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'font-medium uppercase text-[10px]',
                        log.type === 'thinking' ? 'text-purple-400' :
                        log.type === 'action' ? 'text-blue-400' :
                        log.type === 'error' ? 'text-red-400' : 'text-portal-muted'
                      )}>
                        {log.type}
                      </span>
                      <span className="text-portal-muted">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-portal-text whitespace-pre-wrap">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          )}
          </div>

          {/* Right side - Live Preview */}
          {task.status === 'needs_review' && (
            <div className="w-96 flex flex-col bg-portal-bg/30">
              <div className="p-3 border-b border-portal-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Device selector */}
                  <div className="flex items-center gap-1 bg-portal-bg rounded-lg p-0.5">
                    <button
                      onClick={() => setPreviewMode('mobile')}
                      className={cn(
                        'px-2 py-1 text-xs rounded transition-colors',
                        previewMode === 'mobile' 
                          ? 'bg-portal-accent text-white' 
                          : 'text-portal-muted hover:text-portal-text'
                      )}
                    >
                      📱
                    </button>
                    <button
                      onClick={() => setPreviewMode('desktop')}
                      className={cn(
                        'px-2 py-1 text-xs rounded transition-colors',
                        previewMode === 'desktop' 
                          ? 'bg-portal-accent text-white' 
                          : 'text-portal-muted hover:text-portal-text'
                      )}
                    >
                      🖥️
                    </button>
                  </div>
                  {/* Theme selector */}
                  <div className="flex items-center gap-1 bg-portal-bg rounded-lg p-0.5">
                    <button
                      onClick={() => setPreviewTheme('light')}
                      className={cn(
                        'px-2 py-1 text-xs rounded transition-colors',
                        previewTheme === 'light' 
                          ? 'bg-white text-gray-800' 
                          : 'text-portal-muted hover:text-portal-text'
                      )}
                    >
                      ☀️
                    </button>
                    <button
                      onClick={() => setPreviewTheme('dark')}
                      className={cn(
                        'px-2 py-1 text-xs rounded transition-colors',
                        previewTheme === 'dark' 
                          ? 'bg-gray-800 text-white' 
                          : 'text-portal-muted hover:text-portal-text'
                      )}
                    >
                      🌙
                    </button>
                  </div>
                </div>
                <a
                  href="http://localhost:5173/demo/budget"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-portal-accent hover:underline"
                >
                  <Eye className="h-3 w-3" />
                  Open
                </a>
              </div>
              <div className="flex-1 overflow-hidden flex items-center justify-center p-3">
                {previewMode === 'mobile' ? (
                  <div 
                    className="relative rounded-[3rem] p-3 bg-black shadow-2xl"
                    style={{ width: '280px', height: '570px' }}
                  >
                    {/* Phone notch */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-b-2xl z-10" />
                    <div 
                      className={cn(
                        'w-full h-full rounded-[2.25rem] overflow-hidden pt-6',
                        previewTheme === 'light' ? 'bg-white' : 'bg-gray-900'
                      )}
                    >
                      <iframe 
                        src={`http://localhost:5173/demo/budget?theme=${previewTheme}`}
                        className="w-full h-full border-0"
                        title="App Preview"
                        style={{ 
                          transform: 'scale(0.67)',
                          transformOrigin: 'top left',
                          width: '150%',
                          height: '156%',
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div 
                    className={cn(
                      'w-full h-full rounded-lg overflow-hidden shadow-lg border border-portal-border',
                      previewTheme === 'light' ? 'bg-white' : 'bg-gray-900'
                    )}
                  >
                    <iframe 
                      src={`http://localhost:5173/demo/budget?theme=${previewTheme}`}
                      className="w-full h-full border-0"
                      title="App Preview"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Actions */}
        {['needs_review', 'done', 'approved'].includes(task.status) && (
          <div className="p-4 border-t border-portal-border">
            {showFeedback ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-portal-muted mb-1">
                    What changes are needed?
                  </label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Describe the changes you want..."
                    rows={3}
                    autoFocus
                    className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setShowFeedback(false); setFeedbackText(''); }}
                    className="px-4 py-2 text-xs text-portal-muted hover:text-portal-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitFeedback}
                    disabled={!feedbackText.trim() || submittingFeedback}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                  >
                    {submittingFeedback ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {submittingFeedback ? 'Sending...' : 'Send Feedback'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between">
                <button
                  onClick={revertChanges}
                  disabled={reverting}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-50"
                >
                  {reverting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  {reverting ? 'Reverting...' : 'Revert Changes'}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => onCreateFollowUp(task)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Follow-up Task
                  </button>
                  <button
                    onClick={() => setShowFeedback(true)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {task.status === 'needs_review' ? 'Request Changes' : 'Reopen with Changes'}
                  </button>
                  {task.status === 'needs_review' && (
                    <button
                      onClick={() => onStatusChange('approved')}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentDetailModal({
  agent,
  tasks,
  csrfToken,
  onClose,
  onRefresh,
}: {
  agent: Agent;
  tasks: Task[];
  csrfToken?: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'prompt' | 'history' | 'logs'>('overview');
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt || '');
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch logs when logs tab is selected
  useEffect(() => {
    if (activeTab === 'logs') {
      setLogsLoading(true);
      fetch(`/api/amonis/agents/${agent.id}/logs`)
        .then(r => r.json())
        .then(data => {
          if (data.ok) setLogs(data.data);
        })
        .catch(() => {})
        .finally(() => setLogsLoading(false));
    }
  }, [activeTab, agent.id]);

  const savePrompt = async () => {
    setSaving(true);
    try {
      await fetch(`/api/amonis/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken || '' },
        body: JSON.stringify({ systemPrompt }),
      });
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const activeTasks = tasks.filter(t => !['done', 'approved', 'rejected'].includes(t.status));
  const completedTasks = tasks.filter(t => ['done', 'approved'].includes(t.status));
  const recentTasks = [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 10);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-portal-border">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
              style={{ backgroundColor: agent.color || '#6366f1' }}
            >
              {AGENT_ICONS[agent.slug] || <Sparkles className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-portal-text">{agent.name}</h3>
              <p className="text-xs text-portal-muted">{agent.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'px-2 py-1 rounded text-[10px] font-medium',
                agent.status === 'working' ? 'bg-amber-500/20 text-amber-400' :
                agent.status === 'waiting_review' ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-500/20 text-gray-400'
              )}
            >
              {agent.status === 'working' ? 'Working' : agent.status === 'waiting_review' ? 'Waiting Review' : 'Idle'}
            </div>
            <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-portal-border">
          {[
            { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
            { id: 'prompt', label: 'System Prompt', icon: <Brain className="h-3.5 w-3.5" /> },
            { id: 'history', label: 'Task History', icon: <History className="h-3.5 w-3.5" /> },
            { id: 'logs', label: 'Thinking Log', icon: <FileText className="h-3.5 w-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-portal-accent text-portal-accent'
                  : 'border-transparent text-portal-muted hover:text-portal-text'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-portal-bg rounded-lg p-3">
                  <div className="text-2xl font-bold text-portal-text">{activeTasks.length}</div>
                  <div className="text-xs text-portal-muted">Active Tasks</div>
                </div>
                <div className="bg-portal-bg rounded-lg p-3">
                  <div className="text-2xl font-bold text-portal-text">{completedTasks.length}</div>
                  <div className="text-xs text-portal-muted">Completed</div>
                </div>
                <div className="bg-portal-bg rounded-lg p-3">
                  <div className="text-2xl font-bold text-portal-text">{tasks.length}</div>
                  <div className="text-xs text-portal-muted">Total Tasks</div>
                </div>
              </div>

              {/* Scope */}
              {agent.scope && (
                <div>
                  <h4 className="text-xs font-medium text-portal-muted mb-2">Scope (Files/Folders)</h4>
                  <div className="bg-portal-bg rounded-lg p-3 font-mono text-xs text-portal-text">
                    {agent.scope}
                  </div>
                </div>
              )}

              {/* Active Tasks */}
              {activeTasks.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-portal-muted mb-2">Current Tasks</h4>
                  <div className="space-y-2">
                    {activeTasks.map(task => (
                      <div key={task.id} className="bg-portal-bg rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-portal-text">{task.title}</p>
                          <p className="text-xs text-portal-muted">
                            {STATUS_CONFIG[task.status]?.label || task.status}
                          </p>
                        </div>
                        <div className={cn('text-xs', STATUS_CONFIG[task.status]?.color)}>
                          {STATUS_CONFIG[task.status]?.icon}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <p className="text-xs text-portal-muted">
                Customize this agent's behavior by editing its system prompt. This defines how the agent approaches tasks.
              </p>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={`You are the ${agent.name}. Your role is to ${agent.description?.toLowerCase() || 'help with tasks'}...`}
                rows={12}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text font-mono focus:outline-none focus:border-portal-accent/50 resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={savePrompt}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent text-white rounded-lg hover:bg-portal-accent-dark disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? 'Saving...' : 'Save Prompt'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {recentTasks.length === 0 ? (
                <p className="text-sm text-portal-muted text-center py-8">No tasks yet</p>
              ) : (
                recentTasks.map(task => (
                  <div key={task.id} className="bg-portal-bg rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-portal-text">{task.title}</p>
                      <span className={cn('flex items-center gap-1 text-[10px]', STATUS_CONFIG[task.status]?.color)}>
                        {STATUS_CONFIG[task.status]?.icon}
                        {STATUS_CONFIG[task.status]?.label}
                      </span>
                    </div>
                    <p className="text-xs text-portal-muted">
                      {new Date(task.updatedAt).toLocaleDateString()} at {new Date(task.updatedAt).toLocaleTimeString()}
                    </p>
                    {task.workSummary && (
                      <p className="text-xs text-portal-text mt-2 line-clamp-2">{task.workSummary}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-2">
              {logsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin text-portal-muted" />
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-portal-muted text-center py-8">No logs yet. Logs will appear when the agent works on tasks.</p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    className={cn(
                      'rounded-lg p-3 text-xs',
                      log.type === 'thinking' ? 'bg-purple-500/10 border border-purple-500/20' :
                      log.type === 'action' ? 'bg-blue-500/10 border border-blue-500/20' :
                      log.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                      'bg-portal-bg border border-portal-border'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        'font-medium uppercase text-[10px]',
                        log.type === 'thinking' ? 'text-purple-400' :
                        log.type === 'action' ? 'text-blue-400' :
                        log.type === 'error' ? 'text-red-400' : 'text-portal-muted'
                      )}>
                        {log.type}
                      </span>
                      <span className="text-portal-muted">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-portal-text whitespace-pre-wrap">{log.message}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
