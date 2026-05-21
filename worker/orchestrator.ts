import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../src/lib/db';
import { runAgent } from './claude-agent';
import { commitAll } from './git-handler';
import { logger } from './logger';

const MAX_SUBTASKS = parseInt(process.env.MAESTRO_MAX_SUBTASKS || '5', 10) || 5;

export interface OrchestratorRunOptions {
  /** Parent (Orchestrator) task id — sub-tasks get parentTaskId set to this. */
  parentTaskId: string;
  /** Project id — sub-tasks inherit it. */
  projectId: string;
  /** Workdir shared with all sub-tasks. */
  workdir: string;
  /** System prompt for the Orchestrator agent itself. */
  systemPrompt: string;
  /** User message describing the parent task. */
  userMessage: string;
  /** Model to use for the Orchestrator's planning calls. */
  model: string;
  /** Hard timeout for the whole orchestration (ms). */
  timeoutMs: number;
  /** Per-tool-loop iteration cap for the Orchestrator's planning calls. */
  maxIterations: number;
  /** Default model used for sub-agents that don't have a model override. */
  defaultSubagentModel: string;
  /** Per-sub-task timeout in ms. */
  subagentTimeoutMs: number;
  /** Per-sub-task tool-loop iteration cap. */
  subagentMaxIterations: number;
  /** Extra env vars threaded into every sub-agent's run_bash. Values never logged. */
  extraEnv?: Record<string, string>;
}

export interface OrchestratorResult {
  ok: boolean;
  summary: string;
  /** Aggregate of every file any sub-task touched. */
  filesTouched: string[];
  /** Sub-task ids in order of dispatch. */
  subtaskIds: string[];
  error?: string;
}

const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_agents',
    description:
      'List the active specialist agents available for sub-task dispatch (slug, role, expertise tags, description).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description:
      'Read a UTF-8 text file from the cloned repo by path relative to the repo root. Returns up to 50,000 characters.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List directory contents (one per line, trailing / for dirs). Path is relative; "." for repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'dispatch_subtask',
    description:
      'Run a specialist agent on the SAME workdir. The agent makes file changes; the worker commits them on the current branch. Returns the agent\'s summary, the files it touched, and the commit hash (if it produced changes).',
    input_schema: {
      type: 'object',
      properties: {
        agent_slug: {
          type: 'string',
          description:
            'Slug of the specialist (e.g. "backend-engineer", "ui-ux-pro-max"). Use list_agents to discover. Do NOT pass "orchestrator" — that\'s you.',
        },
        title: {
          type: 'string',
          description: 'Short imperative title used in the commit message and dashboard.',
        },
        description: {
          type: 'string',
          description:
            'Concrete instructions for the specialist. Reference specific file paths and what other agents have already changed if relevant.',
        },
      },
      required: ['agent_slug', 'title', 'description'],
    },
  },
  {
    name: 'finish',
    description:
      'Declare the orchestration complete. The worker pushes the branch and opens a single PR. Provide a one-paragraph summary explaining what each sub-task accomplished.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

function safeJoin(workdir: string, rel: string): string | null {
  const cleaned = rel.startsWith('/') ? rel.slice(1) : rel;
  const abs = path.resolve(workdir, cleaned);
  const work = path.resolve(workdir);
  if (abs !== work && !abs.startsWith(work + path.sep)) return null;
  return abs;
}

async function listAgentsTool(): Promise<string> {
  const agents = await prisma.agentProfile.findMany({
    where: { isActive: true, slug: { not: 'orchestrator' } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { slug: true, name: true, role: true, description: true, expertise: true },
  });
  return JSON.stringify(
    agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      role: a.role,
      description: a.description,
      expertise: (() => {
        try {
          const v = JSON.parse(a.expertise);
          return Array.isArray(v) ? v : [];
        } catch {
          return [];
        }
      })(),
    }))
  );
}

async function readFileTool(workdir: string, rel: string): Promise<{ result: string; isError: boolean }> {
  const abs = safeJoin(workdir, rel);
  if (!abs) return { result: 'Error: path escapes workdir', isError: true };
  try {
    const content = await fs.readFile(abs, 'utf-8');
    return {
      result:
        content.length > 50_000 ? content.slice(0, 50_000) + '\n…[truncated]' : content,
      isError: false,
    };
  } catch (e) {
    return { result: `Error: ${(e as Error).message}`, isError: true };
  }
}

async function listDirectoryTool(
  workdir: string,
  rel: string
): Promise<{ result: string; isError: boolean }> {
  const abs = safeJoin(workdir, rel);
  if (!abs) return { result: 'Error: path escapes workdir', isError: true };
  try {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const lines = entries
      .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .join('\n');
    return { result: lines || '(empty)', isError: false };
  } catch (e) {
    return { result: `Error: ${(e as Error).message}`, isError: true };
  }
}

