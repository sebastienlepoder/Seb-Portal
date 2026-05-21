import prisma from '../src/lib/db';
import {
  cloneRepo,
  commitAll,
  ensureNodeModules,
  openPullRequest,
  pushBranch,
} from './git-handler';
import { runAgent } from './claude-agent';
import { runOrchestrator } from './orchestrator';
import { logger } from './logger';
import { getConnection, resolveSecret } from '../src/lib/onepassword';

const DEFAULT_MODEL = process.env.WORKER_DEFAULT_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '300000', 10) || 300000;
const MAX_ITERATIONS = parseInt(process.env.WORKER_MAX_ITERATIONS || '40', 10) || 40;
const NPM_INSTALL_TIMEOUT_MS =
  parseInt(process.env.WORKER_NPM_INSTALL_TIMEOUT_MS || '300000', 10) || 300000;
const SKIP_NPM_INSTALL =
  (process.env.WORKER_SKIP_NPM_INSTALL || '').toLowerCase() === 'true';
// Orchestrator (Maestro) runs longer than a normal task — it dispatches
// multiple specialist sub-tasks back-to-back. Default to 4× the normal
// per-task timeout so Maestro's outer loop has room.
const ORCHESTRATOR_TIMEOUT_MS =
  parseInt(process.env.MAESTRO_TIMEOUT_MS || String(TIMEOUT_MS * 4), 10) ||
  TIMEOUT_MS * 4;
const ORCHESTRATOR_MAX_ITERATIONS =
  parseInt(process.env.MAESTRO_MAX_ITERATIONS || '30', 10) || 30;

interface ExecuteParams {
  taskId: string;
  workerId: string;
}

/**
 * Resolve every ProjectSecretMapping for the project into a Record<envName, value>.
 * Values are NEVER logged — only names appear in TaskLog entries.
 */
async function resolveProjectSecrets(
  taskId: string,
  projectId: string
): Promise<Record<string, string>> {
  const mappings = await prisma.projectSecretMapping.findMany({ where: { projectId } });
  if (mappings.length === 0) return {};
  const conn = await getConnection();
  if (!conn) {
    await logger.warn(
      taskId,
      `Project has ${mappings.length} secret mapping(s) but no 1Password connection is configured — skipping`
    );
    return {};
  }
  const out: Record<string, string> = {};
  const resolved: string[] = [];
  const failed: string[] = [];
  for (const m of mappings) {
    try {
      out[m.envName] = await resolveSecret(m.vaultId, m.itemId, m.fieldLabel);
      resolved.push(m.envName);
    } catch (e) {
      failed.push(`${m.envName} (${(e as Error).message})`);
    }
  }
  if (resolved.length > 0) {
    await logger.info(taskId, `Injected secrets from 1Password: ${resolved.join(', ')}`);
  }
  if (failed.length > 0) {
    await logger.warn(taskId, `Failed to resolve secrets: ${failed.join('; ')}`);
  }
  return out;
}

