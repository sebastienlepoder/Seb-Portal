import { spawn } from 'child_process';
import * as fs from 'fs/promises';
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
      void logger.error(opts.taskId, `spawn error: ${e.message}`);
      resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function cloneUrl(owner: string, name: string, token: string | undefined): string {
  if (token) {
    return `https://x-access-token:${token}@github.com/${owner}/${name}.git`;
  }
  return `https://github.com/${owner}/${name}.git`;
}

export async function cloneRepo(params: {
  taskId: string;
  workerId: string;
  owner: string;
  name: string;
  baseBranch: string;
  token?: string;
  /** If set, clone into this path instead of a temp dir. */
  presetPath?: string | null;
}): Promise<CloneResult> {
  const { taskId, workerId, owner, name, baseBranch, token, presetPath } = params;
  const workdir =
    presetPath ??
    (await fs.mkdtemp(path.join(os.tmpdir(), `portal-worker-${workerId}-`)));

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
    const remoteUrl = cloneUrl(owner, name, token);
    await run('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: workdir, taskId });
    const fetchRes = await run('git', ['fetch', 'origin', baseBranch], {
      cwd: workdir,
      taskId,
    });
    if (fetchRes.code !== 0) throw new Error(`git fetch failed: ${fetchRes.stderr}`);
    await run('git', ['reset', '--hard', `origin/${baseBranch}`], { cwd: workdir, taskId });
  } else {
    await logger.info(taskId, `Cloning ${owner}/${name} (branch ${baseBranch}) into ${workdir}`);
    const url = cloneUrl(owner, name, token);
    const cloneRes = await run(
      'git',
      ['clone', '--depth', '1', '--branch', baseBranch, url, workdir],
      { taskId }
    );
    if (cloneRes.code !== 0) {
      throw new Error(`git clone failed: ${cloneRes.stderr || 'unknown error'}`);
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
      // Only clean up temp dirs we created
      if (!presetPath) {
        try {
          await fs.rm(workdir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    },
  };
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
}): Promise<void> {
  const { taskId, workdir, branch } = params;
  const res = await run('git', ['push', '-u', 'origin', branch], { cwd: workdir, taskId });
  if (res.code !== 0) throw new Error(`git push failed: ${res.stderr}`);
}

/**
 * Open a PR via the GitHub REST API. Returns the PR URL or null on failure.
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
}): Promise<string | null> {
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
    const data = (await res.json()) as { html_url?: string };
    return data.html_url ?? null;
  } catch (e) {
    await logger.error(taskId, `PR creation error: ${(e as Error).message}`);
    return null;
  }
}
