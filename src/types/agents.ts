// Shared types for the Agent Dispatch system.

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'needs_review'
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

export interface TaskAttachmentDTO {
  id: string;
  mimeType: string;
  /** Reconstructed full data URI, ready to drop into <img src>. */
  dataUri: string;
  filename: string | null;
  byteSize: number;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** When set, this is a sub-task dispatched by an Orchestrator agent. */
  parentTaskId: string | null;
  /** Title of the parent task (when this is a sub-task), so the UI can
   *  always show "sub-task of …" even when the parent isn't in the
   *  current list (e.g. parent completed and filtered out). */
  parentTitle: string | null;
  /** When true and the project is write-enabled, the worker auto-merges
   *  the PR it opens via GitHub API after creation. */
  autoMerge: boolean;
  workerId: string | null;
  workerStartedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  mergedAt: string | null;
  resultType: TaskResultType | null;
  resultUrl: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  /** SDK-reported dollar cost (token-count estimate). The SDK reports a
   *  non-zero number even on Max OAuth runs — it's "what this would have
   *  cost on the API," not the actual billed amount. Use `authPath` to
   *  know whether real money was spent. null on legacy rows. */
  costUsd: number | null;
  /** Auth path the worker used. null on legacy rows. */
  authPath: 'oauth' | 'api_key' | null;
  createdAt: string;
  updatedAt: string;
  project: ProjectSummary;
  agentProfile: AgentSummary | null;
  /** Only populated on the detail endpoint. */
  attachments?: TaskAttachmentDTO[];
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
  'needs_review',
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

// Models the worker can run. Keep in sync with src/lib/anthropic.ts.
export const AVAILABLE_MODELS = [
  { value: '', label: 'Auto — use worker default' },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5 — fast & cheap' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7 — smartest' },
] as const;
