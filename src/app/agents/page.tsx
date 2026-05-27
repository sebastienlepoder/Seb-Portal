'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { cn, formatRelativeTime, extractPastedImages } from '@/lib/utils';
import {
  AlertTriangle,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  DollarSign,
  ExternalLink,
  FileText,
  GitMerge,
  HelpCircle,
  LayoutGrid,
  List,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Settings,
  Sparkles,
  StopCircle,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import type {
  AgentSummary,
  ProjectSummary,
  TaskDTO,
  TaskLogDTO,
  TaskPriority,
} from '@/types/agents';

interface AgentListItem extends AgentSummary {
  description: string | null;
  inFlightTaskCount: number;
}

interface WorkerStatus {
  workerId: string;
  lastSeen: string;
  status: 'running' | 'draining' | 'stopped';
  inFlight: number;
  concurrency: number;
  ageSec: number;
  active: boolean;
  hasAnthropicKey: boolean;
  hasMaxOauth?: boolean;
  hasGithubToken: boolean;
}

interface DispatcherInitialValues {
  project_name: string;
  agent_slug: string;
  title: string;
  description: string;
  priority: TaskPriority;
  auto_merge: boolean;
  parent_task_id?: string | null;
  parent_task_title?: string | null;
}

const STATUS_LABEL: Record<TaskDTO['status'], string> = {
  pending: 'Queued',
  queued: 'Queued',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<TaskDTO['status'], string> = {
  pending: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  queued: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  needs_review: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  completed: 'bg-green-500/10 text-green-300 border-green-500/30',
  failed: 'bg-red-500/10 text-red-300 border-red-500/30',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: 'text-gray-400',
  normal: 'text-blue-300',
  high: 'text-orange-300',
  urgent: 'text-red-300',
};

const TERMINAL: TaskDTO['status'][] = ['completed', 'failed', 'cancelled'];

export default function AgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [agents, setAgents] = useState<AgentListItem[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [anyWorkerActive, setAnyWorkerActive] = useState<boolean | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showDispatcher, setShowDispatcher] = useState(false);
  const [dispatcherInitialValues, setDispatcherInitialValues] =
    useState<DispatcherInitialValues | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [openTaskDetail, setOpenTaskDetail] = useState<
    (TaskDTO & { logs: TaskLogDTO[] }) | null
  >(null);
  /** Parent task ids whose sub-tasks are hidden. Persisted in localStorage. */
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  // Hydrate collapsed-parents from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('agents:collapsed-parents');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) setCollapsedParents(new Set(arr.map(String)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCollapse(parentId: string) {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      try {
        window.localStorage.setItem(
          'agents:collapsed-parents',
          JSON.stringify(Array.from(next))
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };

  // Initial loaders
  useEffect(() => {
    if (!authLoading && !user) window.location.href = '/login';
  }, [authLoading, user]);

  const fetchAgents = useCallback(() => {
    fetch('/api/ai-hub/agents')
      .then((r) => r.json())
      .then((d) => d.ok && setAgents(d.data))
      .catch(() => {});
  }, []);

  const fetchProjects = useCallback(() => {
    fetch('/api/ai-hub/projects')
      .then((r) => r.json())
      .then((d) => d.ok && setProjects(d.data))
      .catch(() => {});
  }, []);

  const fetchWorkers = useCallback(() => {
    fetch('/api/ai-hub/workers')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setWorkers(d.data.workers);
          setAnyWorkerActive(d.data.anyActive);
        }
      })
      .catch(() => {});
  }, []);

  const fetchTasks = useCallback(() => {
    const url =
      statusFilter === 'active'
        ? '/api/ai-hub/tasks?status=pending,queued,in_progress,needs_review&limit=200'
        : '/api/ai-hub/tasks?limit=200';
    fetch(url)
      .then((r) => r.json())
      .then((d) => d.ok && setTasks(d.data))
      .catch(() => {});
  }, [statusFilter]);

  useEffect(() => {
    if (!user) return;
    fetchAgents();
    fetchProjects();
    fetchTasks();
    fetchWorkers();
  }, [user, fetchAgents, fetchProjects, fetchTasks, fetchWorkers]);

  // Polling: every 2s while at least one task is in flight, otherwise 5s.
  useEffect(() => {
    if (!user) return;
    const anyInFlight = tasks.some((t) => !TERMINAL.includes(t.status));
    const interval = anyInFlight ? 2000 : 5000;
    const id = setInterval(() => {
      fetchTasks();
      fetchAgents();
      fetchWorkers();
    }, interval);
    return () => clearInterval(id);
  }, [user, tasks, fetchTasks, fetchAgents, fetchWorkers]);

  // When a task detail modal is open, refresh that task too.
  useEffect(() => {
    if (!openTaskId) {
      setOpenTaskDetail(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch(`/api/ai-hub/tasks/${openTaskId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.ok) setOpenTaskDetail(d.data);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [openTaskId]);

  /**
   * Render order: each top-level task is followed by its sub-tasks
   * (oldest-first, in dispatch order). Orphan sub-tasks (whose parent
   * isn't in the current view) appear at the end so the user still
   * sees them. Sub-tasks under collapsed parents are skipped.
   */
  const displayedTasks = useMemo(() => {
    const childrenByParent = new Map<string, TaskDTO[]>();
    for (const t of tasks) {
      if (t.parentTaskId) {
        const arr = childrenByParent.get(t.parentTaskId) ?? [];
        arr.push(t);
        childrenByParent.set(t.parentTaskId, arr);
      }
    }
    for (const arr of childrenByParent.values()) {
      arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    const visibleIds = new Set(tasks.map((t) => t.id));
    const out: TaskDTO[] = [];
    for (const t of tasks) {
      if (t.parentTaskId) continue;
      out.push(t);
      if (collapsedParents.has(t.id)) continue;
      out.push(...(childrenByParent.get(t.id) ?? []));
    }
    // Orphans: sub-tasks whose parent isn't visible in current view
    for (const t of tasks) {
      if (!t.parentTaskId) continue;
      if (!visibleIds.has(t.parentTaskId)) out.push(t);
    }
    return out;
  }, [tasks, collapsedParents]);

  /** Count of sub-tasks for each parent id (across the full tasks list, not just visible). */
  const childCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (!t.parentTaskId) continue;
      m.set(t.parentTaskId, (m.get(t.parentTaskId) ?? 0) + 1);
    }
    return m;
  }, [tasks]);

  const stats = useMemo(() => {
    const counts: {
      queued: number;
      in_progress: number;
      needs_review: number;
      completed: number;
      failed: number;
      cancelled: number;
    } = {
      queued: 0,
      in_progress: 0,
      needs_review: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const t of tasks) {
      if (t.status === 'pending' || t.status === 'queued') counts.queued++;
      else counts[t.status]++;
    }
    return counts;
  }, [tasks]);

  const csrfToken = (user as { csrfToken?: string } | null)?.csrfToken;

  const deleteTask = useCallback(
    async (taskId: string) => {
      const isOrchestrator =
        tasks.find((x) => x.id === taskId)?.agentProfile?.slug === 'orchestrator';
      const message = isOrchestrator
        ? 'Delete this orchestrator task and all of its sub-tasks? This cannot be undone.'
        : 'Delete this task? This cannot be undone.';
      if (!window.confirm(message)) return;
      try {
        const res = await fetch(`/api/ai-hub/tasks/${taskId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          window.alert(data.error || `Delete failed (${res.status})`);
          return;
        }
        fetchTasks();
      } catch (e) {
        window.alert((e as Error).message);
      }
    },
    [tasks, csrfToken, fetchTasks]
  );

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-6 w-6 animate-spin text-portal-accent" />
      </div>
    );
  }

  const closeDispatcher = () => {
    setShowDispatcher(false);
    setDispatcherInitialValues(null);
  };

  const handleRetask = (d: TaskDTO) => {
    setDispatcherInitialValues({
      project_name: d.project.slug,
      agent_slug: d.agentProfile?.slug ?? '',
      title: d.title,
      description: d.description,
      priority: d.priority,
      auto_merge: false,
    });
    setOpenTaskId(null);
    setShowDispatcher(true);
  };

  const handleFollowUp = (d: TaskDTO) => {
    setDispatcherInitialValues({
      project_name: d.project.slug,
      agent_slug: d.agentProfile?.slug ?? '',
      title: '',
      description: '',
      priority: d.priority,
      auto_merge: false,
      parent_task_id: d.id,
      parent_task_title: d.title,
    });
    setOpenTaskId(null);
    setShowDispatcher(true);
  };


  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div className="pl-12 sm:pl-0">
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <Bot className="h-6 w-6 text-portal-accent" />
                Agents
              </h1>
              <p className="text-sm text-portal-muted">
                Dispatch development tasks to specialized AI workers
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Link
                href="/agents/costs"
                className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/50 text-portal-text rounded-lg transition-colors duration-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                title="Cost monitoring"
              >
                <DollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">Costs</span>
              </Link>
              <Link
                href="/agents/help"
                className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/50 text-portal-text rounded-lg transition-colors duration-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                title="Help & documentation"
              >
                <HelpCircle className="h-4 w-4" />
              </Link>
              <button
                onClick={() => {
                  setDispatcherInitialValues(null);
                  setShowDispatcher(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg transition-colors duration-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
              >
                <Send className="h-4 w-4" />
                New task
              </button>
              {user.role === 'admin' && (
                <a
                  href="/admin/agents"
                  className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:border-portal-accent/50 text-portal-text rounded-lg transition-colors duration-200 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  title="Manage agents"
                >
                  <Settings className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          {/* Worker status banner */}
          {anyWorkerActive === false && (
            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-yellow-300" />
              <div className="flex-1 text-sm">
                <div className="font-medium text-yellow-100">No worker is running.</div>
                <div className="text-yellow-200/80 mt-0.5">
                  Tasks will sit in <span className="font-mono">queued</span> until a worker picks them up.{' '}
                  <Link href="/agents/help#starting-the-worker" className="underline hover:text-yellow-100">
                    How to start the worker →
                  </Link>
                </div>
              </div>
            </div>
          )}
          {anyWorkerActive === true && workers.some((w) => w.active && !w.hasAnthropicKey && !w.hasMaxOauth) && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-300" />
              <div className="flex-1 text-sm">
                <div className="font-medium text-red-100">
                  Worker has no Claude credentials.
                </div>
                <div className="text-red-200/80 mt-0.5">
                  Tasks will fail immediately. Either mount{' '}
                  <span className="font-mono">~/.claude/.credentials.json</span> from{' '}
                  <span className="font-mono">claude login</span> (Max subscription) or set{' '}
                  <span className="font-mono">ANTHROPIC_API_KEY</span> in the worker&apos;s environment,
                  then restart it.
                </div>
              </div>
            </div>
          )}

          {/* Stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6 text-xs">
            {(
              [
                ['queued', 'Queued'],
                ['in_progress', 'In progress'],
                ['needs_review', 'Needs review'],
                ['completed', 'Completed'],
                ['failed', 'Failed'],
                ['cancelled', 'Cancelled'],
              ] as const
            ).map(([k, label]) => (
              <div
                key={k}
                className={cn(
                  'rounded-lg border px-3 py-2 flex items-baseline justify-between',
                  STATUS_CLASS[k]
                )}
              >
                <span>{label}</span>
                <span className="font-mono text-base">{stats[k]}</span>
              </div>
            ))}
          </div>

          {/* Task queue */}
          <section>
            <div className="bg-portal-card border border-portal-border rounded-xl">
              <div className="px-4 py-3 border-b border-portal-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-portal-accent" /> Task queue
                </h2>
                <div className="flex items-center gap-2">
                  {/* View toggle */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setViewMode('list')}
                      title="List view"
                      aria-pressed={viewMode === 'list'}
                      className={cn(
                        'p-1.5 rounded border transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
                        viewMode === 'list'
                          ? 'bg-portal-accent/10 text-portal-accent border-portal-accent/30'
                          : 'bg-portal-bg border-portal-border text-portal-muted hover:text-portal-text'
                      )}
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setViewMode('kanban')}
                      title="Board view"
                      aria-pressed={viewMode === 'kanban'}
                      className={cn(
                        'p-1.5 rounded border transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
                        viewMode === 'kanban'
                          ? 'bg-portal-accent/10 text-portal-accent border-portal-accent/30'
                          : 'bg-portal-bg border-portal-border text-portal-muted hover:text-portal-text'
                      )}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="w-px h-4 bg-portal-border" aria-hidden="true" />
                  {/* Status filter */}
                  <div className="flex gap-1 text-xs">
                    <FilterBtn
                      active={statusFilter === 'active'}
                      onClick={() => setStatusFilter('active')}
                    >
                      Active
                    </FilterBtn>
                    <FilterBtn
                      active={statusFilter === 'all'}
                      onClick={() => setStatusFilter('all')}
                    >
                      All
                    </FilterBtn>
                  </div>
                </div>
              </div>
              {viewMode === 'kanban' ? (
                <div className="p-4">
                  <KanbanBoard tasks={tasks} onTaskClick={setOpenTaskId} />
                </div>
              ) : (
              <div className="divide-y divide-portal-border max-h-[70vh] overflow-y-auto">
                {tasks.length === 0 ? (
                  <div className="p-6 text-center text-sm text-portal-muted">
                    No tasks {statusFilter === 'active' ? 'in flight' : 'yet'}.{' '}
                    <button
                      onClick={() => {
                        setDispatcherInitialValues(null);
                        setShowDispatcher(true);
                      }}
                      className="text-portal-accent hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded"
                    >
                      Dispatch one →
                    </button>
                  </div>
                ) : (
                  displayedTasks.map((t) => {
                    const isOrchestrator = t.agentProfile?.slug === 'orchestrator';
                    // Prefer the parent's title from the in-memory tasks (live
                    // updates), fall back to the server-provided parentTitle
                    // so orphan sub-tasks still show context.
                    const parentTitle = t.parentTaskId
                      ? tasks.find((x) => x.id === t.parentTaskId)?.title ??
                        t.parentTitle ??
                        null
                      : null;
                    const childCount = isOrchestrator
                      ? childCountByParent.get(t.id) ?? 0
                      : 0;
                    const hasChildren = childCount > 0;
                    const isCollapsed = collapsedParents.has(t.id);
                    const isTerminal = TERMINAL.includes(t.status);
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpenTaskId(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            if (e.key === ' ') e.preventDefault();
                            setOpenTaskId(t.id);
                          }
                        }}
                        className={cn(
                          'w-full text-left p-3 hover:bg-portal-card-hover/50 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent focus:ring-inset',
                          t.parentTaskId && 'pl-8 border-l-2 border-portal-accent/20 ml-3'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {hasChildren ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapse(t.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleCollapse(t.id);
                                }
                              }}
                              title={isCollapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks'}
                              className="shrink-0 mt-0.5 p-0.5 -ml-1 rounded hover:bg-portal-card-hover text-portal-muted hover:text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </span>
                          ) : t.parentTaskId ? (
                            <div className="text-portal-muted text-sm shrink-0 mt-0.5">↳</div>
                          ) : (
                            <div className="text-lg shrink-0 mt-0.5">
                              {t.project.icon ?? '📦'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-portal-text truncate">
                                {t.title}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] rounded-full px-2 py-0.5 border',
                                  STATUS_CLASS[t.status]
                                )}
                              >
                                {STATUS_LABEL[t.status]}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] font-medium',
                                  PRIORITY_CLASS[t.priority]
                                )}
                              >
                                {t.priority}
                              </span>
                              {isOrchestrator && (
                                <span className="text-[10px] rounded-full px-2 py-0.5 border bg-portal-accent/10 text-portal-accent border-portal-accent/30">
                                  orchestrated · {childCount}{' '}
                                  {childCount === 1 ? 'sub-task' : 'sub-tasks'}
                                  {hasChildren && isCollapsed && ' (hidden)'}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-portal-muted mt-1 truncate">
                              {t.project.name}
                              {t.agentProfile
                                ? ` · ${t.agentProfile.name} (${t.agentProfile.role})`
                                : ''}
                              {parentTitle && (
                                <span className="ml-1">
                                  · sub-task of &quot;{parentTitle}&quot;
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-portal-muted mt-0.5">
                              {formatRelativeTime(t.createdAt)}
                              {t.workerStartedAt &&
                                ` · started ${formatRelativeTime(t.workerStartedAt)}`}
                              {t.completedAt &&
                                ` · finished ${formatRelativeTime(t.completedAt)}`}
                            </div>
                          </div>
                          {t.status === 'in_progress' && (
                            <Loader2 className="h-4 w-4 animate-spin text-yellow-300 shrink-0 mt-1" />
                          )}
                          {isTerminal && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTask(t.id);
                              }}
                              onKeyDown={(e) => e.stopPropagation()}
                              aria-label="Delete task"
                              title="Delete task"
                              className="shrink-0 p-1.5 rounded text-portal-muted hover:text-red-300 hover:bg-red-500/10 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {showDispatcher && (
        <DispatcherModal
          onClose={closeDispatcher}
          projects={projects}
          agents={agents}
          csrfToken={csrfToken}
          initialValues={dispatcherInitialValues}
          onDispatched={(taskId) => {
            closeDispatcher();
            fetchTasks();
            setOpenTaskId(taskId);
          }}
        />
      )}

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          detail={openTaskDetail}
          agents={agents}
          csrfToken={csrfToken}
          onClose={() => setOpenTaskId(null)}
          onChanged={fetchTasks}
          onRetask={handleRetask}
          onFollowUp={handleFollowUp}
        />
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded border transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
        active
          ? 'bg-portal-accent/10 text-portal-accent border-portal-accent/30'
          : 'bg-portal-bg border-portal-border text-portal-muted hover:text-portal-text'
      )}
    >
      {children}
    </button>
  );
}

function DispatcherModal({
  projects,
  agents,
  csrfToken,
  initialValues,
  onClose,
  onDispatched,
}: {
  projects: ProjectSummary[];
  agents: AgentListItem[];
  csrfToken: string | undefined;
  initialValues: DispatcherInitialValues | null;
  onClose: () => void;
  onDispatched: (taskId: string) => void;
}) {
  const [projectName, setProjectName] = useState(
    initialValues?.project_name ?? projects[0]?.slug ?? ''
  );
  const [agentSlug, setAgentSlug] = useState<string>(initialValues?.agent_slug ?? '');
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(
    initialValues?.priority ?? 'normal'
  );
  const [autoMerge, setAutoMerge] = useState(initialValues?.auto_merge ?? false);
  const [parentTaskId, setParentTaskId] = useState<string | null>(
    initialValues?.parent_task_id ?? null,
  );
  const [parentTaskTitle, setParentTaskTitle] = useState<string | null>(
    initialValues?.parent_task_title ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<
    { dataUri: string; filename?: string }[]
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!e.clipboardData) return;
    const { items, error: extractError, hadImage } = await extractPastedImages(
      e.clipboardData,
      attachments.length,
    );
    if (hadImage) e.preventDefault();
    if (items.length > 0) {
      setAttachments((prev) => [...prev, ...items]);
    }
    setAttachmentError(extractError);
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!title.trim() || !description.trim() || !projectName) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-hub/dispatch-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          project_name: projectName,
          task_title: title.trim(),
          task_description: description.trim(),
          agent_role: agentSlug || null,
          priority,
          auto_merge: autoMerge,
          parent_task_id: parentTaskId || undefined,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Dispatch failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      onDispatched(data.taskId);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      title={parentTaskId ? 'Submit a follow-up task' : 'Dispatch a new task'}
    >
      <div className="space-y-3">
        {parentTaskId && (
          <div className="bg-portal-accent/5 border border-portal-accent/20 rounded-md px-3 py-2 text-xs text-portal-text flex items-start gap-2">
            <CornerDownRight className="h-3.5 w-3.5 mt-0.5 text-portal-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-portal-text">Follow-up to previous task</div>
              <div className="text-portal-muted truncate">&quot;{parentTaskTitle}&quot;</div>
              <div className="text-portal-muted mt-0.5">
                The agent will receive the original task&apos;s instructions, result, and any error as context.
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setParentTaskId(null); setParentTaskTitle(null); }}
              className="text-portal-muted hover:text-portal-text shrink-0 p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-portal-accent"
              aria-label="Clear follow-up link"
              title="Clear follow-up link"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <Field label="Project">
          <select
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            {projects.length === 0 ? (
              <option value="">— no projects configured —</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.icon ?? '📦'} {p.name}
                </option>
              ))
            )}
          </select>
        </Field>

        <Field label="Agent (optional — auto-match if empty)">
          <select
            value={agentSlug}
            onChange={(e) => setAgentSlug(e.target.value)}
            className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            <option value="">— auto —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.slug}>
                {a.name} · {a.role}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              parentTaskId
                ? 'e.g. Also handle the empty state'
                : 'e.g. Add search bar to dashboard'
            }
            className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onPaste={handlePaste}
            placeholder={
              parentTaskId
                ? 'What should the agent do next? It already knows what was done in the previous task.'
                : 'Detailed instructions for the agent… Paste a screenshot to attach an image.'
            }
            rows={6}
            className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text font-mono resize-y focus:outline-none focus:ring-2 focus:ring-portal-accent"
          />
        </Field>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="relative h-16 w-16 rounded-md overflow-hidden bg-portal-bg border border-portal-border"
                title={att.filename ?? 'Pasted screenshot'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.dataUri}
                  alt={att.filename ?? 'Pasted screenshot preview'}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  aria-label="Remove pasted image"
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentError && (
          <div className="text-xs text-red-300">{attachmentError}</div>
        )}

        <Field label="Priority">
          <div className="flex gap-1">
            {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded border text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
                  priority === p
                    ? 'bg-portal-accent/10 border-portal-accent/40 text-portal-accent'
                    : 'bg-portal-bg border-portal-border text-portal-muted hover:text-portal-text'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {/* Auto-merge toggle */}
        <label
          htmlFor="auto-merge"
          className={cn(
            'flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors duration-200',
            autoMerge
              ? 'bg-portal-accent/10 border-portal-accent/40'
              : 'bg-portal-bg border-portal-border hover:border-portal-accent/40'
          )}
        >
          <input
            id="auto-merge"
            type="checkbox"
            checked={autoMerge}
            onChange={(e) => setAutoMerge(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-portal-border bg-portal-bg accent-portal-accent cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium text-portal-text">
              <GitMerge
                className={cn(
                  'h-3.5 w-3.5',
                  autoMerge ? 'text-portal-accent' : 'text-portal-muted'
                )}
              />
              Merge to main automatically
            </div>
            <p className="text-xs text-portal-muted mt-0.5">
              When the agent finishes, merge its pull request into{' '}
              <span className="font-mono">main</span> directly — no manual GitHub
              review needed.
            </p>
          </div>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-portal-muted hover:text-portal-text transition-colors duration-200 cursor-pointer rounded-md focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !title.trim() || !description.trim() || !projectName}
            className="px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm flex items-center gap-2 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : autoMerge ? (
              <GitMerge className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {autoMerge
              ? 'Dispatch & merge'
              : parentTaskId
                ? 'Submit follow-up'
                : 'Dispatch'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

type DetailTab = 'task' | 'output' | 'logs' | 'actions';

function TaskDetailModal({
  taskId,
  detail,
  agents,
  csrfToken,
  onClose,
  onChanged,
  onRetask,
  onFollowUp,
}: {
  taskId: string;
  detail: (TaskDTO & { logs: TaskLogDTO[] }) | null;
  agents: AgentListItem[];
  csrfToken: string | undefined;
  onClose: () => void;
  onChanged: () => void;
  onRetask: (detail: TaskDTO) => void;
  onFollowUp: (detail: TaskDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('task');
  const [autoSwitched, setAutoSwitched] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const logsScrollRef = useRef<HTMLDivElement>(null);

  async function callPatch(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    const actionName =
      typeof body.action === 'string' ? body.action : null;
    setActiveAction(actionName);
    setError(null);
    let ok = false;
    try {
      const res = await fetch(`/api/ai-hub/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Failed (${res.status})`);
      } else {
        ok = true;
      }
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setActiveAction(null);
    }
    return ok;
  }

  async function deleteTask() {
    const isOrchestrator = detail?.agentProfile?.slug === 'orchestrator';
    const message = isOrchestrator
      ? 'Delete this orchestrator task and all of its sub-tasks? This cannot be undone.'
      : 'Delete this task? This cannot be undone.';
    if (!window.confirm(message)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-hub/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `Delete failed (${res.status})`);
        setDeleting(false);
        return;
      }
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  const isTerminal = detail ? TERMINAL.includes(detail.status) : false;
  const isInFlight = detail?.status === 'in_progress';
  const isNeedsReview = detail?.status === 'needs_review';
  const isMerged = !!detail?.mergedAt;
  const canRetask =
    detail?.status === 'failed' || detail?.status === 'cancelled';
  const showMergeAndReview =
    isNeedsReview && !isMerged && detail?.resultType === 'pr';
  const hasOutput = !!(detail?.resultSummary || detail?.resultUrl || detail?.errorMessage);

  // Auto-switch to Output tab when the task completes with output — but only
  // if the user hasn't navigated away from the default Task tab yet.
  useEffect(() => {
    if (autoSwitched) return;
    if (!detail) return;
    if (activeTab !== 'task') {
      setAutoSwitched(true);
      return;
    }
    if (isTerminal && hasOutput) {
      setActiveTab('output');
      setAutoSwitched(true);
    }
  }, [detail, isTerminal, hasOutput, activeTab, autoSwitched]);

  // Auto-scroll logs to the bottom when new log lines arrive on the Logs tab.
  useEffect(() => {
    if (activeTab !== 'logs') return;
    const el = logsScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeTab, detail?.logs.length]);

  async function handleMarkReviewed() {
    const ok = await callPatch({ action: 'mark_reviewed' });
    if (ok) onClose();
  }

  async function handleMergeAndReview() {
    if (
      !window.confirm(
        'Merge this PR into the working branch and mark the task reviewed?'
      )
    )
      return;
    const ok = await callPatch({ action: 'merge_and_review' });
    if (ok) onClose();
  }

  async function handleUndo() {
    if (
      !window.confirm(
        'Undo this task? If a PR is still open it will be closed. Merged work is NOT auto-reverted.'
      )
    )
      return;
    const ok = await callPatch({ action: 'undo' });
    if (ok) onClose();
  }

  async function handleCopyOutput() {
    if (!detail?.resultSummary) return;
    try {
      await navigator.clipboard.writeText(detail.resultSummary);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const tabs: Array<{ id: DetailTab; label: string; icon: typeof FileText }> = [
    { id: 'task', label: 'Task', icon: FileText },
    { id: 'output', label: 'Output', icon: Sparkles },
    { id: 'logs', label: 'Logs', icon: Terminal },
    { id: 'actions', label: 'Actions', icon: Zap },
  ];

  const tabBar = (
    <div
      role="tablist"
      aria-label="Task detail sections"
      className="flex items-center gap-0 px-2 border-b border-portal-border bg-portal-card"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`task-detail-panel-${t.id}`}
            id={`task-detail-tab-${t.id}`}
            onClick={() => {
              setActiveTab(t.id);
              setAutoSwitched(true);
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded-t-sm',
              active
                ? 'text-portal-accent border-portal-accent'
                : 'text-portal-muted border-transparent hover:text-portal-text'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        );
      })}
    </div>
  );

  // ---- Tab panels ----

  const taskPanel = detail && (
    <div
      role="tabpanel"
      id="task-detail-panel-task"
      aria-labelledby="task-detail-tab-task"
      className="space-y-4"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'text-[10px] rounded-full px-2 py-0.5 border',
            STATUS_CLASS[detail.status]
          )}
        >
          {STATUS_LABEL[detail.status]}
        </span>
        <span className={cn('text-[10px] font-medium', PRIORITY_CLASS[detail.priority])}>
          {detail.priority} priority
        </span>
        <span className="text-xs text-portal-muted">
          {detail.project.icon ?? '📦'} {detail.project.name}
        </span>
        {detail.agentProfile && (
          <span className="text-xs text-portal-muted">
            · {detail.agentProfile.name} ({detail.agentProfile.role})
          </span>
        )}
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-portal-muted mb-1">
          Instructions
        </h3>
        <div className="bg-portal-bg border border-portal-border rounded-md p-3 text-sm text-portal-text whitespace-pre-wrap">
          {detail.description}
        </div>
      </div>

      {detail.attachments && detail.attachments.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-portal-muted mb-1">
            Attachments
          </h3>
          <div className="flex flex-wrap gap-2">
            {detail.attachments.map((att) => (
              <a
                key={att.id}
                href={att.dataUri}
                target="_blank"
                rel="noopener noreferrer"
                title={att.filename ?? 'Task screenshot'}
                className="block h-16 w-16 rounded-md overflow-hidden bg-portal-bg border border-portal-border hover:border-portal-accent/50 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.dataUri}
                  alt={att.filename ?? 'Task screenshot'}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const outputPanel = detail && (
    <div
      role="tabpanel"
      id="task-detail-panel-output"
      aria-labelledby="task-detail-tab-output"
      className="space-y-4"
    >
      {!hasOutput ? (
        <div className="flex flex-col items-center justify-center text-center py-10 text-portal-muted">
          {isInFlight ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-portal-accent mb-2" />
              <div className="text-sm text-portal-text">Worker is still running…</div>
              <div className="text-xs mt-1">Output will appear here when the task finishes.</div>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mb-2 text-portal-muted" />
              <div className="text-sm">No output yet.</div>
              <div className="text-xs mt-1">
                {isTerminal
                  ? 'This task ended without producing a result summary.'
                  : 'Output will appear here when the task finishes.'}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {detail.resultUrl && (
            <a
              href={detail.resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-portal-accent hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded"
            >
              <ExternalLink className="h-4 w-4" />
              {detail.resultType === 'pr'
                ? 'View pull request'
                : detail.resultType === 'commit'
                  ? 'View commit'
                  : 'View result'}
            </a>
          )}

          {detail.resultSummary && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs uppercase tracking-wider text-portal-muted">
                  Result summary
                </h3>
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="flex items-center gap-1 text-[11px] text-portal-muted hover:text-portal-text transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded px-1.5 py-0.5"
                  aria-label="Copy result summary"
                  title="Copy result summary"
                >
                  {copyOk ? (
                    <>
                      <Check className="h-3 w-3 text-green-300" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="bg-green-500/5 border border-green-500/20 rounded-md p-3 text-sm text-portal-text whitespace-pre-wrap">
                {detail.resultSummary}
              </div>
            </div>
          )}

          {detail.errorMessage && (
            <div>
              <h3 className="text-xs uppercase tracking-wider text-portal-muted mb-1">
                Error
              </h3>
              <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 text-sm text-red-300 whitespace-pre-wrap">
                {detail.errorMessage}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const logsPanel = detail && (
    <div
      role="tabpanel"
      id="task-detail-panel-logs"
      aria-labelledby="task-detail-tab-logs"
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-portal-muted">
          Streaming logs
        </h3>
        {isInFlight && (
          <span className="flex items-center gap-1 text-[11px] text-yellow-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Live
          </span>
        )}
      </div>
      <div
        ref={logsScrollRef}
        className="bg-black/40 border border-portal-border rounded-md p-2 h-[55vh] overflow-y-auto font-mono text-[11px]"
      >
        {detail.logs.length === 0 ? (
          <div className="text-portal-muted">No logs yet.</div>
        ) : (
          detail.logs.map((l) => (
            <div
              key={l.id}
              className={cn(
                'whitespace-pre-wrap',
                l.level === 'error'
                  ? 'text-red-300'
                  : l.level === 'warn'
                    ? 'text-yellow-300'
                    : l.level === 'stderr'
                      ? 'text-orange-300'
                      : 'text-portal-text'
              )}
            >
              <span className="text-portal-muted">
                [{new Date(l.createdAt).toLocaleTimeString()}]
              </span>{' '}
              {l.message}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const hasAnyAction =
    !!detail &&
    (isNeedsReview ||
      !isTerminal ||
      (isTerminal && (canRetask || true)) || // delete + follow-up always available on terminal
      !!detail.resultUrl ||
      !!detail.resultSummary);

  const actionsPanel = detail && (
    <div
      role="tabpanel"
      id="task-detail-panel-actions"
      aria-labelledby="task-detail-tab-actions"
      className="space-y-3"
    >
      {/* Review helper banner */}
      {isNeedsReview && (
        <div className="bg-portal-accent/5 border border-portal-accent/20 rounded-md px-3 py-2 text-xs text-portal-text">
          {isMerged
            ? 'PR already merged — confirm the change is good to close out this task.'
            : detail.resultType === 'pr'
              ? "Worker opened a PR. Review it on GitHub, then merge it here when you're happy."
              : 'Summary-only result — no merge needed. Review and close out the task.'}
        </div>
      )}

      {!hasAnyAction ? (
        <div className="flex flex-col items-center justify-center text-center py-10 text-portal-muted">
          <Zap className="h-5 w-5 mb-2 text-portal-muted" />
          <div className="text-sm">No actions available yet.</div>
          <div className="text-xs mt-1">
            Actions appear once the task is dispatched or finishes.
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {isNeedsReview ? (
            <>
              {showMergeAndReview ? (
                <button
                  onClick={handleMergeAndReview}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                >
                  {busy && activeAction === 'merge_and_review' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="h-3.5 w-3.5" />
                  )}
                  Merge &amp; mark reviewed
                </button>
              ) : (
                <button
                  onClick={handleMarkReviewed}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 border border-green-500/40 text-green-200 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  {busy && activeAction === 'mark_reviewed' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Mark as reviewed
                </button>
              )}
              <button
                onClick={handleUndo}
                disabled={busy}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                {busy && activeAction === 'undo' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Undo
              </button>
              {detail.resultUrl && (
                <a
                  href={detail.resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-bg border border-portal-border text-portal-text hover:border-portal-accent/50 rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {detail.resultType === 'pr' ? 'View PR' : 'View result'}
                </a>
              )}
              {detail.resultSummary && (
                <button
                  onClick={handleCopyOutput}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-bg border border-portal-border text-portal-text hover:border-portal-accent/50 rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                >
                  {copyOk ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-300" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy output
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => onFollowUp(detail)}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent/10 border border-portal-accent/30 text-portal-accent hover:bg-portal-accent/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                title="Open the dispatcher pre-linked to this task as a follow-up"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Submit follow-up
              </button>
            </>
          ) : (
            <>
              {!isTerminal && (
                <button
                  onClick={() => callPatch({ action: 'cancel' })}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 rounded-md text-xs disabled:opacity-50 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  Cancel
                </button>
              )}
              {!isInFlight && !isTerminal && (
                <>
                  <select
                    onChange={(e) => {
                      if (e.target.value)
                        callPatch({ action: 'reassign', agentProfileId: e.target.value });
                    }}
                    defaultValue=""
                    disabled={busy}
                    aria-label="Reassign to a different agent"
                    className="bg-portal-bg border border-portal-border rounded-md px-2 py-1.5 text-xs text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  >
                    <option value="">Reassign to…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.role}
                      </option>
                    ))}
                  </select>
                  <select
                    onChange={(e) => {
                      if (e.target.value)
                        callPatch({ action: 'reprioritize', priority: e.target.value });
                    }}
                    defaultValue=""
                    disabled={busy}
                    aria-label="Change task priority"
                    className="bg-portal-bg border border-portal-border rounded-md px-2 py-1.5 text-xs text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  >
                    <option value="">Change priority…</option>
                    {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {isTerminal && (
                <>
                  {detail.resultUrl && (
                    <a
                      href={detail.resultUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-bg border border-portal-border text-portal-text hover:border-portal-accent/50 rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {detail.resultType === 'pr' ? 'View PR' : 'View result'}
                    </a>
                  )}
                  {detail.resultSummary && (
                    <button
                      onClick={handleCopyOutput}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-bg border border-portal-border text-portal-text hover:border-portal-accent/50 rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                    >
                      {copyOk ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-green-300" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy output
                        </>
                      )}
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => onFollowUp(detail)}
                      disabled={busy || deleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent/10 border border-portal-accent/30 text-portal-accent hover:bg-portal-accent/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                      title="Open the dispatcher pre-linked to this task as a follow-up"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Submit follow-up
                    </button>
                    {canRetask && (
                      <button
                        onClick={() => onRetask(detail)}
                        disabled={busy || deleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-xs transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                        title="Open a pre-filled dispatcher to edit and re-dispatch this task"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Re-task
                      </button>
                    )}
                    <button
                      onClick={deleteTask}
                      disabled={deleting || busy}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 rounded-md text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Delete
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );

  return (
    <ModalShell
      onClose={onClose}
      title={detail?.title ?? 'Loading task…'}
      wide
      tabsSlot={detail ? tabBar : null}
    >
      {!detail ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-portal-accent" />
        </div>
      ) : (
        <>
          {activeTab === 'task' && taskPanel}
          {activeTab === 'output' && outputPanel}
          {activeTab === 'logs' && logsPanel}
          {activeTab === 'actions' && actionsPanel}
        </>
      )}
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  wide,
  tabsSlot,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  tabsSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-portal-card border border-portal-border rounded-xl shadow-xl w-full overflow-hidden flex flex-col max-h-[90vh]',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-portal-border shrink-0">
          <h2 className="text-sm font-semibold text-portal-text truncate">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-portal-muted hover:text-portal-text rounded-md transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {tabsSlot && <div className="shrink-0">{tabsSlot}</div>}
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-portal-muted block mb-1">{label}</span>
      {children}
    </label>
  );
}

// ─── Kanban board ─────────────────────────────────────────────

interface KanbanColDef {
  key: string;
  statuses: TaskDTO['status'][];
  label: string;
  headerClass: string;
  badgeClass: string;
  topBorderClass: string;
}

const KANBAN_COLS: KanbanColDef[] = [
  {
    key: 'queued',
    statuses: ['pending', 'queued'],
    label: 'Queued',
    headerClass: 'text-blue-300',
    badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    topBorderClass: 'border-t-blue-500/50',
  },
  {
    key: 'in_progress',
    statuses: ['in_progress'],
    label: 'In Progress',
    headerClass: 'text-yellow-300',
    badgeClass: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    topBorderClass: 'border-t-yellow-500/50',
  },
  {
    key: 'needs_review',
    statuses: ['needs_review'],
    label: 'Needs Review',
    headerClass: 'text-purple-300',
    badgeClass: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    topBorderClass: 'border-t-purple-500/50',
  },
  {
    key: 'completed',
    statuses: ['completed'],
    label: 'Completed',
    headerClass: 'text-green-300',
    badgeClass: 'bg-green-500/10 text-green-300 border-green-500/30',
    topBorderClass: 'border-t-green-500/50',
  },
  {
    key: 'failed',
    statuses: ['failed'],
    label: 'Failed',
    headerClass: 'text-red-300',
    badgeClass: 'bg-red-500/10 text-red-300 border-red-500/30',
    topBorderClass: 'border-t-red-500/50',
  },
  {
    key: 'cancelled',
    statuses: ['cancelled'],
    label: 'Cancelled',
    headerClass: 'text-zinc-400',
    badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
    topBorderClass: 'border-t-zinc-500/50',
  },
];

function KanbanBoard({
  tasks,
  onTaskClick,
}: {
  tasks: TaskDTO[];
  onTaskClick: (taskId: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1" role="region" aria-label="Task board">
      <div className="flex gap-3 min-w-max">
        {KANBAN_COLS.map((col) => {
          const colTasks = tasks.filter((t) => col.statuses.includes(t.status));
          return (
            <div
              key={col.key}
              className={cn(
                'w-56 shrink-0 flex flex-col rounded-lg border border-portal-border bg-portal-bg/60 border-t-2 overflow-hidden',
                col.topBorderClass
              )}
              aria-label={`${col.label} column`}
            >
              {/* Column header */}
              <div className="px-3 py-2 border-b border-portal-border flex items-center justify-between">
                <span className={cn('text-xs font-semibold', col.headerClass)}>
                  {col.label}
                </span>
                <span
                  className={cn(
                    'text-[10px] rounded-full px-1.5 py-0.5 border font-mono tabular-nums',
                    col.badgeClass
                  )}
                >
                  {colTasks.length}
                </span>
              </div>
              {/* Cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[60vh]">
                {colTasks.length === 0 ? (
                  <p className="text-center py-6 text-[11px] text-portal-muted select-none">
                    Empty
                  </p>
                ) : (
                  colTasks.map((t) => (
                    <KanbanCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ task, onClick }: { task: TaskDTO; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          onClick();
        }
      }}
      className="bg-portal-card border border-portal-border rounded-lg p-3 cursor-pointer hover:border-portal-accent/50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-portal-accent"
    >
      {/* Title */}
      <p className="text-xs font-medium text-portal-text line-clamp-2 mb-2 leading-snug">
        {task.title}
      </p>
      {/* Project */}
      <div className="flex items-center gap-1 text-[10px] text-portal-muted mb-1 truncate">
        <span aria-hidden="true">{task.project.icon ?? '📦'}</span>
        <span className="truncate">{task.project.name}</span>
      </div>
      {/* Agent */}
      {task.agentProfile && (
        <div className="text-[10px] text-portal-muted truncate mb-1.5">
          {task.agentProfile.name}
          {task.agentProfile.role ? ` · ${task.agentProfile.role}` : ''}
        </div>
      )}
      {/* Priority + spinner */}
      <div className="flex items-center justify-between mt-2">
        <span
          className={cn('text-[10px] font-medium capitalize', PRIORITY_CLASS[task.priority])}
        >
          {task.priority}
        </span>
        {task.status === 'in_progress' && (
          <Loader2 className="h-3 w-3 animate-spin text-yellow-300 shrink-0" aria-label="In progress" />
        )}
      </div>
    </div>
  );
}
