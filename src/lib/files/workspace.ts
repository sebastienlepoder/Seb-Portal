import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The browsable workspace root. Defaults to the project's projects/
 * directory (bind-mounted on Coolify). Override with WORKSPACE_DIR.
 * Every API path is resolved relative to this and verified to stay
 * inside it — no traversal outside the root is possible.
 */
export function workspaceRoot(): string {
  return process.env.WORKSPACE_DIR
    ? path.resolve(process.env.WORKSPACE_DIR)
    : path.resolve(process.cwd(), 'projects');
}

const IGNORED = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.turbo']);
const MAX_TEXT_BYTES = 512 * 1024; // 512KB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = new Set([
  '.md', '.txt', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.html',
  '.yml', '.yaml', '.toml', '.ini', '.env', '.sh', '.py', '.rb', '.go', '.rs',
  '.java', '.c', '.cpp', '.h', '.sql', '.xml', '.csv', '.log', '.gitignore',
  '.dockerignore', '.prisma', '.mjs', '.cjs', '.vue', '.svelte',
]);
const IMAGE_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export class WorkspaceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Resolve a client-supplied relative path inside the workspace root. */
export function resolveWithin(relPath: string): string {
  const root = workspaceRoot();
  const clean = (relPath || '').replace(/^\/+/, '');
  const resolved = path.resolve(root, clean);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new WorkspaceError(400, 'Path escapes workspace root');
  }
  return resolved;
}

export interface DirEntry {
  name: string;
  path: string; // relative to root
  type: 'file' | 'folder';
  size?: number;
}

export async function listDir(relPath: string): Promise<{ entries: DirEntry[]; relPath: string }> {
  const abs = resolveWithin(relPath);
  const root = workspaceRoot();

  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WorkspaceError(404, 'Directory not found');
    }
    throw e;
  }

  const entries: DirEntry[] = [];
  for (const d of dirents) {
    if (IGNORED.has(d.name)) continue;
    const childAbs = path.join(abs, d.name);
    const rel = path.relative(root, childAbs);
    if (d.isDirectory()) {
      entries.push({ name: d.name, path: rel, type: 'folder' });
    } else if (d.isFile()) {
      let size: number | undefined;
      try {
        size = (await fs.stat(childAbs)).size;
      } catch { /* ignore */ }
      entries.push({ name: d.name, path: rel, type: 'file', size });
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { entries, relPath: path.relative(root, abs) };
}

export type FileContent =
  | { kind: 'text'; content: string; size: number; truncated: boolean }
  | { kind: 'image'; dataUri: string; size: number }
  | { kind: 'binary'; size: number };

export async function readFileContent(relPath: string): Promise<FileContent> {
  const abs = resolveWithin(relPath);
  let stat: import('node:fs').Stats;
  try {
    stat = await fs.stat(abs);
  } catch {
    throw new WorkspaceError(404, 'File not found');
  }
  if (!stat.isFile()) throw new WorkspaceError(400, 'Not a file');

  const ext = path.extname(abs).toLowerCase();
  const base = path.basename(abs).toLowerCase();

  if (IMAGE_EXT[ext]) {
    if (stat.size > MAX_IMAGE_BYTES) return { kind: 'binary', size: stat.size };
    const buf = await fs.readFile(abs);
    return {
      kind: 'image',
      dataUri: `data:${IMAGE_EXT[ext]};base64,${buf.toString('base64')}`,
      size: stat.size,
    };
  }

  const looksText = TEXT_EXT.has(ext) || base.startsWith('.') || !ext;
  if (looksText) {
    const truncated = stat.size > MAX_TEXT_BYTES;
    const buf = await fs.readFile(abs);
    const slice = truncated ? buf.subarray(0, MAX_TEXT_BYTES) : buf;
    // Reject content that looks binary (NUL bytes in the sampled head).
    if (slice.subarray(0, 4096).includes(0)) {
      return { kind: 'binary', size: stat.size };
    }
    return { kind: 'text', content: slice.toString('utf8'), size: stat.size, truncated };
  }

  return { kind: 'binary', size: stat.size };
}

export async function writeFileContent(relPath: string, content: string): Promise<void> {
  const abs = resolveWithin(relPath);
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) {
    throw new WorkspaceError(413, 'File too large to save via editor');
  }
  await fs.writeFile(abs, content, 'utf8');
}

export async function createEntry(
  relPath: string,
  type: 'file' | 'folder'
): Promise<void> {
  const abs = resolveWithin(relPath);
  try {
    await fs.access(abs);
    throw new WorkspaceError(409, 'Already exists');
  } catch (e) {
    if (e instanceof WorkspaceError) throw e;
    // ENOENT — good, doesn't exist yet
  }
  if (type === 'folder') {
    await fs.mkdir(abs, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, '', 'utf8');
  }
}

export async function deleteEntry(relPath: string): Promise<void> {
  const abs = resolveWithin(relPath);
  if (abs === workspaceRoot()) throw new WorkspaceError(400, 'Cannot delete the workspace root');
  await fs.rm(abs, { recursive: true, force: true });
}

export async function renameEntry(fromRel: string, toRel: string): Promise<void> {
  const fromAbs = resolveWithin(fromRel);
  const toAbs = resolveWithin(toRel);
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  await fs.rename(fromAbs, toAbs);
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  dirtyCount?: number;
}

/** Read the git branch + dirty count for the workspace root (or a subdir). */
export async function gitStatus(relPath: string): Promise<GitStatus> {
  const abs = resolveWithin(relPath);
  try {
    const { stdout: branch } = await execFileAsync(
      'git',
      ['-C', abs, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: 4000 }
    );
    const { stdout: status } = await execFileAsync(
      'git',
      ['-C', abs, 'status', '--porcelain'],
      { timeout: 4000, maxBuffer: 1024 * 1024 }
    );
    const dirtyCount = status.split('\n').filter((l) => l.trim().length > 0).length;
    return { isRepo: true, branch: branch.trim(), dirtyCount };
  } catch {
    return { isRepo: false };
  }
}
