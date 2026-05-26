import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

export interface CloneResult {
  workdir: string;
  baseBranch: string;
  workBranch: string;
  cleanup: () => Promise<void>;
}

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  taskId: string;
  /** When true, log stdout/stderr to TaskLog as info/stdout. Defaults true. */
  log?: boolean;
  /** Hard kill after this many ms. Default: no timeout. */
  timeoutMs?: number;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer =
      opts.timeoutMs !== undefined && opts.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            try {
              child.kill('SIGTERM');
            } catch {
              /* ignore */
            }
            // SIGKILL after a grace period if still alive
            setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                /* ignore */
              }
            }, 1000);
          }, opts.timeoutMs)
        : null;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (opts.log !== false) void logger.stdout(opts.taskId, s.trimEnd());
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (opts.log !== false) void logger.stderr(opts.taskId, s.trimEnd());
    });
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      void logger.error(opts.taskId, `spawn error: ${e.message}`);
      resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const finalStderr = timedOut
        ? stderr + `\n[killed after ${opts.timeoutMs}ms timeout]`
        : stderr;
      resolve({ code: timedOut ? 124 : code ?? -1, stdout, stderr: finalStderr });
    });
  });
}

function cloneUrl(owner: string, name: string): string {
  return `https://github.com/${owner}/${name}.git`;
}

/**
 * Remote URL with the GitHub token embedded for HTTPS auth. Used for clone,
 * fetch, push, and `git remote set-url` so headless git operations succeed
 * without a credential helper or a TTY prompt.
 *
 * The token persists in the checkout's `.git/config` until the next time
 * we call this (with a fresh token) or set the remote back to the
 * unauthenticated URL. Callers must keep clone dirs unreadable by other
 * users (workdirs live under WORKER_CLONES_DIR inside the worker container).
 */
function authedRemoteUrl(owner: string, name: string, token: string): string {
  return `https://${token}@github.com/${owner}/${name}.git`;
}

function redactToken(text: string, token: string | undefined): string {
  if (!token || !text) return text;
  return text.split(token).join('***');
}

/**
 * Resolve the workdir to use for a repo. Priority:
 *   1. presetPath if provided (project-level override)
 *   2. WORKER_CLONES_DIR / <owner>__<name> if the dir is writable — this
 *      persists between tasks so node_modules is reused
 *   3. tmp dir as a last-resort fallback (used in local dev when the
 *      compose-managed volume isn't available)
 *
 * Returns { workdir, persistent } where `persistent` tells callers whether
 * the directory should be preserved on cleanup.
 */
async function resolveWorkdir(params: {
  workerId: string;
  owner: string;
  name: string;
  presetPath?: string | null;
}): Promise<{ workdir: string; persistent: boolean }> {
  const { workerId, owner, name, presetPath } = params;
  if (presetPath) return { workdir: presetPath, persistent: true };

  const baseDir = process.env.WORKER_CLONES_DIR || '/app/worker-clones';
  try {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.access(baseDir, fsConstants.W_OK);
    return {
      workdir: path.join(baseDir, `${owner}__${name}`),
      persistent: true,
    };
  } catch {
    // Fall back to tmp (e.g. local dev without the compose volume mount)
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `portal-worker-${workerId}-`));
    return { workdir: tmp, persistent: false };
  }
}

