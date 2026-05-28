import type Anthropic from '@anthropic-ai/sdk';
import { requireApiAuth } from '@/lib/auth';
import { checkRateLimit, aiChatLimiter } from '@/lib/rate-limit';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { getAnthropicClient } from '@/lib/anthropic';
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
import type { AiProvider, AiMessage, ToolCall, SessionUser } from '@/types';
import { getModelDef, isModelAvailable, DEFAULT_MODEL_ID } from '@/lib/ai/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

function githubErrorJson(e: unknown): string {
  if (e instanceof GithubError) {
    return JSON.stringify({ error: e.message, status: e.status });
  }
  return JSON.stringify({ error: (e as Error).message });
}

// ─── System prompt ───────────────────────────────────────────

function buildSystemPrompt(): string {
  return [
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

// ─── SSE event types ─────────────────────────────────────────

type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; content: string; success: boolean }
  | { type: 'question'; question: string; options: string[] }
  | { type: 'done'; threadId: string | undefined; messageCount: number }
  | { type: 'error'; error: string };

function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── POST handler — streaming SSE ────────────────────────────

export async function POST(request: Request) {
  let user: SessionUser;
  try {
    user = await requireApiAuth();
  } catch {
    return errorResponse(401, 'Not authenticated');
  }
  const ip = getClientIp(request);

  const check = checkRateLimit(aiChatLimiter, user.id);
  if (!check.allowed) {
    return errorResponse(429, 'AI rate limit exceeded. Wait a moment.');
  }

  const body = (await request.json()) as {
    provider?: AiProvider;
    model?: string;
    messages: AiMessage[];
    threadId?: string;
    maxTokens?: number;
  };

  const { messages: incoming, threadId, maxTokens = 2048 } = body;

  if (!incoming?.length) {
    return errorResponse(400, 'Messages required');
  }

  // Resolve the model. Prefer an explicit model id; fall back to the
  // legacy provider field, then the default.
  const modelDef =
    getModelDef(body.model) ??
    getModelDef(body.provider === 'openai' ? 'gpt-4o' : DEFAULT_MODEL_ID) ??
    getModelDef(DEFAULT_MODEL_ID)!;
  const provider: AiProvider = modelDef.provider === 'anthropic' ? 'anthropic' : 'openai';

  // Validate image attachments on the final user message (the only
  // place we forward them). Reject oversized or too-many uploads.
  const lastIncoming = incoming[incoming.length - 1];
  const lastImages = lastIncoming?.role === 'user' ? lastIncoming.images ?? [] : [];
  if (lastImages.length > MAX_IMAGES_PER_MESSAGE) {
    return errorResponse(400, `Too many images (max ${MAX_IMAGES_PER_MESSAGE})`);
  }
  for (const uri of lastImages) {
    const match = IMAGE_DATA_URI_RE.exec(uri);
    if (!match) {
      return errorResponse(400, 'Invalid image data URI (png/jpeg/gif/webp base64 only)');
    }
    const byteSize = Math.floor((match[2]!.length * 3) / 4);
    if (byteSize > MAX_IMAGE_BYTES) {
      return errorResponse(400, 'Image exceeds 5 MB limit');
    }
  }

  if (!isModelAvailable(modelDef.id)) {
    return errorResponse(503, `Model "${modelDef.label}" is not configured (missing ${modelDef.requiresEnv})`);
  }

  const encoder = new TextEncoder();
  let preCreatedThreadId = threadId;
  const currentUserId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client already closed
        }
      };

      // Buffers collected during the stream so we can persist after.
      let assistantText = '';
      let thinkingText: string | undefined;
      const toolCalls: ToolCall[] = [];
      let pendingQuestion: { question: string; options: string[] } | null = null;
      const toolEvents: string[] = [];

      try {
        if (modelDef.provider === 'anthropic') {
          await runAnthropic({
            incoming,
            maxTokens,
            model: modelDef.modelId,
            user,
            send,
            onText: (delta) => { assistantText += delta; },
            onThinking: (text) => { thinkingText = text; },
            onToolCall: (call) => { toolCalls.push(call); },
            onQuestion: (q) => {
              pendingQuestion = q;
              if (!assistantText) assistantText = formatQuestionAsText(q);
            },
            onToolEvent: (name) => toolEvents.push(name),
            signal: request.signal,
          });
        } else {
          await runOpenAi({
            incoming,
            maxTokens,
            model: modelDef.modelId,
            useOpenRouter: modelDef.provider === 'openrouter',
            send,
            onText: (delta) => { assistantText += delta; },
            signal: request.signal,
          });
        }

        // Persist final user + assistant messages.
        const assistantMsg: AiMessage = {
          role: 'assistant',
          content: assistantText || 'No response',
          ...(thinkingText ? { thinking: thinkingText } : {}),
          ...(toolCalls.length ? { toolCalls } : {}),
        };

        let savedThreadId = threadId;
        let messageCount = 0;
        if (threadId) {
          const thread = await prisma.aiThread.findUnique({ where: { id: threadId } });
          if (thread && thread.userId === user.id) {
            const existingMessages = JSON.parse(thread.messages) as AiMessage[];
            existingMessages.push(incoming[incoming.length - 1]!, assistantMsg);
            await prisma.aiThread.update({
              where: { id: threadId },
              data: { messages: JSON.stringify(existingMessages) },
            });
            messageCount = existingMessages.length;
            preCreatedThreadId = undefined;
          }
        } else {
          const allMessages: AiMessage[] = [...incoming, assistantMsg];
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

        send({ type: 'done', threadId: savedThreadId, messageCount });
      } catch (e) {
        const msg = (e as Error).message;
        if (preCreatedThreadId && currentUserId) {
          await deleteThreadIfEmpty(preCreatedThreadId, currentUserId).catch(() => {});
        }
        send({ type: 'error', error: msg });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// ─── Anthropic streaming runner ──────────────────────────────

interface RunAnthropicArgs {
  incoming: AiMessage[];
  maxTokens: number;
  model: string;
  user: SessionUser;
  send: (e: ChatStreamEvent) => void;
  onText: (delta: string) => void;
  onThinking: (text: string) => void;
  onToolCall: (call: ToolCall) => void;
  onQuestion: (q: { question: string; options: string[] }) => void;
  onToolEvent: (name: string) => void;
  signal: AbortSignal;
}

async function runAnthropic(args: RunAnthropicArgs): Promise<void> {
  const { incoming, maxTokens, model, user, send, onText, onThinking, onToolCall, onQuestion, onToolEvent, signal } = args;
  const anthropic = getAnthropicClient();
  if (!anthropic) throw new Error('Anthropic API key not configured');

  const systemMsg = incoming.find((m) => m.role === 'system');
  const userAndAssistantMsgs = incoming.filter((m) => m.role !== 'system');
  const systemPrompt = systemMsg?.content || buildSystemPrompt();

  const messages: Anthropic.MessageParam[] = userAndAssistantMsgs.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

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
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if (signal.aborted) throw new Error('aborted');

    const stream = anthropic.messages.stream(
      {
        model,
        max_tokens: Math.min(maxTokens, 4096),
        system: systemPrompt,
        tools: CHAT_TOOLS,
        messages,
      },
      { signal }
    );

    stream.on('text', (delta: string) => {
      onText(delta);
      send({ type: 'text', delta });
    });

    const finalMessage = await stream.finalMessage();

    // Surface thinking + tool_use blocks to the client.
    for (const block of finalMessage.content) {
      if (block.type === 'thinking') {
        onThinking(block.thinking);
        send({ type: 'thinking', text: block.thinking });
      }
    }

    if (finalMessage.stop_reason !== 'tool_use') {
      return;
    }

    // Append assistant turn so the next call sees it.
    messages.push({ role: 'assistant', content: finalMessage.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let askedQuestion: { question: string; options: string[] } | null = null;

    for (const block of finalMessage.content) {
      if (block.type !== 'tool_use') continue;

      const callRecord: ToolCall = {
        id: block.id,
        name: block.name,
        input: block.input,
        pending: true,
      };
      onToolCall(callRecord);
      send({ type: 'tool_use', id: block.id, name: block.name, input: block.input });

      if (block.name === 'ask_user_question') {
        askedQuestion = block.input as { question: string; options: string[] };
        send({ type: 'question', question: askedQuestion.question, options: askedQuestion.options });
        callRecord.pending = false;
        callRecord.result = '(presented to user)';
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Question presented to user; response will arrive as the next user message.',
        });
        onToolEvent(`Asked: ${askedQuestion.question}`);
        continue;
      }

      try {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, user);
        callRecord.pending = false;
        callRecord.result = result;
        send({ type: 'tool_result', id: block.id, content: result, success: true });
        onToolEvent(block.name);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
      } catch (e) {
        const errMsg = (e as Error).message;
        callRecord.pending = false;
        callRecord.error = errMsg;
        send({ type: 'tool_result', id: block.id, content: errMsg, success: false });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: errMsg,
          is_error: true,
        });
      }
    }

    if (askedQuestion) {
      onQuestion(askedQuestion);
      return;
    }

    messages.push({ role: 'user', content: toolResults });
  }
}

// ─── OpenAI streaming runner (text-only, no tools) ───────────

interface RunOpenAiArgs {
  incoming: AiMessage[];
  maxTokens: number;
  model: string;
  useOpenRouter: boolean;
  send: (e: ChatStreamEvent) => void;
  onText: (delta: string) => void;
  signal: AbortSignal;
}

async function runOpenAi(args: RunOpenAiArgs): Promise<void> {
  const { incoming, maxTokens, model, useOpenRouter, send, onText, signal } = args;
  const OpenAI = (await import('openai')).default;
  const openai = useOpenRouter
    ? new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY!,
        baseURL: 'https://openrouter.ai/api/v1',
      })
    : new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const stream = await openai.chat.completions.create(
    {
      model,
      messages: incoming.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      max_tokens: Math.min(maxTokens, 4096),
      stream: true,
    },
    { signal }
  );

  for await (const chunk of stream) {
    if (signal.aborted) break;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      onText(delta);
      send({ type: 'text', delta });
    }
  }
}
