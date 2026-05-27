import { NextResponse } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { requireApiAuth } from '@/lib/auth';
import { checkRateLimit, aiChatLimiter } from '@/lib/rate-limit';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/anthropic';
import { dispatchTask, DispatchError } from '@/lib/agent-dispatch';
import { toTaskDTO, toTaskLogDTO } from '@/lib/agents';
import {
  GithubError,
  getCommit,
  getFileContent,
  getPullRequest,
  getRepoInfo,
  listBranches,
  listCommits,
  listDirectory,
  listPullRequests,
  resolveProjectRepo,
} from '@/lib/github';
import {
  isTaskPriority,
  isTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from '@/types/agents';
import { memoryTools } from '@/server/mcp/memory-tools';
import type { AiProvider, AiMessage, SessionUser } from '@/types';

// ─── Tool definitions ────────────────────────────────────────

const CHAT_TOOLS = [
  {
    name: 'list_projects',
    description:
      'List the projects registered in this portal that the agent worker can act on. Use this when the user mentions a project by partial name and you need to disambiguate, or when they ask "what projects are available?".',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'list_agents',
    description:
      'List the active agent profiles with their roles and expertise tags. Use this when the user asks "which agents are available?" or when you need to pick the right agent for a task.',
    input_schema: { type: 'object' as const, properties: {}, required: [] as string[] },
  },
  {
    name: 'dispatch_to_project',
    description:
      'Dispatch a development task to a project\'s agent worker. The worker clones the GitHub repo and runs Claude with the chosen agent\'s system prompt. Returns a taskId. Call this once you have the project + a clear task description. The agent_role is optional — if omitted, the dispatcher auto-matches by expertise tags.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_name: { type: 'string', description: 'Project slug or human name' },
        task_title: { type: 'string', description: 'Short imperative title (max 200 chars)' },
        task_description: { type: 'string', description: 'Detailed instructions for the agent' },
        agent_role: {
          type: 'string',
          description: 'Optional: agent slug, role name, or id. Omit for auto-match.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Task priority. Defaults to "normal".',
        },
      },
      required: ['project_name', 'task_title', 'task_description'],
    },
  },
  {
    name: 'ask_user_question',
    description:
      'Ask the user a clarifying question with 2-4 multiple-choice options. Use ONLY when the request is genuinely ambiguous and cannot be resolved from context — e.g. the user said "fix the bug" but did not say which project, or they want to dispatch to a write-enabled project but you should confirm. Do NOT use for obvious cases. The user will pick one option, which becomes their next message.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The question to show the user' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 short option labels (each max ~40 chars)',
        },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'list_tasks',
    description:
      'List dispatched tasks across all projects. Use this to audit recent work, find a specific task, or review the queue. Filter by status, project, agent, or priority. Returns summary fields per task — call get_task for full details + logs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          description:
            'Comma-separated statuses: pending, queued, in_progress, needs_review, completed, failed, cancelled. Omit for all.',
        },
        project: {
          type: 'string',
          description: 'Project slug or name to filter to a single project.',
        },
        agent: {
          type: 'string',
          description: 'Agent slug, id, or role substring to filter by agent.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'urgent'],
        },
        limit: {
          type: 'number',
          description: 'Max tasks to return (default 30, max 200).',
        },
      },
      required: [] as string[],
    },
  },
  {
    name: 'get_task',
    description:
      'Get full details for a single task by id, including description, status, result summary/URL, error message, and the most recent logs. Use this after list_tasks to inspect a specific task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'Task UUID' },
        include_logs: {
          type: 'boolean',
          description: 'Include task logs (default true). Set false to save tokens.',
        },
        log_limit: {
          type: 'number',
          description: 'Max log entries to include (default 50, max 500).',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'github_get_repo',
    description:
      'Get GitHub repo metadata (default branch, language, topics, visibility, last pushed) for a project. Pass either project (slug/name — preferred) or owner + repo explicitly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string', description: 'Portal project slug or name' },
        owner: { type: 'string', description: 'GitHub owner (overrides project lookup)' },
        repo: { type: 'string', description: 'GitHub repo (overrides project lookup)' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'github_list_branches',
    description: 'List branches on a project repo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        limit: { type: 'number', description: 'Max 100, default 30' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'github_list_commits',
    description:
      'List recent commits on a branch (defaults to the project working branch / repo default). Optionally filter by file path.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string', description: 'Branch or commit SHA. Omit for default.' },
        path: { type: 'string', description: 'Only commits touching this path.' },
        limit: { type: 'number', description: 'Max 100, default 20' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'github_get_commit',
    description: 'Get a single commit with file change list (filename, status, additions, deletions).',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        sha: { type: 'string', description: 'Commit SHA (full or short)' },
      },
      required: ['sha'],
    },
  },
  {
    name: 'github_list_pull_requests',
    description: 'List pull requests for a project repo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Default "all".',
        },
        limit: { type: 'number', description: 'Max 100, default 20' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'github_get_pull_request',
    description:
      'Get a single pull request with body, merge state, and the list of changed files. Use this to verify whether a dispatched task actually changed what it claimed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'number', description: 'PR number' },
      },
      required: ['number'],
    },
  },
  {
    name: 'github_get_file',
    description:
      'Read a file from a repo at the given ref (branch, tag, or commit SHA). Defaults to the project working branch. Large files are truncated to 200 KB.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'File path within the repo' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA. Omit for default.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_list_directory',
    description: 'List entries (files + subdirs) in a repo directory at the given ref.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Directory path. Omit or "" for repo root.' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA. Omit for default.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'read_memory',
    description:
      'Read a persisted memory entry by key. Omit `key` to list the index of all stored entries (key, type, updatedAt) for the current user. Memory is scoped per user. The current memory snapshot is already in your system prompt — use this only to refresh after writes or to fetch an entry not shown there.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Memory key to fetch. Omit to list all entries.' },
      },
      required: [] as string[],
    },
  },
  {
    name: 'write_memory',
    description:
      'Create or overwrite a persisted memory entry for the current user. Use this to remember facts, preferences, ongoing context, or anything the user explicitly asks you to remember across sessions. Calling with the same key replaces the value. Optional `type` categorizes the entry.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Short stable identifier for this entry (max 200 chars)' },
        value: { type: 'string', description: 'Memory payload (max 64 KB)' },
        type: {
          type: 'string',
          enum: ['user', 'project', 'feedback', 'reference', 'general'],
          description: 'Category for the entry. Defaults to "general".',
        },
      },
      required: ['key', 'value'],
    },
  },
] satisfies Anthropic.Tool[];

