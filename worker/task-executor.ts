import prisma from '../src/lib/db';
import {
  cloneRepo,
  commitAll,
  ensureNodeModules,
  openPullRequest,
  pushBranch,
} from './git-handler';
import { runAgent } from './claude-agent';
import { logger } from './logger';

const DEFAULT_MODEL = process.env.WORKER_DEFAULT_MODEL || 'claude-sonnet-4-6';
const TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '300000', 10) || 300000;
const MAX_ITERATIONS = parseInt(process.env.WORKER_MAX_ITERATIONS || '40', 10) || 40;
const NPM_INSTALL_TIMEOUT_MS =
  parseInt(process.env.WORKER_NPM_INSTALL_TIMEOUT_MS || '300000', 10) || 300000;
const SKIP_NPM_INSTALL =
  (process.env.WORKER_SKIP_NPM_INSTALL || '').toLowerCase() === 'true';

interface ExecuteParams {
  taskId: string;
  workerId: string;
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

    const systemPrompt =
      agentProfile?.systemPrompt ??
      'You are a careful software engineer. Make the smallest correct change that satisfies the task. When done, call the `finish` tool with a one-paragraph summary.';

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
      'Use the read_file / list_directory / run_bash / write_file tools to inspect and edit code, then call `finish` with a summary. Stay focused on the task above.',
    ].join('\n');

    await logger.info(taskId, 'Starting agent loop…');

    const result = await runAgent({
      taskId,
      workdir: clone.workdir,
      systemPrompt,
      userMessage,
      model: agentProfile?.model || DEFAULT_MODEL,
      maxIterations: MAX_ITERATIONS,
      timeoutMs: TIMEOUT_MS,
    });

    if (!result.ok) {
      await fail(taskId, result.error || 'Agent failed', result.summary || undefined);
      return;
    }

    await logger.info(taskId, `Agent finished. Files touched: ${result.filesTouched.length}`);

    // Decide on result: commit + PR (if writable), else summary-only
    if (project.allowWrite && githubToken && result.filesTouched.length > 0) {
      const commitMsg = `[agent:${agentProfile?.slug ?? 'auto'}] ${task.title}\n\n${result.summary}`;
      const { commitHash, changed } = await commitAll({
        taskId,
        workdir: clone.workdir,
        message: commitMsg,
      });
      if (!changed) {
        await logger.warn(taskId, 'No git diff after agent run — recording summary only');
        await complete(taskId, {
          resultType: 'summary',
          resultUrl: null,
          resultSummary: result.summary,
        });
        return;
      }
      await pushBranch({ taskId, workdir: clone.workdir, branch: clone.workBranch });
      const prUrl = await openPullRequest({
        taskId,
        owner: project.repoOwner,
        repo: project.repoName,
        head: clone.workBranch,
        base: clone.baseBranch,
        title: `[agent] ${task.title}`,
        body: [
          `Dispatched from LEPODER Portal — task \`${taskId}\``,
          '',
          result.summary,
          '',
          '---',
          `Agent: ${agentProfile?.name ?? 'auto'} (${agentProfile?.role ?? 'unknown'})`,
          `Files touched: ${result.filesTouched.map((f) => `\`${f}\``).join(', ') || '(none)'}`,
          commitHash ? `Commit: ${commitHash}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        token: githubToken,
      });

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
