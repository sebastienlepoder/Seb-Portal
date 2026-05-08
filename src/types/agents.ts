// Shared types for the Agent Dispatch system.

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskResultType = 'commit' | 'pr' | 'summary';

export type TaskLogLevel = 'info' | 'warn' | 'error' | 'stdout' | 'stderr';

export interface AgentProfileDTO {
  id: string;
  slug: string;
  name: string;
  role: string;
  expertise: string[];
  description: string | null;
  systemPrompt: string;
  model: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  repoOwner: string | null;
  repoName: string | null;
  workingBranch: string;
  allowWrite: boolean;
}

export interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
  expertise: string[];
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  workerId: string | null;
  workerStartedAt: string | null;
  completedAt: string | null;
  resultType: TaskResultType | null;
  resultUrl: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  project: ProjectSummary;
  agentProfile: AgentSummary | null;
}

export interface TaskLogDTO {
  id: string;
  level: TaskLogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskWithLogsDTO extends TaskDTO {
  logs: TaskLogDTO[];
}

export const TASK_STATUSES: TaskStatus[] = [
  'pending',
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
];

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

export function isTaskStatus(s: string): s is TaskStatus {
  return (TASK_STATUSES as string[]).includes(s);
}

export function isTaskPriority(p: string): p is TaskPriority {
  return (TASK_PRIORITIES as string[]).includes(p);
}
