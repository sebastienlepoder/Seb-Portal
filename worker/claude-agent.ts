import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { run } from './git-handler';
import { logger } from './logger';

export interface AgentRunOptions {
  taskId: string;
  workdir: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxIterations: number;
  /** Hard timeout in ms for the entire agent run. */
  timeoutMs: number;
  /**
   * Project secrets resolved from 1Password. Accepted for API compatibility
   * but intentionally NOT forwarded to the agent's `run_bash` shell — see
   * `sanitizeShellEnv` below for the rationale.
   */
  extraEnv?: Record<string, string>;
}

export interface AgentRunResult {
  ok: boolean;
  summary: string;
  filesTouched: string[];
  error?: string;
}

const RUN_BASH_TIMEOUT_MS = 60_000;

/**
 * Env keys that must never reach the agent's `/bin/sh -c` shell. The agent
 * has write access to the workdir and `git add -A` runs unattended, so any
 * variable in `process.env` can be exfiltrated via `env > leak.txt`.
 *
 * Includes:
 *   - portal session / CSRF / API secrets
 *   - the GitHub PAT used for clone+push (H2: also no longer in .git/config)
 *   - LLM provider keys (the agent talks to Anthropic via the parent process,
 *     it does not need its own key)
 *   - 1Password Connect credentials
 *   - admin/bootstrap credentials and DB URL
 *   - third-party integration tokens that happen to be in the worker env
 */
const SENSITIVE_ENV_KEYS = new Set([
  'AUTH_SECRET',
  'CSRF_SECRET',
  'AMONIS_API_TOKEN',
  'AMONIS_WEBHOOK_SECRET',
  'OPENCLAW_WEBHOOK_SECRET',
  'WEBHOOK_AUTH_TOKEN',
  'GITHUB_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'ONEPASSWORD_ENCRYPTION_KEY',
  'OP_CONNECT_TOKEN',
  'OP_CONNECT_HOST',
  'MCP_AUTH_TOKEN',
  'ADMIN_PASSWORD',
  'ADMIN_TOTP_SECRET',
  'DATABASE_URL',
  'MSFT_CLIENT_SECRET',
  'SHOPIFY_ACCESS_TOKEN',
  'HA_TOKEN',
  'WEATHER_API_KEY',
  'MARKET_DATA_API_KEY',
  'SYNOLOGY_PASSWORD',
  'GUACAMOLE_PASS',
  'RUSTDESK_PUBLIC_KEY',
]);

const SENSITIVE_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i;

/**
 * Build the env passed to the agent's `run_bash` shell. Both the explicit
 * sensitive allowlist and a fuzzy `SECRET|TOKEN|…` regex are stripped, and
 * `extraEnv` (1Password-resolved project secrets) is dropped entirely —
 * if a future tool needs them, it should pass them via a dedicated channel
 * (file mount, scoped run-test tool, etc.), never through the general-
 * purpose shell.
 */
