import prisma from '../src/lib/db';
import {
  cloneRepo,
  commitAll,
  countUnpushedCommits,
  ensureNodeModules,
  mergePullRequest,
  openPullRequest,
  pushBranch,
} from './git-handler';
import { runAgent } from './claude-agent';
import { runOrchestrator } from './orchestrator';
import { logger } from './logger';
import { resolveProjectSecrets } from '../src/lib/onepassword';

const DEFAULT_MODEL = process.env.WORKER_DEFAULT_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '300000', 10) || 300000;
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

interface ExecuteParams {
  taskId: string;
  workerId: string;
}

async function buildParentContextBlock(parentTaskId: string): Promise<string | null> {
  const parent = await prisma.task.findUnique({
    where: { id: parentTaskId },
    include: { agentProfile: true, project: true },
  });
  if (!parent) return null;
  const lines: string[] = [
    '## Prior task context (this is a follow-up)',
    '',
    `**Original task title:** ${parent.title}`,
    `**Status:** ${parent.status}`,
  ];
  if (parent.agentProfile) {
    lines.push(`**Handled by:** ${parent.agentProfile.name} (${parent.agentProfile.slug})`);
  }
  if (parent.resultType) lines.push(`**Result type:** ${parent.resultType}`);
  if (parent.resultUrl) lines.push(`**Result URL:** ${parent.resultUrl}`);
  lines.push('', '### Original instructions', parent.description.trim());
  if (parent.resultSummary?.trim()) {
    lines.push('', '### What was done', parent.resultSummary.trim());
  }
  if (parent.errorMessage?.trim()) {
    lines.push('', '### Error from prior run', parent.errorMessage.trim());
  }
  lines.push(
    '',
    '---',
    '',
    '## Follow-up task',
    '',
    'The user is asking you to continue from the prior task above. Read the relevant files first to understand the current state of the code before making changes.'
  );
  return lines.join('\n');
}