export async function cloneRepo(params: {
  taskId: string;
  workerId: string;
  owner: string;
  name: string;
  baseBranch: string;
  token?: string;
  /** If set, clone into this path instead of the resolved default. */
  presetPath?: string | null;
}): Promise<CloneResult> {
  const { taskId, workerId, owner, name, baseBranch, token, presetPath } = params;
  const { workdir, persistent } = await resolveWorkdir({
    workerId,
    owner,
    name,
    presetPath,
  });
  // Embed the token directly in the remote URL — headless git in the
  // worker container has no TTY and no credential helper, so this is the
  // most reliable way to authenticate clone / fetch / push. The tokened
  // URL is stored in `.git/config` for the lifetime of the checkout.
  const remoteUrl = token ? authedRemoteUrl(owner, name, token) : cloneUrl(owner, name);

  // If the dir already has a checkout (preset path), do a fetch+checkout
  // instead of a fresh clone.
  let isExisting = false;
  try {
    const stat = await fs.stat(path.join(workdir, '.git'));
    isExisting = stat.isDirectory();
  } catch {
    isExisting = false;
  }

  if (isExisting) {
    await logger.info(taskId, `Reusing existing checkout at ${workdir}`);
    // Overwrite the remote with the (possibly fresh) tokened URL so this
    // task's token is used rather than whatever was cached from a prior run.
    const setUrlRes = await run(
      'git',
      ['remote', 'set-url', 'origin', remoteUrl],
      { cwd: workdir, taskId, log: false },
    );
    if (setUrlRes.code !== 0) {
      throw new Error(
        `git remote set-url failed: ${redactToken(setUrlRes.stderr, token)}`,
      );
    }
    const fetchRes = await run('git', ['fetch', 'origin', baseBranch], {
      cwd: workdir,
      taskId,
    });
    if (fetchRes.code !== 0) {
      throw new Error(`git fetch failed: ${redactToken(fetchRes.stderr, token)}`);
    }
    await run('git', ['reset', '--hard', `origin/${baseBranch}`], { cwd: workdir, taskId });
  } else {
    await logger.info(taskId, `Cloning ${owner}/${name} (branch ${baseBranch}) into ${workdir}`);
    // `log: false` so the tokened URL in argv is not echoed into TaskLog.
    const cloneRes = await run(
      'git',
      ['clone', '--depth', '1', '--branch', baseBranch, remoteUrl, workdir],
      { taskId, log: false },
    );
    if (cloneRes.code !== 0) {
      const stderr = redactToken(cloneRes.stderr, token);
      throw new Error(`git clone failed: ${stderr || 'unknown error'}`);
    }
  }

  // Create a per-task work branch
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workBranch = `agent/${taskId.slice(0, 8)}-${ts}`;
  const branchRes = await run('git', ['checkout', '-b', workBranch], { cwd: workdir, taskId });
  if (branchRes.code !== 0) {
    throw new Error(`git checkout -b ${workBranch} failed: ${branchRes.stderr}`);
  }

  // Configure committer identity
  await run('git', ['config', 'user.email', 'agent@lepoder.local'], { cwd: workdir, taskId, log: false });
  await run('git', ['config', 'user.name', 'LEPODER Agent'], { cwd: workdir, taskId, log: false });

  return {
    workdir,
    baseBranch,
    workBranch,
    cleanup: async () => {
      // Only clean up tmp dirs we created. Persistent paths (preset or
      // volume-managed) stay so the next task can reuse the checkout +
      // node_modules.
      if (!persistent) {
        try {
          await fs.rm(workdir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    },
  };
}

/**
 * Make sure node_modules is present and reasonably current in `workdir`.
 *
 * Strategy:
 *   - If there's no package.json, do nothing (not a Node project).
 *   - If node_modules exists AND its mtime ≥ package-lock.json mtime,
 *     skip — the install is already current.
 *   - Otherwise run `npm ci` (when there's a lockfile) or `npm install`.
 *     Either runs the project's `postinstall` hook, which on this repo
 *     handles `prisma generate`.
 *
 * This lets the agent run `tsc --noEmit`, `npm test`, lint, etc. inside
 * its run_bash tool without hitting "Cannot find module" errors. The
 * install runs at the worker level (outside the agent's per-call 60s
 * timeout) so we get to use a longer hard cap.
 *
 * Throws on install failure — the task continues anyway (the executor
 * decides whether the missing deps are fatal or just a warning).
 */
export async function ensureNodeModules(params: {
  taskId: string;
  workdir: string;
  /** Hard timeout for the install in ms. Default 5 min. */
  timeoutMs?: number;
}): Promise<{ installed: boolean; skipped: boolean; reason?: string }> {
  const { taskId, workdir, timeoutMs = 5 * 60 * 1000 } = params;
  const pkgFile = path.join(workdir, 'package.json');
  const lockFile = path.join(workdir, 'package-lock.json');
  const nodeModules = path.join(workdir, 'node_modules');

  try {
    await fs.access(pkgFile);
  } catch {
    return { installed: false, skipped: true, reason: 'no package.json' };
  }

  const lockMtime = await statMtime(lockFile);
  const nmMtime = await statMtime(nodeModules);

  if (nmMtime > 0 && (lockMtime === 0 || nmMtime >= lockMtime)) {
    await logger.info(taskId, 'node_modules is current — skipping install');
    return { installed: false, skipped: true, reason: 'up-to-date' };
  }

  const useCi = lockMtime > 0;
  const cmd = useCi ? 'npm ci' : 'npm install';
  await logger.info(
    taskId,
    `Installing dependencies with \`${cmd}\` (timeout ${Math.round(timeoutMs / 1000)}s)…`
  );
  const start = Date.now();
  const res = await run(
    'npm',
    [
      useCi ? 'ci' : 'install',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
    ],
    { cwd: workdir, taskId, log: false, timeoutMs }
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (res.code !== 0) {
    const tail = res.stderr.length > 800 ? '…' + res.stderr.slice(-800) : res.stderr;
    throw new Error(`${cmd} failed after ${elapsed}s (exit ${res.code}): ${tail}`);
  }

  // Touch the directory so the mtime reflects "just installed" — keeps the
  // skip-if-fresh check working on subsequent tasks.
  try {
    const now = new Date();
    await fs.utimes(nodeModules, now, now);
  } catch {
    /* best-effort */
  }
  await logger.info(taskId, `Dependencies installed in ${elapsed}s`);
  return { installed: true, skipped: false };
}

async function statMtime(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}

export async function commitAll(params: {
  taskId: string;
  workdir: string;
  message: string;
}): Promise<{ commitHash: string | null; changed: boolean }> {
  const { taskId, workdir, message } = params;
  const status = await run('git', ['status', '--porcelain'], {
    cwd: workdir,
    taskId,
    log: false,
  });
  if (!status.stdout.trim()) {
    return { commitHash: null, changed: false };
  }
  const add = await run('git', ['add', '-A'], { cwd: workdir, taskId });
  if (add.code !== 0) throw new Error(`git add failed: ${add.stderr}`);
  const commit = await run('git', ['commit', '-m', message], { cwd: workdir, taskId });
  if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);
  const rev = await run('git', ['rev-parse', 'HEAD'], { cwd: workdir, taskId, log: false });
  return { commitHash: rev.stdout.trim() || null, changed: true };
}

export async function pushBranch(params: {
  taskId: string;
  workdir: string;
  branch: string;
  token?: string;
}): Promise<void> {
  const { taskId, workdir, branch, token } = params;
  // The remote URL was set with the token embedded in cloneRepo(), so a
  // plain `git push` authenticates without needing GIT_ASKPASS or a
  // credential helper.
  const res = await run('git', ['push', '-u', 'origin', branch], {
    cwd: workdir,
    taskId,
  });
  if (res.code !== 0) {
    throw new Error(`git push failed: ${redactToken(res.stderr, token)}`);
  }
}

export interface OpenPullRequestResult {
  url: string;
  number: number;
}

/**
 * Open a PR via the GitHub REST API. Returns { url, number } or null on
 * failure. The number is needed for follow-up calls like auto-merge.
 */
export async function openPullRequest(params: {
  taskId: string;
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
  token: string;
}): Promise<OpenPullRequestResult | null> {
  const { taskId, owner, repo, head, base, title, body, token } = params;
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'lepoder-portal-worker',
      },
      body: JSON.stringify({ title, head, base, body }),
    });
    if (!res.ok) {
      const text = await res.text();
      await logger.error(taskId, `GitHub PR API ${res.status}: ${text}`);
      return null;
    }
    const data = (await res.json()) as { html_url?: string; number?: number };
    if (!data.html_url || typeof data.number !== 'number') {
      await logger.error(taskId, `GitHub PR API returned malformed body`);
      return null;
    }
    return { url: data.html_url, number: data.number };
  } catch (e) {
    await logger.error(taskId, `PR creation error: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Merge a PR via the GitHub REST API. Returns true on success.
 * Used for the dispatcher's auto-merge feature.
 *
 * Common reasons this fails (logged as warn so the task still completes
 * with the PR open):
 *   - Branch protection requires reviews or status checks
 *   - The token lacks `pull_requests: write` permission
 *   - The PR has conflicts that GitHub can't auto-resolve
 *   - The PR isn't mergeable yet (GitHub still computing mergeability)
 */
export async function mergePullRequest(params: {
  taskId: string;
  owner: string;
  repo: string;
  prNumber: number;
  token: string;
  /** Merge strategy. Defaults to "squash" to match how we merge by hand. */
  method?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string;
  commitMessage?: string;
}): Promise<{ merged: boolean; sha?: string; error?: string }> {
  const { taskId, owner, repo, prNumber, token, method = 'squash', commitTitle, commitMessage } = params;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'lepoder-portal-worker',
        },
        body: JSON.stringify({
          merge_method: method,
          ...(commitTitle ? { commit_title: commitTitle } : {}),
          ...(commitMessage ? { commit_message: commitMessage } : {}),
        }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      await logger.warn(taskId, `Auto-merge failed (${res.status}): ${text.slice(0, 400)}`);
      return { merged: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { sha?: string; merged?: boolean };
    return { merged: !!data.merged, sha: data.sha };
  } catch (e) {
    const msg = (e as Error).message;
    await logger.warn(taskId, `Auto-merge request error: ${msg}`);
    return { merged: false, error: msg };
  }
}