function sanitizeShellEnv(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  void extraEnv;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SENSITIVE_ENV_KEYS.has(k)) continue;
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    env[k] = v;
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Tools given to the agent. Constrained to the workdir.
 */
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description:
      'Read a UTF-8 text file by path relative to the repo root. Returns up to 50,000 characters.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write a UTF-8 text file. Overwrites if it exists. Creates parent dirs. `path` is relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List directory contents (one per line, trailing / for dirs). `path` is relative; "." for repo root.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'run_bash',
    description:
      'Run a shell command in the repo root. Use for `npm test`, `tsc --noEmit`, `grep`, `find`, etc. Returns stdout+stderr+exit code. 60s timeout.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
  {
    name: 'finish',
    description:
      'Call when the task is complete. Provide a one-paragraph summary of what was done.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

function safeJoin(workdir: string, rel: string): string | null {
  // Resolve and ensure the result is inside workdir
  const cleaned = rel.startsWith('/') ? rel.slice(1) : rel;
  const abs = path.resolve(workdir, cleaned);
  const work = path.resolve(workdir);
  if (abs !== work && !abs.startsWith(work + path.sep)) return null;
  return abs;
}

async function handleTool(
  taskId: string,
  workdir: string,
  name: string,
  input: Record<string, unknown>
): Promise<{ result: string; touchedFile?: string; isError: boolean; finished?: { summary: string } }> {
  if (name === 'finish') {
    const summary = String(input.summary ?? '').trim() || 'Task complete.';
    return { result: summary, isError: false, finished: { summary } };
  }
  if (name === 'read_file') {
    const rel = String(input.path ?? '');
    const abs = safeJoin(workdir, rel);
    if (!abs) return { result: 'Error: path escapes workdir', isError: true };
    try {
      const content = await fs.readFile(abs, 'utf-8');
      return { result: content.length > 50000 ? content.slice(0, 50000) + '\n…[truncated]' : content, isError: false };
    } catch (e) {
      return { result: `Error: ${(e as Error).message}`, isError: true };
    }
  }
  if (name === 'write_file') {
    const rel = String(input.path ?? '');
    const content = String(input.content ?? '');
    const abs = safeJoin(workdir, rel);
    if (!abs) return { result: 'Error: path escapes workdir', isError: true };
    try {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf-8');
      return { result: `Wrote ${content.length} chars to ${rel}`, touchedFile: rel, isError: false };
    } catch (e) {
      return { result: `Error: ${(e as Error).message}`, isError: true };
    }
  }
  if (name === 'list_directory') {
    const rel = String(input.path ?? '.');
    const abs = safeJoin(workdir, rel);
    if (!abs) return { result: 'Error: path escapes workdir', isError: true };
    try {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      const lines = entries
        .filter((e) => e.name !== '.git')
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
        .join('\n');
      return { result: lines || '(empty)', isError: false };
    } catch (e) {
      return { result: `Error: ${(e as Error).message}`, isError: true };
    }
  }
  if (name === 'run_bash') {
    const cmd = String(input.command ?? '').trim();
    if (!cmd) return { result: 'Error: empty command', isError: true };
    // /bin/sh -c lets the model use pipes/&&. The workdir is the trust
    // boundary: the env is scrubbed (sanitizeShellEnv) so no portal,
    // GitHub, LLM, or 1Password secret is reachable from this shell, and
    // `timeoutMs` is forwarded to `run` so a runaway child is killed
    // (SIGTERM → SIGKILL) instead of leaking as a zombie.
    const res = await run('/bin/sh', ['-c', cmd], {
      cwd: workdir,
      taskId,
      env: sanitizeShellEnv(),
      timeoutMs: RUN_BASH_TIMEOUT_MS,
    });
    const tail = (s: string) => (s.length > 8000 ? '…' + s.slice(-8000) : s);
    return {
      result: `exit ${res.code}\n--- stdout ---\n${tail(res.stdout)}\n--- stderr ---\n${tail(res.stderr)}`,
      isError: res.code !== 0,
    };
  }
  return { result: `Unknown tool: ${name}`, isError: true };
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { taskId, workdir, systemPrompt, userMessage, model, maxIterations, timeoutMs } = opts;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, summary: '', filesTouched: [], error: 'ANTHROPIC_API_KEY not set' };
  }
  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  const client = new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });

  const startedAt = Date.now();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
  const filesTouched = new Set<string>();
  let summary = '';

  for (let iter = 0; iter < maxIterations; iter++) {
    if (Date.now() - startedAt > timeoutMs) {
      return {
        ok: false,
        summary,
        filesTouched: Array.from(filesTouched),
        error: `Agent timed out after ${timeoutMs}ms (iteration ${iter})`,
      };
    }

    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
    } catch (e) {
      return {
        ok: false,
        summary,
        filesTouched: Array.from(filesTouched),
        error: `Anthropic API error: ${(e as Error).message}`,
      };
    }

    await logger.info(taskId, `iteration ${iter + 1}: stop_reason=${resp.stop_reason}`, {
      usage: resp.usage,
    });

    // Surface any text the model produced
    for (const block of resp.content) {
      if (block.type === 'text' && block.text.trim()) {
        await logger.info(taskId, `🤖 ${block.text.trim()}`);
      }
    }

    if (resp.stop_reason !== 'tool_use') {
      // Model produced final text without calling finish — accept it as summary.
      const text = resp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim();
      summary = text || summary || 'Agent stopped without producing a summary.';
      return { ok: true, summary, filesTouched: Array.from(filesTouched) };
    }

    // Append assistant turn so the next request includes it
    messages.push({ role: 'assistant', content: resp.content });

    // Execute tool calls and collect results
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    let finished: { summary: string } | null = null;
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      const out = await handleTool(taskId, workdir, block.name, block.input as Record<string, unknown>);
      if (out.touchedFile) filesTouched.add(out.touchedFile);
      if (out.finished) finished = out.finished;
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: out.result,
        is_error: out.isError || undefined,
      });
    }

    messages.push({ role: 'user', content: toolResultBlocks });

    if (finished) {
      summary = finished.summary;
      return { ok: true, summary, filesTouched: Array.from(filesTouched) };
    }
  }

  return {
    ok: false,
    summary,
    filesTouched: Array.from(filesTouched),
    error: `Reached max iterations (${maxIterations}) without finishing`,
  };
}
