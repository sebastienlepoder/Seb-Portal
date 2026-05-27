import { z } from 'zod';
import {
  query,
  createSdkMcpServer,
  tool,
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import prisma from '../src/lib/db';
import { runAgent } from './claude-agent';
import { commitAll } from './git-handler';
import { logger } from './logger';
import { applyAuthEnv, describeAuthMode, getWorkerAuthMode } from './auth-mode';

const MAX_SUBTASKS = parseInt(process.env.MAESTRO_MAX_SUBTASKS || '5', 10) || 5;

export interface OrchestratorRunOptions {
  parentTaskId: string;
  projectId: string;
  workdir: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  /** Hard timeout for the whole orchestration (ms). */
  timeoutMs: number;
  /** Default model used for sub-agents that don't have a model override. */
  defaultSubagentModel: string;
  /** Per-sub-task timeout in ms. */
  subagentTimeoutMs: number;
  /** Extra env passed through to sub-agents (1Password project secrets). */
  extraEnv?: Record<string, string>;
}

export interface OrchestratorResult {
  ok: boolean;
  summary: string;
  /** Aggregate of every file any sub-task touched. */
  filesTouched: string[];
  /** Sub-task ids in order of dispatch. */
  subtaskIds: string[];
  /** Orchestrator's own planning cost (excludes sub-task costs, which are
   *  written to each sub-task's own Task.costUsd row). */
  costUsd?: number;
  error?: string;
}

const SENSITIVE_ENV_KEYS = new Set([
  'AUTH_SECRET',
  'CSRF_SECRET',
  'AMONIS_API_TOKEN',
  'WEBHOOK_AUTH_TOKEN',
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'ONEPASSWORD_ENCRYPTION_KEY',
  'OP_CONNECT_TOKEN',
  'MCP_AUTH_TOKEN',
  'ADMIN_PASSWORD',
  'DATABASE_URL',
]);
const SENSITIVE_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i;

function sanitizeShellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SENSITIVE_ENV_KEYS.has(k)) continue;
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    env[k] = v;
  }
  // Auth env vars are added separately by applyAuthEnv() at call time so
  // we can consult the admin setting (which is async).
  return env;
}