export async function executeTask({ taskId, workerId }: ExecuteParams): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true, agentProfile: true },
  });
  if (!task) {
    await logger.warn(taskId, `Task ${taskId} disappeared before execution`);
    return;
  }
  const { project, agentProfile } = task;

  await logger.info(taskId, `Worker "${workerId}" starting task: ${task.title}`);
  await logger.info(taskId, `Project: ${project.name} (${project.repoOwner}/${project.repoName})`);
  if (agentProfile) {
    await logger.info(taskId, `Agent: ${agentProfile.name} (${agentProfile.role})`);
  } else {
    await logger.warn(taskId, 'No agent profile assigned — running with a generic prompt');
  }

  // Validate required project fields
  if (!project.repoOwner || !project.repoName) {
    await fail(taskId, 'Project has no repoOwner/repoName configured. Set them in Admin → Projects.');
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN || undefined;
  if (project.allowWrite && !githubToken) {
    await logger.warn(
      taskId,
      'Project has allowWrite=true but GITHUB_TOKEN is not set. Falling back to summary-only mode.'
    );
  }

  let clone: Awaited<ReturnType<typeof cloneRepo>> | null = null;
  try {
    clone = await cloneRepo({
      taskId,
      workerId,
      owner: project.repoOwner,
      name: project.repoName,
      baseBranch: project.workingBranch,
      token: githubToken,
      presetPath: project.clonePath,
    });

    // Install dependencies so the agent can run tsc / lint / tests inside
    // its run_bash tool. Failure here is logged as a warning rather than
    // fatal — the agent can still make code changes, it just won't be
    // able to verify them locally. Skip entirely with WORKER_SKIP_NPM_INSTALL=true.
    if (!SKIP_NPM_INSTALL) {
      try {
        const r = await ensureNodeModules({
          taskId,
          workdir: clone.workdir,
          timeoutMs: NPM_INSTALL_TIMEOUT_MS,
        });
        if (r.skipped) {
          await logger.info(
            taskId,
            `Dependency setup: skipped (${r.reason ?? 'no reason'})`
          );
        }
      } catch (e) {
        await logger.warn(
          taskId,
          `Dependency install failed; agent will run without node_modules: ${(e as Error).message}`
        );
      }
    }

    // Resolve 1Password-backed secrets for this project. extraEnv is passed
    // into the agent's run_bash child env so commands like `npm test` can
    // see the API keys without us writing them to disk.
    const extraEnv = await resolveProjectSecrets(taskId, project.id);

    const systemPrompt =
      agentProfile?.systemPrompt ??
      'You are a careful software engineer. Make the smallest correct change that satisfies the task. When done, call the `finish` tool with a one-paragraph summary.';

    const isOrchestrator = agentProfile?.slug === 'orchestrator';

    const userMessage = [
      `# Task: ${task.title}`,
      '',
      task.description,
      '',
      `Working directory: ${clone.workdir}`,
      `Repository: ${project.repoOwner}/${project.repoName}`,
      `Base branch: ${clone.baseBranch}`,
      `Work branch: ${clone.workBranch}`,
      `Write access: ${project.allowWrite && githubToken ? 'enabled — your changes will be committed' : 'disabled — produce a summary only, no commits will be made'}`,
      '',
      isOrchestrator
        ? 'Plan a sequence of sub-tasks for specialist agents. Each sub-task you dispatch shares this branch — its commits accumulate before the next sub-task runs. When you have nothing left to dispatch, call `finish` with a paragraph describing what each sub-task accomplished.'
        : 'Use the read_file / list_directory / run_bash / write_file tools to inspect and edit code, then call `finish` with a summary. Stay focused on the task above.',
    ].join('\n');

    let result: { ok: boolean; summary: string; filesTouched: string[]; error?: string };
    let subtaskIds: string[] = [];

    if (isOrchestrator) {
      await logger.info(
        taskId,
        `Starting Orchestrator loop (timeout ${Math.round(ORCHESTRATOR_TIMEOUT_MS / 1000)}s, max iterations ${ORCHESTRATOR_MAX_ITERATIONS})…`
      );
      const orch = await runOrchestrator({
        parentTaskId: taskId,
        projectId: project.id,
        workdir: clone.workdir,
        systemPrompt,
        userMessage,
        model: agentProfile?.model || DEFAULT_MODEL,
        maxIterations: ORCHESTRATOR_MAX_ITERATIONS,
        timeoutMs: ORCHESTRATOR_TIMEOUT_MS,
        defaultSubagentModel: DEFAULT_MODEL,
        subagentTimeoutMs: TIMEOUT_MS,
        subagentMaxIterations: MAX_ITERATIONS,
        extraEnv,
      });
      subtaskIds = orch.subtaskIds;
      result = {
        ok: orch.ok,
        summary: orch.summary,
        filesTouched: orch.filesTouched,
        error: orch.error,
      };
    } else {
      await logger.info(taskId, 'Starting agent loop…');
      result = await runAgent({
        taskId,
        workdir: clone.workdir,
        systemPrompt,
        userMessage,
        model: agentProfile?.model || DEFAULT_MODEL,
        maxIterations: MAX_ITERATIONS,
        timeoutMs: TIMEOUT_MS,
        extraEnv,
      });
    }

    if (!result.ok) {
      await fail(taskId, result.error || 'Agent failed', result.summary || undefined);
      return;
    }

    await logger.info(
      taskId,
      isOrchestrator
        ? `Orchestrator finished. ${subtaskIds.length} sub-task(s), ${result.filesTouched.length} unique files touched.`
        : `Agent finished. Files touched: ${result.filesTouched.length}`
    );

    // Decide on result: commit + PR (if writable), else summary-only.
    // For the Orchestrator, sub-tasks have already committed on the shared
    // branch, so we may have commits to push even if the orchestrator's
    // working tree is clean now.
    const hasWorkdirChanges = result.filesTouched.length > 0;
    const hasUnpushedCommits = isOrchestrator && subtaskIds.length > 0;

    if (project.allowWrite && githubToken && (hasWorkdirChanges || hasUnpushedCommits)) {
      // Commit any straggler changes (orchestrator usually has none here).
      let parentCommitHash: string | null = null;
      if (hasWorkdirChanges) {
        const commitMsg = `[agent:${agentProfile?.slug ?? 'auto'}] ${task.title}\n\n${result.summary}`;
        const c = await commitAll({
          taskId,
          workdir: clone.workdir,
          message: commitMsg,
        });
        parentCommitHash = c.commitHash;
        if (!c.changed && !hasUnpushedCommits) {
          await logger.warn(taskId, 'No git diff after agent run — recording summary only');
          await complete(taskId, {
            resultType: 'summary',
            resultUrl: null,
            resultSummary: result.summary,
          });
          return;
        }
      }

      await pushBranch({ taskId, workdir: clone.workdir, branch: clone.workBranch });

      // Build a body that lists sub-task summaries for orchestrator runs.
      const subtaskBlock = isOrchestrator
        ? await buildSubtaskBlock(subtaskIds)
        : '';

      const prUrl = await openPullRequest({
        taskId,
        owner: project.repoOwner,
        repo: project.repoName,
        head: clone.workBranch,
        base: clone.baseBranch,
        title: isOrchestrator ? `[orchestrated] ${task.title}` : `[agent] ${task.title}`,
        body: [
          `Dispatched from LEPODER Portal — task \`${taskId}\``,
          '',
          result.summary,
          '',
          subtaskBlock,
          '---',
          `Agent: ${agentProfile?.name ?? 'auto'} (${agentProfile?.role ?? 'unknown'})`,
          `Files touched: ${result.filesTouched.map((f) => `\`${f}\``).join(', ') || '(none)'}`,
          parentCommitHash ? `Commit: ${parentCommitHash}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        token: githubToken,
      });
      const commitHash = parentCommitHash;

      if (prUrl) {
        await complete(taskId, {
          resultType: 'pr',
          resultUrl: prUrl,
          resultSummary: result.summary,
        });
      } else {
        // Push succeeded but PR creation failed — record commit + branch
        const commitUrl = commitHash
          ? `https://github.com/${project.repoOwner}/${project.repoName}/commit/${commitHash}`
          : null;
        await complete(taskId, {
          resultType: 'commit',
          resultUrl: commitUrl,
          resultSummary:
            result.summary +
            `\n\n(Note: PR creation failed; branch \`${clone.workBranch}\` was pushed.)`,
        });
      }
    } else {
      // Read-only project or no token — summary only
      await complete(taskId, {
        resultType: 'summary',
        resultUrl: null,
        resultSummary: result.summary,
      });
    }
  } catch (e) {
    await fail(taskId, (e as Error).message ?? 'Unknown error');
  } finally {
    if (clone) {
      await clone.cleanup();
    }
  }
}