// 1Password Connect-resolved secrets are passed only to spawned tools; they are never logged.
async function loadProjectSecrets(
  taskId: string,
  projectId: string
): Promise<Record<string, string>> {
  const env = await resolveProjectSecrets(projectId);
  const names = Object.keys(env);
  if (names.length > 0) {
    await logger.info(taskId, `Injected secrets from 1Password: ${names.join(', ')}`);
  }
  return env;
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

    // 1Password Connect-resolved secrets are passed only to spawned tools; they are never logged.
    const extraEnv = await loadProjectSecrets(taskId, project.id);

    const systemPrompt =
      agentProfile?.systemPrompt ??
      'You are a careful software engineer. Make the smallest correct change that satisfies the task. When done, call the `finish` tool with a one-paragraph summary.';

    const isOrchestrator = agentProfile?.slug === 'orchestrator';

    let userMessage = [
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
        ? 'Plan a sequence of sub-tasks for specialist agents using the `list_agents` and `dispatch_subtask` MCP tools. Each sub-task shares this branch — its commits accumulate before the next runs. When you have nothing left to dispatch, produce a final paragraph describing what each sub-task accomplished and stop.'
        : 'Use the Read / LS / Glob / Grep / Edit / Write / Bash tools to inspect and edit code, then produce a short final summary. Stay focused on the task above.',
    ].join('\n');

    if (task.parentTaskId) {
      const ctx = await buildParentContextBlock(task.parentTaskId);
      if (ctx) {
        userMessage = ctx + '\n\n' + userMessage;
        await logger.info(taskId, `Follow-up of task ${task.parentTaskId} — prepended parent context`);
      }
    }

    let result: {
      ok: boolean;
      summary: string;
      filesTouched: string[];
      costUsd?: number;
      authPath?: 'oauth' | 'api_key';
      error?: string;
    };
    let subtaskIds: string[] = [];

    if (isOrchestrator) {
      await logger.info(
        taskId,
        `Starting Orchestrator loop (timeout ${Math.round(ORCHESTRATOR_TIMEOUT_MS / 1000)}s)…`,
      );
      const orch = await runOrchestrator({
        parentTaskId: taskId,
        projectId: project.id,
        workdir: clone.workdir,
        systemPrompt,
        userMessage,
        model: agentProfile?.model || DEFAULT_MODEL,
        timeoutMs: ORCHESTRATOR_TIMEOUT_MS,
        defaultSubagentModel: DEFAULT_MODEL,
        subagentTimeoutMs: TIMEOUT_MS,
        extraEnv,
      });
      subtaskIds = orch.subtaskIds;
      result = {
        ok: orch.ok,
        summary: orch.summary,
        filesTouched: orch.filesTouched,
        costUsd: orch.costUsd,
        authPath: orch.authPath,
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
          const agentCommits = await countUnpushedCommits({
            taskId,
            workdir: clone.workdir,
            baseBranch: clone.baseBranch,
          });
          if (agentCommits === 0) {
            await logger.warn(taskId, 'No git diff after agent run — recording summary only');
            await complete(taskId, {
              resultType: 'summary',
              resultUrl: null,
              resultSummary: result.summary,
              mergedAt: null,
              costUsd: result.costUsd ?? null,
              authPath: result.authPath ?? null,
            });
            return;
          }
          await logger.info(
            taskId,
            `Agent committed ${agentCommits} commit(s) directly — pushing branch`
          );
        }
      }

      await pushBranch({ taskId, workdir: clone.workdir, branch: clone.workBranch, token: githubToken });

      // Build a body that lists sub-task summaries for orchestrator runs.
      const subtaskBlock = isOrchestrator
        ? await buildSubtaskBlock(subtaskIds)
        : '';

      const prTitle = isOrchestrator
        ? `[orchestrated] ${task.title}`
        : `[agent] ${task.title}`;
      const pr = await openPullRequest({
        taskId,
        owner: project.repoOwner,
        repo: project.repoName,
        head: clone.workBranch,
        base: clone.baseBranch,
        title: prTitle,
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

      if (pr) {
        let summary = result.summary;
        let mergedAt: Date | null = null;
        // Auto-merge if requested. We tried in the order: PR creation → auto-merge.
        // If auto-merge fails (branch protection, conflicts, token perms), the PR
        // stays open and the user can finish it by hand — never throw away the
        // agent's work over a merge failure.
        if (task.autoMerge) {
          await logger.info(taskId, `auto_merge requested — calling GitHub merge API for PR #${pr.number}`);
          const m = await mergePullRequest({
            taskId,
            owner: project.repoOwner,
            repo: project.repoName,
            prNumber: pr.number,
            token: githubToken,
            method: 'squash',
            commitTitle: `${prTitle} (#${pr.number})`,
          });
          if (m.merged) {
            await logger.info(taskId, `Auto-merged PR #${pr.number} (sha ${m.sha ?? '?'})`);
            summary += `\n\nAuto-merged into ${clone.baseBranch} (commit ${m.sha ?? 'unknown'}).`;
            mergedAt = new Date();
          } else {
            summary +=
              `\n\nNote: auto-merge requested but failed (${m.error ?? 'unknown'}). PR is open at ${pr.url} — finish it by hand.`;
          }
        }
        await complete(taskId, {
          resultType: 'pr',
          resultUrl: pr.url,
          resultSummary: summary,
          mergedAt,
          costUsd: result.costUsd ?? null,
              authPath: result.authPath ?? null,
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
          mergedAt: null,
          costUsd: result.costUsd ?? null,
              authPath: result.authPath ?? null,
        });
      }
    } else {
      // Read-only project or no token — summary only
      await complete(taskId, {
        resultType: 'summary',
        resultUrl: null,
        resultSummary: result.summary,
        mergedAt: null,
        costUsd: result.costUsd ?? null,
              authPath: result.authPath ?? null,
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
  fields: {
    resultType: 'commit' | 'pr' | 'summary';
    resultUrl: string | null;
    resultSummary: string;
    mergedAt: Date | null;
    costUsd: number | null;
    authPath: 'oauth' | 'api_key' | null;
  }
): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'needs_review',
      completedAt: new Date(),
      mergedAt: fields.mergedAt,
      resultType: fields.resultType,
      resultUrl: fields.resultUrl,
      resultSummary: fields.resultSummary,
      errorMessage: null,
      costUsd: fields.costUsd,
      authPath: fields.authPath,
    },
  });
  await logger.info(taskId, `Worker finished — task needs review (${fields.resultType})`);
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
      t.status === 'completed' || t.status === 'needs_review'
        ? '✓'
        : t.status === 'failed'
          ? '✗'
          : `· ${t.status}`;
    const firstLine = (t.resultSummary || '').split('\n')[0]?.trim() || '(no summary)';
    lines.push(`- ${status} **${t.title}** — ${agent}`);
    lines.push(`  ${firstLine.slice(0, 200)}`);
  }
  lines.push('');
  return lines.join('\n');
}
