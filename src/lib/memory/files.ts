import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * File-based memory. Portal-level identity lives under memory/*.md;
 * each project has projects/<slug>/MEMORY.md. These are injected into
 * the chat system prompt so the assistant always has standing context.
 */

export type PortalFileKey = 'AI' | 'USER' | 'PORTAL';

interface PortalFileDef {
  key: PortalFileKey;
  file: string;
  label: string;
  description: string;
  /** Injected into the chat system prompt when non-empty. */
  injected: boolean;
  template: string;
}

export const PORTAL_FILES: PortalFileDef[] = [
  {
    key: 'AI',
    file: 'AI.md',
    label: 'AI identity',
    description: 'Who the assistant is, tone, house rules. Read on every chat.',
    injected: true,
    template: '# AI Assistant — Identity\n\n## Who you are\n\n## How you work\n\n## House rules\n',
  },
  {
    key: 'USER',
    file: 'USER.md',
    label: 'Your profile',
    description: 'Who you are and how you like to work. Read on every chat.',
    injected: true,
    template: '# Profile\n\n## About me\n\n## How I like to work\n',
  },
  {
    key: 'PORTAL',
    file: 'PORTAL.md',
    label: 'Portal & roadmap',
    description: 'What the portal is and where it is going. Reference doc.',
    injected: false,
    template: '# LEPODER Portal — Memory\n',
  },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function memoryDir(): string {
  return process.env.PORTAL_MEMORY_DIR
    ? path.resolve(process.env.PORTAL_MEMORY_DIR)
    : path.resolve(process.cwd(), 'memory');
}

function projectsDir(): string {
  return process.env.PROJECTS_DIR
    ? path.resolve(process.env.PROJECTS_DIR)
    : path.resolve(process.cwd(), 'projects');
}

const MAX_BYTES = 256 * 1024;

export class MemoryError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function defForKey(key: string): PortalFileDef {
  const def = PORTAL_FILES.find((f) => f.key === key);
  if (!def) throw new MemoryError(400, `Unknown portal memory file "${key}"`);
  return def;
}

export async function readPortalFile(key: string): Promise<string> {
  const def = defForKey(key);
  const abs = path.join(memoryDir(), def.file);
  try {
    return await fs.readFile(abs, 'utf8');
  } catch {
    return def.template;
  }
}

export async function writePortalFile(key: string, content: string): Promise<void> {
  const def = defForKey(key);
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    throw new MemoryError(413, 'Memory file too large');
  }
  const dir = memoryDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, def.file), content, 'utf8');
}

function projectMemoryPath(slug: string): string {
  if (!SLUG_RE.test(slug)) throw new MemoryError(400, 'Invalid project slug');
  return path.join(projectsDir(), slug, 'MEMORY.md');
}

export async function readProjectMemory(slug: string): Promise<string> {
  try {
    return await fs.readFile(projectMemoryPath(slug), 'utf8');
  } catch (e) {
    if (e instanceof MemoryError) throw e;
    return projectMemoryTemplate(slug);
  }
}

export async function writeProjectMemory(slug: string, content: string): Promise<void> {
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    throw new MemoryError(413, 'Memory file too large');
  }
  const abs = projectMemoryPath(slug);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
}

function projectMemoryTemplate(slug: string): string {
  return [
    `# ${slug} — Project memory`,
    '',
    '> What this project is, the goal, where we are going. The assistant',
    '> reads this when this project is selected in a conversation.',
    '',
    '## What it is',
    '',
    '## Goal',
    '',
    '## Current focus',
    '',
    '## Decisions & constraints',
    '',
  ].join('\n');
}

/**
 * Concatenate the injected portal files (AI + USER) for the system prompt.
 * Empty/whitespace-only sections are skipped so we don't pad the prompt.
 */
export async function loadPortalMemoryForPrompt(): Promise<string> {
  const parts: string[] = [];
  for (const def of PORTAL_FILES) {
    if (!def.injected) continue;
    const content = (await readPortalFile(def.key)).trim();
    if (content) parts.push(content);
  }
  return parts.join('\n\n---\n\n');
}

export async function loadProjectMemoryForPrompt(slug: string): Promise<string> {
  try {
    const content = (await readProjectMemory(slug)).trim();
    return content;
  } catch {
    return '';
  }
}