// ─── Tool executors ──────────────────────────────────────────

interface RepoCoordsInput {
  project?: unknown;
  owner?: unknown;
  repo?: unknown;
}

async function resolveCoords(
  input: RepoCoordsInput
): Promise<{ owner: string; repo: string; defaultBranch: string }> {
  const owner = typeof input.owner === 'string' ? input.owner.trim() : '';
  const repo = typeof input.repo === 'string' ? input.repo.trim() : '';
  if (owner && repo) return { owner, repo, defaultBranch: 'main' };
  const project = typeof input.project === 'string' ? input.project.trim() : '';
  if (!project) {
    throw new GithubError(400, 'Must provide either project (slug/name) or owner + repo');
  }
  return resolveProjectRepo(project);
}

function summarizeTask(t: ReturnType<typeof toTaskDTO>) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    project: t.project.slug,
    agent: t.agentProfile?.slug ?? null,
    parentTaskId: t.parentTaskId,
    resultType: t.resultType,
    resultUrl: t.resultUrl,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    errorMessage: t.errorMessage,
  };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  user: SessionUser
): Promise<string> {
  if (name === 'list_projects') {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['active', 'paused'] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        description: true,
        repoOwner: true,
        repoName: true,
        workingBranch: true,
        allowWrite: true,
      },
    });
    return JSON.stringify(projects);
  }

  if (name === 'list_agents') {
    const agents = await prisma.agentProfile.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true, role: true, expertise: true, description: true },
    });
    const formatted = agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      role: a.role,
      description: a.description,
      expertise: (() => {
        try {
          const parsed = JSON.parse(a.expertise);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
    }));
    return JSON.stringify(formatted);
  }

  if (name === 'dispatch_to_project') {
    try {
      const result = await dispatchTask({
        projectName: String(input.project_name ?? ''),
        taskTitle: String(input.task_title ?? ''),
        taskDescription: String(input.task_description ?? ''),
        agentRole: input.agent_role ? String(input.agent_role) : null,
        priority: (input.priority as TaskPriority) ?? 'normal',
        createdById: user.id,
      });
      return JSON.stringify({
        success: true,
        taskId: result.taskId,
        taskUrl: result.taskUrl,
        message: result.message,
        agent: result.matchedAgentSlug,
        project: result.matchedProjectSlug,
      });
    } catch (e) {
      if (e instanceof DispatchError) {
        return JSON.stringify({ success: false, error: e.message, code: e.code });
      }
      return JSON.stringify({ success: false, error: (e as Error).message });
    }
  }

  if (name === 'list_tasks') {
    const where: {
      status?: TaskStatus | { in: TaskStatus[] };
      projectId?: string;
      agentProfileId?: string;
      priority?: TaskPriority;
    } = {};

    const statusParam = typeof input.status === 'string' ? input.status : '';
    if (statusParam) {
      const parts = statusParam.split(',').map((s) => s.trim()).filter(isTaskStatus);
      if (parts.length === 1) where.status = parts[0];
      else if (parts.length > 1) where.status = { in: parts };
    }
    if (typeof input.priority === 'string' && isTaskPriority(input.priority)) {
      where.priority = input.priority;
    }
    if (typeof input.project === 'string' && input.project.trim()) {
      const q = input.project.trim().toLowerCase();
      const project =
        (await prisma.project.findUnique({ where: { slug: q } })) ??
        (await prisma.project.findFirst({
          where: {
            OR: [{ slug: { contains: q } }, { name: { contains: input.project as string } }],
          },
        }));
      if (!project) {
        return JSON.stringify({ error: `No project matches "${input.project}"` });
      }
      where.projectId = project.id;
    }
    if (typeof input.agent === 'string' && input.agent.trim()) {
      const q = input.agent.trim().toLowerCase();
      const agent =
        (await prisma.agentProfile.findUnique({ where: { slug: q } })) ??
        (await prisma.agentProfile.findUnique({ where: { id: q } }).catch(() => null)) ??
        (await prisma.agentProfile.findFirst({ where: { role: { contains: q } } }));
      if (!agent) {
        return JSON.stringify({ error: `No agent matches "${input.agent}"` });
      }
      where.agentProfileId = agent.id;
    }

    const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 200);
    const tasks = await prisma.task.findMany({
      where,
      include: { project: true, agentProfile: true, parent: { select: { title: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
    return JSON.stringify({
      count: tasks.length,
      tasks: tasks.map(toTaskDTO).map(summarizeTask),
    });
  }

  if (name === 'get_task') {
    const taskId = typeof input.task_id === 'string' ? input.task_id : '';
    if (!taskId) return JSON.stringify({ error: 'task_id required' });
    const includeLogs = input.include_logs !== false;
    const logLimit = Math.min(Math.max(Number(input.log_limit) || 50, 1), 500);
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        agentProfile: true,
        parent: { select: { title: true } },
        logs: includeLogs
          ? { orderBy: { createdAt: 'desc' }, take: logLimit }
          : false,
        attachments: { select: { id: true, filename: true, mimeType: true, byteSize: true } },
      },
    });
    if (!task) return JSON.stringify({ error: 'Not found' });
    const { logs, attachments, ...rest } = task;
    return JSON.stringify({
      ...toTaskDTO(rest),
      logs: logs ? logs.reverse().map(toTaskLogDTO) : undefined,
      attachments,
    });
  }

  if (name === 'github_get_repo') {
    try {
      const coords = await resolveCoords(input);
      const info = await getRepoInfo(coords.owner, coords.repo);
      return JSON.stringify(info);
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_list_branches') {
    try {
      const coords = await resolveCoords(input);
      const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 100);
      const branches = await listBranches(coords.owner, coords.repo, limit);
      return JSON.stringify({ branches });
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_list_commits') {
    try {
      const coords = await resolveCoords(input);
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
      const branch =
        typeof input.branch === 'string' && input.branch.trim()
          ? input.branch.trim()
          : coords.defaultBranch;
      const path = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : undefined;
      const commits = await listCommits(coords.owner, coords.repo, {
        branch,
        path,
        perPage: limit,
      });
      return JSON.stringify({ branch, commits });
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_get_commit') {
    try {
      const coords = await resolveCoords(input);
      const sha = typeof input.sha === 'string' ? input.sha.trim() : '';
      if (!sha) return JSON.stringify({ error: 'sha required' });
      const commit = await getCommit(coords.owner, coords.repo, sha);
      return JSON.stringify(commit);
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_list_pull_requests') {
    try {
      const coords = await resolveCoords(input);
      const state = (typeof input.state === 'string' ? input.state : 'all') as
        | 'open'
        | 'closed'
        | 'all';
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
      const prs = await listPullRequests(coords.owner, coords.repo, { state, perPage: limit });
      return JSON.stringify({ pullRequests: prs });
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_get_pull_request') {
    try {
      const coords = await resolveCoords(input);
      const number = Number(input.number);
      if (!Number.isFinite(number) || number <= 0) {
        return JSON.stringify({ error: 'number required (positive integer)' });
      }
      const pr = await getPullRequest(coords.owner, coords.repo, number);
      return JSON.stringify(pr);
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_get_file') {
    try {
      const coords = await resolveCoords(input);
      const path = typeof input.path === 'string' ? input.path.trim() : '';
      if (!path) return JSON.stringify({ error: 'path required' });
      const ref =
        typeof input.ref === 'string' && input.ref.trim() ? input.ref.trim() : coords.defaultBranch;
      const file = await getFileContent(coords.owner, coords.repo, path, ref);
      return JSON.stringify(file);
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'github_list_directory') {
    try {
      const coords = await resolveCoords(input);
      const path = typeof input.path === 'string' ? input.path.trim() : '';
      const ref =
        typeof input.ref === 'string' && input.ref.trim() ? input.ref.trim() : coords.defaultBranch;
      const entries = await listDirectory(coords.owner, coords.repo, path, ref);
      return JSON.stringify({ path: path || '/', ref, entries });
    } catch (e) {
      return githubErrorJson(e);
    }
  }

  if (name === 'read_memory' || name === 'write_memory') {
    // Delegate to the shared MCP memory handlers — they enforce per-user
    // scoping via the (userId, key) unique constraint and the input is
    // sanitized inside the handler.
    const tool = memoryTools.find((t) => t.name === name);
    if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
    try {
      const result = await tool.handler(input, user);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: (e as Error).message });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

function githubErrorJson(e: unknown): string {
  if (e instanceof GithubError) {
    return JSON.stringify({ error: e.message, status: e.status });
  }
  return JSON.stringify({ error: (e as Error).message });
}

// ─── System prompt ───────────────────────────────────────────

interface MemorySnapshot {
  key: string;
  value: string;
  type: string;
}

// One line per memory; truncate huge values so the prompt stays bounded.
const MEMORY_VALUE_PROMPT_LIMIT = 1000;

function formatMemoriesBlock(memories: MemorySnapshot[]): string {
  if (memories.length === 0) return '';
  const lines = memories.map((m) => {
    const v =
      m.value.length > MEMORY_VALUE_PROMPT_LIMIT
        ? `${m.value.slice(0, MEMORY_VALUE_PROMPT_LIMIT)}… [truncated; use read_memory to fetch full]`
        : m.value;
    return `- [${m.type}] ${m.key}: ${v}`;
  });
  return [
    '',
    '## Your Memory',
    'You have persistent memory across sessions for this user. Current entries:',
    ...lines,
    '',
    'Use `write_memory` to persist new facts the user asks you to remember, and `read_memory` (with a key) to fetch the full value of a truncated entry. When you add or change a memory, do so silently unless the user asks for confirmation.',
  ].join('\n');
}

function buildSystemPrompt(memories: MemorySnapshot[] = []): string {
  const base = [
    'You are the LEPODER Portal AI assistant. You help the operator (Sebastien) manage projects, agents, dispatched tasks, and review the GitHub repositories those tasks operate on.',
    '',
    'Project & agent tools:',
    '- `list_projects` — see available projects and their write permissions',
    '- `list_agents` — see available agents and their expertise',
    '- `dispatch_to_project` — create a task for a project\'s agent worker',
    '- `ask_user_question` — ask a clarifying question with 2-4 options',
    '',
    'Task history tools (use these to audit and verify completed work):',
    '- `list_tasks` — list tasks with filters (status, project, agent, priority)',
    '- `get_task` — full details + logs for a single task',
    '',
    'GitHub inspection tools (use these to verify a task actually changed what it claimed):',
    '- `github_get_repo` — repo metadata',
    '- `github_list_branches` — branches',
    '- `github_list_commits` — recent commits (optionally on a branch / path)',
    '- `github_get_commit` — single commit with file changes',
    '- `github_list_pull_requests` — open/closed/all PRs',
    '- `github_get_pull_request` — single PR with body + changed files',
    '- `github_get_file` — file contents at a ref',
    '- `github_list_directory` — directory listing at a ref',
    '',
    'Memory tools (persistent across sessions, scoped to this user):',
    '- `read_memory` — fetch a memory entry by key, or list all entry keys',
    '- `write_memory` — create or overwrite a memory entry',
    '',
    'For GitHub tools, prefer passing `project` (the portal slug) — the owner/repo/default-branch are resolved automatically. Only pass `owner`+`repo` for repos that aren\'t registered as portal projects.',
    '',
    'Auditing a completed task:',
    '1. `get_task` to read the description, resultType, resultUrl, resultSummary.',
    '2. If resultType is "pr", `github_get_pull_request` with the PR number from resultUrl to see what files changed.',
    '3. If resultType is "commit", `github_get_commit` with the sha to see what changed.',
    '4. Spot-check a file with `github_get_file` if you need to verify the implementation.',
    '5. Report: did the task description match what was actually shipped?',
    '',
    'Guidelines for dispatching tasks:',
    '- If the user clearly names a project + describes work, dispatch immediately. Do not ask redundant questions.',
    '- If the project name is ambiguous, use `list_projects` first.',
    '- Default priority is "normal".',
    '- After a successful dispatch, tell the user the task ID and /agents?taskId=... link.',
    '',
    'Guidelines for `ask_user_question`: use sparingly, only when genuinely ambiguous.',
    'For non-tool questions, just answer normally.',
  ].join('\n');

  return base + formatMemoriesBlock(memories);
}

// Cap the number of memories injected so a runaway memory table can't
// blow out the system prompt. Most recently updated wins.
const MAX_MEMORIES_IN_PROMPT = 100;

async function loadUserMemories(userId: string): Promise<MemorySnapshot[]> {
  const entries = await prisma.aiMemory.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_MEMORIES_IN_PROMPT,
    select: { key: true, value: true, type: true },
  });
  return entries;
}

// ─── Question detection ──────────────────────────────────────

function formatQuestionAsText(q: { question: string; options: string[] }): string {
  return `${q.question}\n\nOptions:\n${q.options.map((o) => `- ${o}`).join('\n')}`;
}

// ─── Image attachment limits ─────────────────────────────────

const MAX_IMAGES_PER_MESSAGE = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB decoded
const IMAGE_DATA_URI_RE = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/;
type AnthropicImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/** Returns null if the URI is invalid or oversized. */
function parseImageDataUri(
  dataUri: string
): { mediaType: AnthropicImageMediaType; data: string; byteSize: number } | null {
  const match = IMAGE_DATA_URI_RE.exec(dataUri);
  if (!match) return null;
  const data = match[2]!;
  const byteSize = Math.floor((data.length * 3) / 4);
  if (byteSize > MAX_IMAGE_BYTES) return null;
  return { mediaType: match[1] as AnthropicImageMediaType, data, byteSize };
}

// Drop a thread the client pre-created via POST /api/ai/threads when
// the AI call fails before any messages land — otherwise it sits
// empty in the sidebar forever.
async function deleteThreadIfEmpty(threadId: string, userId: string): Promise<void> {
  const t = await prisma.aiThread.findUnique({
    where: { id: threadId },
    select: { userId: true, messages: true },
  });
  if (!t || t.userId !== userId) return;
  let isEmpty = false;
  try {
    const arr = JSON.parse(t.messages);
    isEmpty = Array.isArray(arr) && arr.length === 0;
  } catch {
    return;
  }
  if (isEmpty) {
    await prisma.aiThread.delete({ where: { id: threadId } });
  }
}

// ─── POST handler ────────────────────────────────────────────

export async function POST(request: Request) {
  let preCreatedThreadId: string | undefined;
  let currentUserId: string | undefined;
  try {
    const user = await requireApiAuth();
    currentUserId = user.id;
    const ip = getClientIp(request);

    const check = checkRateLimit(aiChatLimiter, user.id);
    if (!check.allowed) {
      return NextResponse.json(
        { ok: false, error: 'AI rate limit exceeded. Wait a moment.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      provider: AiProvider;
      messages: AiMessage[];
      threadId?: string;
      maxTokens?: number;
    };

    const { provider, messages: incoming, threadId, maxTokens = 2048 } = body;
    preCreatedThreadId = threadId;

    if (!incoming?.length) {
      return NextResponse.json({ ok: false, error: 'Messages required' }, { status: 400 });
    }

    // Validate image attachments on the final user message (the only
    // place we forward them). Reject oversized or too-many uploads.
    const lastIncoming = incoming[incoming.length - 1];
    const lastImages = lastIncoming?.role === 'user' ? lastIncoming.images ?? [] : [];
    if (lastImages.length > MAX_IMAGES_PER_MESSAGE) {
      return NextResponse.json(
        { ok: false, error: `Too many images (max ${MAX_IMAGES_PER_MESSAGE})` },
        { status: 400 }
      );
    }
    for (const uri of lastImages) {
      const match = IMAGE_DATA_URI_RE.exec(uri);
      if (!match) {
        return NextResponse.json(
          { ok: false, error: 'Invalid image data URI (png/jpeg/gif/webp base64 only)' },
          { status: 400 }
        );
      }
      const byteSize = Math.floor((match[2]!.length * 3) / 4);
      if (byteSize > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'Image exceeds 5 MB limit' },
          { status: 400 }
        );
      }
    }

    let reply: string;
    let pendingQuestion: { question: string; options: string[] } | null = null;
    const toolEvents: string[] = []; // human-readable summary of tools used

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { ok: false, error: 'OpenAI API key not configured' },
          { status: 503 }
        );
      }
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: incoming.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        max_tokens: Math.min(maxTokens, 4096),
      });
      reply = completion.choices[0]?.message?.content || 'No response';
    } else if (provider === 'anthropic') {
      const anthropic = getAnthropicClient();
      if (!anthropic) {
        return NextResponse.json(
          { ok: false, error: 'Anthropic API key not configured' },
          { status: 503 }
        );
      }
      const systemMsg = incoming.find((m) => m.role === 'system');
      const userAndAssistantMsgs = incoming.filter((m) => m.role !== 'system');
      // Memories are loaded per-request — they may change between turns
      // (e.g. the assistant wrote one on the previous reply).
      const memories = await loadUserMemories(user.id);
      const systemPrompt = systemMsg?.content || buildSystemPrompt(memories);

      // Anthropic message history (we may add tool_use / tool_result blocks
      // during the loop but they are NOT persisted — only final user-facing
      // text is saved to the DB).
      const messages: Anthropic.MessageParam[] = userAndAssistantMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      // If the last user message carries images, replace its plain string
      // content with a structured block array containing the images +
      // text. All prior messages stay as strings for backward compat.
      const lastMsg = userAndAssistantMsgs[userAndAssistantMsgs.length - 1];
      if (lastMsg?.role === 'user' && lastMsg.images?.length) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const dataUri of lastMsg.images) {
          const parsed = parseImageDataUri(dataUri);
          if (!parsed) continue;
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          });
        }
        if (lastMsg.content) blocks.push({ type: 'text', text: lastMsg.content });
        if (blocks.length > 0) {
          messages[messages.length - 1] = { role: 'user', content: blocks };
        }
      }

      const MAX_ITERS = 12;
      let finalText = '';
      let askedQuestion: { question: string; options: string[] } | null = null;

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        const resp = await anthropic.messages.create({
          model: ANTHROPIC_MODELS.sonnet,
          max_tokens: Math.min(maxTokens, 4096),
          system: systemPrompt,
          tools: CHAT_TOOLS,
          messages,
        });

        if (resp.stop_reason !== 'tool_use') {
          finalText = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          break;
        }

        // Append assistant turn so the next call sees it
        messages.push({ role: 'assistant', content: resp.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          if (block.name === 'ask_user_question') {
            askedQuestion = block.input as { question: string; options: string[] };
            // Synthesize a tool_result so the conversation stays
            // well-formed if the user comes back. The result text is the
            // user's eventual answer — we don't have it yet, so we
            // record a placeholder. When the user replies as a fresh
            // user message, this in-memory state is gone anyway.
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Question presented to user; response will arrive as the next user message.',
            });
            toolEvents.push(`Asked: ${askedQuestion.question}`);
            continue;
          }
          const result = await executeTool(block.name, block.input as Record<string, unknown>, user);
          toolEvents.push(`${block.name}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }

        // If a question was asked, stop the loop and return to user
        if (askedQuestion) {
          // Use any text the model also produced as preamble; otherwise
          // fall back to the formatted question.
          const preamble = resp.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text.trim())
            .filter(Boolean)
            .join('\n');
          finalText = preamble
            ? `${preamble}\n\n${formatQuestionAsText(askedQuestion)}`
            : formatQuestionAsText(askedQuestion);
          break;
        }

        messages.push({ role: 'user', content: toolResults });
      }

      reply = finalText || 'No response';
      pendingQuestion = askedQuestion;
    } else {
      return NextResponse.json({ ok: false, error: 'Invalid provider' }, { status: 400 });
    }

    // Persist as plain text + (optionally) the user's image data URIs.
    // Tool calls/results are NOT saved — only the user-visible question
    // and reply text. This keeps history readable and avoids
    // re-executing tools when the thread is reloaded.
    let savedThreadId = threadId;
    let messageCount = 0;
    if (threadId) {
      const thread = await prisma.aiThread.findUnique({ where: { id: threadId } });
      if (thread && thread.userId === user.id) {
        const existingMessages = JSON.parse(thread.messages) as AiMessage[];
        existingMessages.push(
          incoming[incoming.length - 1]!,
          { role: 'assistant', content: reply }
        );
        await prisma.aiThread.update({
          where: { id: threadId },
          data: { messages: JSON.stringify(existingMessages) },
        });
        messageCount = existingMessages.length;
        // Thread now has content — disarm the orphan-cleanup guard.
        preCreatedThreadId = undefined;
      }
    } else {
      const allMessages: AiMessage[] = [
        ...incoming,
        { role: 'assistant', content: reply },
      ];
      const thread = await prisma.aiThread.create({
        data: {
          userId: user.id,
          provider,
          title: incoming[0]?.content.slice(0, 100) || 'New chat',
          messages: JSON.stringify(allMessages),
        },
      });
      savedThreadId = thread.id;
      messageCount = allMessages.length;
    }

    await auditLog({
      userId: user.id,
      action: 'ai_chat',
      details: {
        provider,
        threadId: savedThreadId,
        tools: toolEvents,
        imageCount: lastImages.length,
      },
      ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      data: {
        reply,
        threadId: savedThreadId,
        messageCount,
        question: pendingQuestion,
        toolEvents,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (preCreatedThreadId && currentUserId) {
      await deleteThreadIfEmpty(preCreatedThreadId, currentUserId).catch((cleanupErr) => {
        console.error('[ai/chat] orphan cleanup failed:', cleanupErr);
      });
    }
    console.error('AI chat error:', e);
    return NextResponse.json(
      { ok: false, error: `AI error: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
