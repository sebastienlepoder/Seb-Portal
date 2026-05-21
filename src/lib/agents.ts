import type {
  AgentProfile as PrismaAgentProfile,
  Project as PrismaProject,
  Task as PrismaTask,
  TaskLog as PrismaTaskLog,
} from '@prisma/client';
import type {
  AgentProfileDTO,
  AgentSummary,
  ProjectSummary,
  TaskDTO,
  TaskLogDTO,
  TaskPriority,
  TaskStatus,
} from '@/types/agents';

function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

export function toAgentProfileDTO(a: PrismaAgentProfile): AgentProfileDTO {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    role: a.role,
    expertise: parseJsonArray(a.expertise),
    description: a.description,
    systemPrompt: a.systemPrompt,
    model: a.model,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toAgentSummary(a: PrismaAgentProfile): AgentSummary {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    role: a.role,
    expertise: parseJsonArray(a.expertise),
  };
}

export function toProjectSummary(p: PrismaProject): ProjectSummary {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    icon: p.icon,
    color: p.color,
    repoOwner: p.repoOwner,
    repoName: p.repoName,
    workingBranch: p.workingBranch,
    allowWrite: p.allowWrite,
  };
}

export function toTaskDTO(
  t: PrismaTask & {
    project: PrismaProject;
    agentProfile: PrismaAgentProfile | null;
    parent?: { title: string } | null;
  }
): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    parentTaskId: t.parentTaskId ?? null,
    parentTitle: t.parent?.title ?? null,
    autoMerge: t.autoMerge ?? false,
    workerId: t.workerId,
    workerStartedAt: t.workerStartedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    resultType: (t.resultType as TaskDTO['resultType']) ?? null,
    resultUrl: t.resultUrl,
    resultSummary: t.resultSummary,
    errorMessage: t.errorMessage,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    project: toProjectSummary(t.project),
    agentProfile: t.agentProfile ? toAgentSummary(t.agentProfile) : null,
  };
}

export function toTaskLogDTO(l: PrismaTaskLog): TaskLogDTO {
  let metadata: Record<string, unknown> | null = null;
  if (l.metadata) {
    try {
      metadata = JSON.parse(l.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: l.id,
    level: l.level as TaskLogDTO['level'],
    message: l.message,
    metadata,
    createdAt: l.createdAt.toISOString(),
  };
}

/**
 * Auto-match an agent profile to a task by tag overlap with the task text.
 * Returns the agent slug with the most overlap, or null if no agents are
 * active. Ties are broken by sortOrder ascending.
 */
export function pickAgentByExpertise(
  agents: PrismaAgentProfile[],
  taskText: string
): PrismaAgentProfile | null {
  const active = agents.filter((a) => a.isActive);
  if (active.length === 0) return null;
  const text = taskText.toLowerCase();

  let best: { agent: PrismaAgentProfile; score: number } | null = null;
  for (const a of active) {
    const tags = parseJsonArray(a.expertise);
    let score = 0;
    for (const t of tags) {
      if (text.includes(t.toLowerCase())) score++;
    }
    // also weight role keyword
    if (text.includes(a.role.toLowerCase())) score += 2;
    if (
      best === null ||
      score > best.score ||
      (score === best.score && a.sortOrder < best.agent.sortOrder)
    ) {
      best = { agent: a, score };
    }
  }
  // If nothing matched at all, return the lowest-sortOrder active agent so a
  // task always has somewhere to go.
  return best?.agent ?? active.sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
}
