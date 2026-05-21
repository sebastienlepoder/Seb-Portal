/**
 * Core dispatch logic shared between the HTTP route and the MCP tool.
 * Creating a task here is the single entry point so logging & validation
 * stay consistent.
 */

import prisma from '@/lib/db';
import { pickAgentByExpertise } from '@/lib/agents';
import type { TaskPriority } from '@/types/agents';

export interface DispatchInput {
  projectName: string; // slug or human name
  taskTitle: string;
  taskDescription: string;
  agentRole?: string | null; // role string, agent slug, or agent id
  priority?: TaskPriority;
  createdById?: string | null;
  /** When true, the worker auto-merges the PR after opening it. Only
   *  honored when the resolved project has allowWrite=true. */
  autoMerge?: boolean;
  /** When set, this task is a follow-up of an existing task. The parent
   *  must belong to the same resolved project and SHOULD be terminal. */
  parentTaskId?: string | null;
}

export interface DispatchResult {
  ok: true;
  taskId: string;
  taskUrl: string;
  message: string;
  matchedAgentSlug: string | null;
  matchedProjectSlug: string;
}

export class DispatchError extends Error {
  constructor(
    public readonly code:
      | 'PROJECT_NOT_FOUND'
      | 'AGENT_NOT_FOUND'
      | 'NO_AGENTS'
      | 'INVALID_INPUT',
    message: string
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'needs_review']);

export async function dispatchTask(input: DispatchInput): Promise<DispatchResult> {
  const projectQuery = input.projectName.trim().toLowerCase();
  if (!projectQuery) {
    throw new DispatchError('INVALID_INPUT', 'projectName is required');
  }
  if (!input.taskTitle?.trim() || !input.taskDescription?.trim()) {
    throw new DispatchError('INVALID_INPUT', 'taskTitle and taskDescription are required');
  }

  // Project lookup: slug exact, then LIKE-style contains (SQLite LIKE is
  // case-insensitive for ASCII by default, which is what we need).
  const project =
    (await prisma.project.findUnique({ where: { slug: projectQuery } })) ??
    (await prisma.project.findFirst({
      where: {
        OR: [
          { slug: { contains: projectQuery } },
          { name: { contains: input.projectName } },
        ],
      },
    }));

  if (!project) {
    throw new DispatchError(
      'PROJECT_NOT_FOUND',
      `No project matches "${input.projectName}". Configure it in the admin Projects page first.`
    );
  }

  let parentTask: { id: string; title: string; projectId: string; status: string } | null = null;
  if (input.parentTaskId) {
    parentTask = await prisma.task.findUnique({
      where: { id: input.parentTaskId },
      select: { id: true, title: true, projectId: true, status: true },
    });
    if (!parentTask) {
      throw new DispatchError('INVALID_INPUT', `Parent task ${input.parentTaskId} not found`);
    }
    if (parentTask.projectId !== project.id) {
      throw new DispatchError(
        'INVALID_INPUT',
        'Parent task belongs to a different project than the resolved project'
      );
    }
    if (!TERMINAL_STATUSES.has(parentTask.status)) {
      throw new DispatchError('INVALID_INPUT', 'Parent task is still in flight');
    }
  }

  // Agent resolution
  let agentId: string | null = null;
  let matchedAgentSlug: string | null = null;
  if (input.agentRole && input.agentRole.trim()) {
    const q = input.agentRole.trim();
    const agent =
      (await prisma.agentProfile.findUnique({ where: { slug: q.toLowerCase() } })) ??
      (await prisma.agentProfile.findUnique({ where: { id: q } }).catch(() => null)) ??
      (await prisma.agentProfile.findFirst({
        where: { role: { contains: q } },
      }));
    if (!agent) {
      throw new DispatchError(
        'AGENT_NOT_FOUND',
        `No agent matches "${input.agentRole}". Use the Agents page to list available roles.`
      );
    }
    if (!agent.isActive) {
      throw new DispatchError('AGENT_NOT_FOUND', `Agent "${agent.name}" is disabled`);
    }
    agentId = agent.id;
    matchedAgentSlug = agent.slug;
  } else {
    const all = await prisma.agentProfile.findMany();
    const picked = pickAgentByExpertise(all, `${input.taskTitle}\n${input.taskDescription}`);
    if (!picked) {
      throw new DispatchError(
        'NO_AGENTS',
        'No active agent profiles configured. Create one in the admin Agents page.'
      );
    }
    agentId = picked.id;
    matchedAgentSlug = picked.slug;
  }

  // Validate auto-merge against the project — never silently downgrade.
  // Either reject loudly so the user knows, or strip the request before
  // creating the task. Read-only projects can't auto-merge because there's
  // no PR to merge in the first place.
  const wantsAutoMerge = !!input.autoMerge;
  if (wantsAutoMerge && !project.allowWrite) {
    throw new DispatchError(
      'INVALID_INPUT',
      `Cannot auto-merge: project "${project.name}" is read-only. Enable "Allow worker to commit/push" in Admin → Projects first.`
    );
  }

  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      agentProfileId: agentId,
      createdById: input.createdById ?? null,
      title: input.taskTitle.trim().slice(0, 200),
      description: input.taskDescription.trim(),
      priority: input.priority ?? 'normal',
      status: 'pending',
      autoMerge: wantsAutoMerge,
      parentTaskId: parentTask?.id ?? null,
    },
  });

  const followUpSuffix = parentTask ? ` (follow-up of ${parentTask.title})` : '';
  await prisma.taskLog.create({
    data: {
      taskId: task.id,
      level: 'info',
      message: `Task dispatched to project "${project.name}" with agent "${matchedAgentSlug}"${followUpSuffix}`,
    },
  });

  return {
    ok: true,
    taskId: task.id,
    taskUrl: `/agents?taskId=${task.id}`,
    message: `Task created and queued for project "${project.name}"`,
    matchedAgentSlug,
    matchedProjectSlug: project.slug,
  };
}