async function listAgentsJson(): Promise<string> {
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
    })),
  );
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
    extraEnv,
  } = params;

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
    { subtaskId: subtask.id },
  );
  await logger.info(subtask.id, `Sub-task started by orchestrator (parent ${parentTaskId})`);

  const userMessage = [
    `# Sub-task: ${title}`,
    '',
    description,
    '',
    `Working directory: ${workdir}`,
    '',
    'You are a sub-task in an Orchestrator-coordinated workflow. The repo may already contain changes from previous sub-tasks on the same branch — start by inspecting the working tree if relevant. Make your changes and produce a short summary when done.',
  ].join('\n');

  let runResult;
  try {
    runResult = await runAgent({
      taskId: subtask.id,
      workdir,
      systemPrompt: agent.systemPrompt,
      userMessage,
      model: agent.model || defaultModel,
      timeoutMs,
      extraEnv,
    });
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.task.update({
      where: { id: subtask.id },
      data: { status: 'failed', errorMessage: msg.slice(0, 2000), completedAt: new Date() },
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
        `Sub-task commit failed (changes left in working tree): ${(e as Error).message}`,
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
      costUsd: runResult.costUsd ?? null,
    },
  });
  await logger.info(
    parentTaskId,
    `Sub-task ${subtask.id} completed (${runResult.filesTouched.length} files, commit ${commitHash ?? 'none'})`,
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
  opts: OrchestratorRunOptions,
): Promise<OrchestratorResult> {
  const allFilesTouched = new Set<string>();
  const subtaskIds: string[] = [];
  let summary = '';
  let ok = false;
  let error: string | undefined;
  let costUsd: number | undefined;
  let subtaskCount = 0;

  const env = sanitizeShellEnv();
  const authMode = await getWorkerAuthMode();
  applyAuthEnv(env, authMode);
  await logger.info(opts.parentTaskId, `Auth: ${describeAuthMode(authMode)}`);
  const maxTurns = parseInt(process.env.MAESTRO_MAX_TURNS || '60', 10) || 60;

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), opts.timeoutMs);

  // Custom MCP tools — list_agents + dispatch_subtask. The orchestrator
  // doesn't write code itself; specialists do, on the shared branch.
  const orchestratorMcp = createSdkMcpServer({
    name: 'orchestrator',
    version: '1.0.0',
    tools: [
      tool(
        'list_agents',
        'List the active specialist agents available for sub-task dispatch (slug, role, expertise tags, description). Returns a JSON array.',
        {},
        async () => ({
          content: [{ type: 'text', text: await listAgentsJson() }],
        }),
      ),
      tool(
        'dispatch_subtask',
        'Run a specialist agent on the SAME workdir. The specialist makes file changes; the orchestrator process commits them on the current branch and the orchestrator continues. Returns the specialist\'s summary, files it touched, and the commit hash (if it produced changes).',
        {
          agent_slug: z
            .string()
            .describe(
              'Slug of the specialist (e.g. "backend-engineer", "ui-ux-pro-max"). Use list_agents to discover. Do NOT pass "orchestrator" — that\'s you.',
            ),
          title: z
            .string()
            .describe('Short imperative title used in the commit message and dashboard.'),
          description: z
            .string()
            .describe(
              'Concrete instructions for the specialist. Reference specific file paths and what other agents have already changed if relevant.',
            ),
        },
        async ({ agent_slug, title, description }) => {
          if (subtaskCount >= MAX_SUBTASKS) {
            return {
              content: [
                {
                  type: 'text',
                  text: `MAX_SUBTASKS (${MAX_SUBTASKS}) reached. Wrap up now.`,
                },
              ],
              isError: true,
            };
          }
          subtaskCount++;
          const r = await dispatchSubtask({
            parentTaskId: opts.parentTaskId,
            projectId: opts.projectId,
            workdir: opts.workdir,
            agentSlug: agent_slug,
            title,
            description,
            defaultModel: opts.defaultSubagentModel,
            timeoutMs: opts.subagentTimeoutMs,
            extraEnv: opts.extraEnv,
          });
          if (r.taskId) subtaskIds.push(r.taskId);
          for (const f of r.filesTouched) allFilesTouched.add(f);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: r.ok,
                  subtaskId: r.taskId,
                  agent: agent_slug,
                  summary: r.summary,
                  filesTouched: r.filesTouched,
                  commitHash: r.commitHash,
                  error: r.error,
                  remainingSubtaskBudget: MAX_SUBTASKS - subtaskCount,
                }),
              },
            ],
            isError: !r.ok,
          };
        },
      ),
    ],
  });

  // Orchestrator gets read-only built-in tools (no Write/Edit/Bash) plus the
  // two MCP tools above. MCP tools are namespaced `mcp__<server>__<tool>`.
  const orchestratorTools = [
    'Read',
    'Glob',
    'LS',
    'Grep',
    'mcp__orchestrator__list_agents',
    'mcp__orchestrator__dispatch_subtask',
  ];

  try {
    const stream: AsyncIterable<SDKMessage> = query({
      prompt: [
        opts.userMessage,
        '',
        `You can dispatch up to ${MAX_SUBTASKS} sub-tasks. Plan carefully.`,
      ].join('\n'),
      options: {
        model: opts.model,
        systemPrompt: opts.systemPrompt,
        cwd: opts.workdir,
        tools: orchestratorTools,
        allowedTools: orchestratorTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        mcpServers: { orchestrator: orchestratorMcp },
        env,
        abortController,
        maxTurns,
      },
    });

    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            await logger.info(opts.parentTaskId, `🎼 ${block.text.trim()}`);
          } else if (block.type === 'tool_use') {
            await logger.info(opts.parentTaskId, `→ ${block.name}`);
          }
        }
      } else if (message.type === 'result') {
        costUsd = message.total_cost_usd;
        if (message.subtype === 'success') {
          summary = message.result || '';
          ok = true;
          await logger.info(
            opts.parentTaskId,
            `✓ orchestrator done — ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`,
            { usage: message.usage },
          );
        } else {
          const errMsg =
            (message as Record<string, unknown>).result ||
            (message as Record<string, unknown>).error ||
            'orchestrator ended in error';
          error = String(errMsg).slice(0, 2000);
        }
      }
    }
  } catch (e) {
    if (abortController.signal.aborted) {
      error = `Orchestrator timed out after ${opts.timeoutMs}ms`;
    } else {
      error = `Claude Agent SDK error: ${(e as Error).message}`;
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  return {
    ok,
    summary,
    filesTouched: Array.from(allFilesTouched),
    subtaskIds,
    costUsd,
    error: ok ? undefined : error || 'orchestrator did not produce a result',
  };
}
