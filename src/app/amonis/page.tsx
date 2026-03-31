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
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Agent = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  scope: string | null;
  status: 'idle' | 'working' | 'waiting_review';
  enabled: boolean;
  sortOrder: number;
  _count?: { tasks: number };
};

type Task = {
  id: string;
  agentId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  workSummary: string | null;
  filesChanged: string | null;
  screenshotBefore: string | null;
  screenshotAfter: string | null;
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
};

const PRIORITY_LABELS = ['Low', 'Normal', 'High', 'Urgent'];

export default function AmonisPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: '', description: '', agentId: '', priority: 1 });
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

  // Create task
  const createTask = async () => {
    if (!newTaskForm.title.trim()) return;
    
    const res = await fetch('/api/amonis/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': user?.csrfToken || '' },
      body: JSON.stringify(newTaskForm),
    });
    
    if (res.ok) {
      setNewTaskForm({ title: '', description: '', agentId: '', priority: 1 });
      setShowNewTask(false);
      fetchData();
    }
  };

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
                <label className="block text-xs font-medium text-portal-muted mb-1">Task Title</label>
                <input
                  type="text"
                  value={newTaskForm.title}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  placeholder="e.g., Make the pie chart thicker"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-portal-accent/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Description (optional)</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
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
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-portal-border">
              <button
                onClick={() => setShowNewTask(false)}
                className="px-4 py-2 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover"
              >
                Cancel
              </button>
              <button
                onClick={createTask}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent text-white rounded-lg hover:bg-portal-accent-dark"
              >
                <Send className="h-3.5 w-3.5" />
                Create Task
              </button>
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
        {task.screenshotAfter && (
          <ImageIcon className="h-3.5 w-3.5 text-portal-muted" />
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, tasks }: { agent: Agent; tasks: Task[] }) {
  const activeTasks = tasks.filter(t => !['done', 'approved', 'rejected'].includes(t.status));
  const completedTasks = tasks.filter(t => ['done', 'approved'].includes(t.status));
  
  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
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

function TaskDetailModal({
  task,
  agents,
  csrfToken,
  onClose,
  onStatusChange,
  onRefresh,
}: {
  task: Task;
  agents: Agent[];
  csrfToken?: string;
  onClose: () => void;
  onStatusChange: (status: string) => void;
  onRefresh: () => void;
}) {
  const agent = agents.find(a => a.id === task.agentId);
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
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
                {statusConfig.icon}
                {statusConfig.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {task.description && (
            <div>
              <h4 className="text-xs font-medium text-portal-muted mb-1">Description</h4>
              <p className="text-sm text-portal-text">{task.description}</p>
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
                {JSON.parse(task.filesChanged).map((file: string, i: number) => (
                  <div key={i} className="text-xs text-portal-text font-mono">{file}</div>
                ))}
              </div>
            </div>
          )}
          
          {(task.screenshotBefore || task.screenshotAfter) && (
            <div>
              <h4 className="text-xs font-medium text-portal-muted mb-2">Screenshots</h4>
              <div className="grid grid-cols-2 gap-4">
                {task.screenshotBefore && (
                  <div>
                    <p className="text-[10px] text-portal-muted mb-1">Before</p>
                    <img src={task.screenshotBefore} alt="Before" className="rounded-lg border border-portal-border" />
                  </div>
                )}
                {task.screenshotAfter && (
                  <div>
                    <p className="text-[10px] text-portal-muted mb-1">After</p>
                    <img src={task.screenshotAfter} alt="After" className="rounded-lg border border-portal-border" />
                  </div>
                )}
              </div>
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
        </div>
        
        {/* Actions */}
        {task.status === 'needs_review' && (
          <div className="flex justify-end gap-2 p-4 border-t border-portal-border">
            <button
              onClick={() => onStatusChange('rejected')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10"
            >
              <XCircle className="h-3.5 w-3.5" />
              Request Changes
            </button>
            <button
              onClick={() => onStatusChange('approved')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