interface SubtaskDispatchResult {
  ok: boolean;
  summary: string;
  filesTouched: string[];
  commitHash: string | null;
  taskId: string;
  error?: string;
}

async function dispatchSubtask(params: {
  parentTaskId: string;
  projectId: string;
  workdir: string;
  agentSlug: string;
  title: string;
  description: string;
  defaultModel: string;
  timeoutMs: number;
  maxIterations: number;
  extraEnv?: Record<string, string>;
}): Promise<SubtaskDispatchResult> {
  const {
    parentTaskId,
    projectId,
    workdir,
    agentSlug,
    title,
    description,
    defaultModel,
    timeoutMs,
    maxIterations,
    extraEnv,
  } = params;

  // Resolve the specialist
  const agent = await prisma.agentProfile.findUnique({ where: { slug: agentSlug } });
  if (!agent) {
    return {
      ok: false,
      summary: '',
      filesTouched: [],
      commitHash: null,
      taskId: '',
      error: `No agent with slug "${agentSlug}". Use list_agents to see available slugs.`,
    };
  }
  if (!agent.isActive) {
    return {
      ok: false,
      summary: '',
      filesTouched: [],
      commitHash: null,
      taskId: '',
      error: `Agent "${agent.slug}" is inactive.`,
    };
  }
  if (agent.slug === 'orchestrator') {
    return {
      ok: false,
      summary: '',
      filesTouched: [],
      commitHash: null,
      taskId: '',
      error: 'Cannot dispatch to the orchestrator. Pick a specialist.',
    };
  }

  // Create the sub-task row so it appears on the dashboard
  const subtask = await prisma.task.create({
    data: {
      projectId,
      agentProfileId: agent.id,
      parentTaskId,
      title: title.slice(0, 200),
      description,
      priority: 'normal',
      status: 'in_progress',
      workerStartedAt: new Date(),
    },
  });

  await logger.info(
    parentTaskId,
    `Dispatching sub-task to ${agent.name} (${agent.slug}): ${title}`,
    { subtaskId: subtask.id }
  );
  await logger.info(subtask.id, `Sub-task started by orchestrator (parent ${parentTaskId})`);

  // Build the user message for the specialist
  const userMessage = [
    `# Sub-task: ${title}`,
    '',
    description,
    '',
    `Working directory: ${workdir}`,
    '',
    'You are a sub-task in an Orchestrator-coordinated workflow. The repo may already contain changes from previous sub-tasks on the same branch — start by inspecting the working tree if relevant. Make your changes, then call `finish` with a short summary.',
  ].join('\n');

  let runResult;
  try {
    runResult = await runAgent({
      taskId: subtask.id,
      workdir,
      systemPrompt: agent.systemPrompt,
      userMessage,
      model: agent.model || defaultModel,
      maxIterations,
      timeoutMs,
      extraEnv,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.task.update({
      where: { id: subtask.id },
      data: {
        status: 'failed',
        errorMessage: msg.slice(0, 2000),
        completedAt: new Date(),
      },
    });
    await logger.error(parentTaskId, `Sub-task ${subtask.id} crashed: ${msg}`);
    return {
      ok: false,
      summary: '',
      filesTouched: [],
      commitHash: null,
      taskId: subtask.id,
      error: msg,
    };
  }

  if (!runResult.ok) {
    await prisma.task.update({
      where: { id: subtask.id },
      data: {
        status: 'failed',
        errorMessage: (runResult.error || 'agent failed').slice(0, 2000),
        resultSummary: runResult.summary || null,
        completedAt: new Date(),
      },
    });
    await logger.warn(parentTaskId, `Sub-task ${subtask.id} failed: ${runResult.error ?? '?'}`);
    return {
      ok: false,
      summary: runResult.summary || '',
      filesTouched: runResult.filesTouched,
      commitHash: null,
      taskId: subtask.id,
      error: runResult.error,
    };
  }

  // Commit any changes the sub-task produced on the shared branch
  let commitHash: string | null = null;
  let changed = false;
  if (runResult.filesTouched.length > 0) {
    try {
      const c = await commitAll({
        taskId: subtask.id,
        workdir,
        message: `[agent:${agent.slug}] ${title}\n\n${runResult.summary}`,
      });
      commitHash = c.commitHash;
      changed = c.changed;
    } catch (e) {
      await logger.error(
        subtask.id,
        `Sub-task commit failed (changes left in working tree): ${(e as Error).message}`
      );
    }
  }

  await prisma.task.update({
    where: { id: subtask.id },
    data: {
      status: 'needs_review',
      completedAt: new Date(),
      resultType: changed ? 'commit' : 'summary',
      resultUrl: null,
      resultSummary: runResult.summary,
      errorMessage: null,
    },
  });
  await logger.info(
    parentTaskId,
    `Sub-task ${subtask.id} completed (${runResult.filesTouched.length} files, commit ${commitHash ?? 'none'})`
  );

  return {
    ok: true,
    summary: runResult.summary,
    filesTouched: runResult.filesTouched,
    commitHash,
    taskId: subtask.id,
  };
}

export async function runOrchestrator(
  opts: OrchestratorRunOptions
): Promise<OrchestratorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      summary: '',
      filesTouched: [],
      subtaskIds: [],
      error: 'ANTHROPIC_API_KEY not set',
    };
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  const client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });

  const startedAt = Date.now();
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        opts.userMessage,
        '',
        `You can dispatch up to ${MAX_SUBTASKS} sub-tasks. Plan carefully.`,
      ].join('\n'),
    },
  ];

  const allFilesTouched = new Set<string>();
  const subtaskIds: string[] = [];
  let summary = '';
  let subtaskCount = 0;

  for (let iter = 0; iter < opts.maxIterations; iter++) {
    if (Date.now() - startedAt > opts.timeoutMs) {
      return {
        ok: false,
        summary,
        filesTouched: Array.from(allFilesTouched),
        subtaskIds,
        error: `Orchestrator timed out after ${opts.timeoutMs}ms (iteration ${iter})`,
      };
    }

    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model: opts.model,
        max_tokens: 4096,
        system: opts.systemPrompt,
        tools: ORCHESTRATOR_TOOLS,
        messages,
      });
    } catch (e) {
      return {
        ok: false,
        summary,
        filesTouched: Array.from(allFilesTouched),
        subtaskIds,
        error: `Anthropic API error: ${(e as Error).message}`,
      };
    }

    await logger.info(
      opts.parentTaskId,
      `[orchestrator] iteration ${iter + 1}: stop_reason=${resp.stop_reason}`,
      { usage: resp.usage }
    );

    for (const block of resp.content) {
      if (block.type === 'text' && block.text.trim()) {
        await logger.info(opts.parentTaskId, `🎼 ${block.text.trim()}`);
      }
    }

    if (resp.stop_reason !== 'tool_use') {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      summary = text || summary || 'Orchestration ended without explicit summary.';
      return { ok: true, summary, filesTouched: Array.from(allFilesTouched), subtaskIds };
    }

    messages.push({ role: 'assistant', content: resp.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finished: { summary: string } | null = null;

    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Record<string, unknown>;

      if (block.name === 'finish') {
        finished = { summary: String(input.summary ?? '').trim() || 'Orchestration complete.' };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: 'Acknowledged. Closing out.',
        });
        continue;
      }

      if (block.name === 'list_agents') {
        const result = await listAgentsTool();
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        continue;
      }

      if (block.name === 'read_file') {
        const out = await readFileTool(opts.workdir, String(input.path ?? ''));
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: out.result,
          is_error: out.isError || undefined,
        });
        continue;
      }

      if (block.name === 'list_directory') {
        const out = await listDirectoryTool(opts.workdir, String(input.path ?? '.'));
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: out.result,
          is_error: out.isError || undefined,
        });
        continue;
      }

      if (block.name === 'dispatch_subtask') {
        if (subtaskCount >= MAX_SUBTASKS) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `MAX_SUBTASKS (${MAX_SUBTASKS}) reached. Call finish now with what you have.`,
            is_error: true,
          });
          continue;
        }
        subtaskCount++;
        const r = await dispatchSubtask({
          parentTaskId: opts.parentTaskId,
          projectId: opts.projectId,
          workdir: opts.workdir,
          agentSlug: String(input.agent_slug ?? ''),
          title: String(input.title ?? ''),
          description: String(input.description ?? ''),
          defaultModel: opts.defaultSubagentModel,
          timeoutMs: opts.subagentTimeoutMs,
          maxIterations: opts.subagentMaxIterations,
          extraEnv: opts.extraEnv,
        });
        if (r.taskId) subtaskIds.push(r.taskId);
        for (const f of r.filesTouched) allFilesTouched.add(f);

        const payload = {
          success: r.ok,
          subtaskId: r.taskId,
          agent: input.agent_slug,
          summary: r.summary,
          filesTouched: r.filesTouched,
          commitHash: r.commitHash,
          error: r.error,
          remainingSubtaskBudget: MAX_SUBTASKS - subtaskCount,
        };
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(payload),
          is_error: !r.ok || undefined,
        });
        continue;
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Unknown tool: ${block.name}`,
        is_error: true,
      });
    }

    messages.push({ role: 'user', content: toolResults });

    if (finished) {
      summary = finished.summary;
      return { ok: true, summary, filesTouched: Array.from(allFilesTouched), subtaskIds };
    }
  }

  return {
    ok: false,
    summary,
    filesTouched: Array.from(allFilesTouched),
    subtaskIds,
    error: `Orchestrator reached max iterations (${opts.maxIterations}) without finishing`,
  };
}