async function complete(
  taskId: string,
  fields: { resultType: 'commit' | 'pr' | 'summary'; resultUrl: string | null; resultSummary: string }
): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'completed',
      completedAt: new Date(),
      resultType: fields.resultType,
      resultUrl: fields.resultUrl,
      resultSummary: fields.resultSummary,
      errorMessage: null,
    },
  });
  await logger.info(taskId, `Completed (${fields.resultType})`);
}

async function fail(taskId: string, message: string, partialSummary?: string): Promise<void> {
  await logger.error(taskId, `Task failed: ${message}`);
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: message.slice(0, 2000),
      resultSummary: partialSummary ?? null,
    },
  });
}

/**
 * Build the "Sub-tasks" section that goes into the PR body when an
 * Orchestrator coordinated the run. Lists each sub-task with its agent,
 * status, and one-line summary so reviewers can see the breakdown.
 */
async function buildSubtaskBlock(subtaskIds: string[]): Promise<string> {
  if (subtaskIds.length === 0) return '';
  const subtasks = await prisma.task.findMany({
    where: { id: { in: subtaskIds } },
    include: { agentProfile: true },
  });
  // Preserve dispatch order (subtaskIds is in dispatch order, prisma may not be)
  const byId = new Map(subtasks.map((t) => [t.id, t]));
  const lines = ['## Sub-tasks', ''];
  for (const id of subtaskIds) {
    const t = byId.get(id);
    if (!t) continue;
    const agent = t.agentProfile
      ? `${t.agentProfile.name} (${t.agentProfile.slug})`
      : 'unknown';
    const status =
      t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : `· ${t.status}`;
    const firstLine = (t.resultSummary || '').split('\n')[0]?.trim() || '(no summary)';
    lines.push(`- ${status} **${t.title}** — ${agent}`);
    lines.push(`  ${firstLine.slice(0, 200)}`);
  }
  lines.push('');
  return lines.join('\n');
}
