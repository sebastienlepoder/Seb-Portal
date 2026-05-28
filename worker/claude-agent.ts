import * as path from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { logger } from './logger';
import {
  applyAuthEnv,
  describeAuthMode,
  getWorkerAuthMode,
  type WorkerAuthMode,
} from './auth-mode';

export interface AgentRunOptions {
  taskId: string;
  workdir: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  /** Hard timeout in ms for the entire agent run. */
  timeoutMs: number;
  /**
   * Project secrets resolved from 1Password. Accepted for API compatibility
   * but intentionally NOT forwarded to the agent's Bash shell — see
   * `sanitizeShellEnv` below for the rationale.
   */
  extraEnv?: Record<string, string>;
}

export interface AgentRunResult {
  ok: boolean;
  summary: string;
  filesTouched: string[];
  /** SDK-reported dollar cost (token-count × pricing estimate). The SDK
   *  computes this number for every run regardless of auth path, so a
   *  positive value does NOT mean the user was charged. Use `authPath`
   *  to know whether real billing occurred. Undefined when no result
   *  message was received (timeout / hard error). */
  costUsd?: number;
  /** Auth path the worker used for this run. */
  authPath?: WorkerAuthMode;
  error?: string;
}

/**
 * Env keys that must never reach the agent's Bash shell. The agent has write
 * access to the workdir and `git add -A` runs unattended, so any variable in
 * `process.env` can be exfiltrated via `env > leak.txt`.
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
 * Env passed to the SDK subprocess. The SDK uses this for the CLI it spawns
 * and for the agent's Bash tool. We strip portal/GitHub/LLM/1Password
 * secrets so an agent that runs `env > leak.txt && git add -A` can't
 * exfiltrate them. HOME must survive so the SDK can find OAuth credentials
 * at `$HOME/.claude/.credentials.json`.
 */
function sanitizeShellEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (SENSITIVE_ENV_KEYS.has(k)) continue;
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    env[k] = v;
  }
  return env;
}

/**
 * Built-in tools we hand to the agent. Mirrors the tools our previous
 * custom loop offered (read/write/edit/bash/list) plus Grep+Glob since the
 * SDK has those for free.
 */
const SUBAGENT_TOOLS: string[] = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LS'];

function toRelative(workdir: string, p: string): string {
  if (!p) return p;
  if (path.isAbsolute(p)) {
    const rel = path.relative(workdir, p);
    return rel || path.basename(p);
  }
  return p;
}

function summarizeToolInput(name: string, input: unknown): string {
  const i = (input as Record<string, unknown>) ?? {};
  const trunc = (s: string, n = 100) => (s.length > n ? s.slice(0, n) + '…' : s);
  if (name === 'Bash') return trunc(String(i.command ?? ''));
  if (name === 'Read' || name === 'LS' || name === 'Edit' || name === 'Write') {
    return String(i.file_path ?? i.path ?? '');
  }
  if (name === 'Glob') return String(i.pattern ?? '');
  if (name === 'Grep') return `${String(i.pattern ?? '')} in ${String(i.path ?? '.')}`;
  try {
    return trunc(JSON.stringify(i));
  } catch {
    return '';
  }
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { taskId, workdir, systemPrompt, userMessage, model, timeoutMs } = opts;

  // Pick the auth path from the admin setting (Settings → Worker auth).
  // In OAuth mode we deliberately don't forward ANTHROPIC_API_KEY: the
  // Claude CLI treats it as an override, so leaving it set would bill
  // per-token even on a Max subscription.
  const env = sanitizeShellEnv();
  const authMode = await getWorkerAuthMode();
  applyAuthEnv(env, authMode);
  await logger.info(taskId, `Auth: ${describeAuthMode(authMode)}`);

  const maxTurns = parseInt(process.env.WORKER_MAX_TURNS || '100', 10) || 100;

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  const filesTouched = new Set<string>();
  let summary = '';
  let ok = false;
  let error: string | undefined;
  let costUsd: number | undefined;

  try {
    const stream: AsyncIterable<SDKMessage> = query({
      prompt: userMessage,
      options: {
        model,
        systemPrompt,
        cwd: workdir,
        tools: SUBAGENT_TOOLS,
        allowedTools: SUBAGENT_TOOLS,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        env,
        abortController,
        maxTurns,
      },
    });

    for await (const message of stream) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            await logger.info(taskId, `🤖 ${block.text.trim()}`);
          } else if (block.type === 'tool_use') {
            if (block.name === 'Write' || block.name === 'Edit') {
              const fp = (block.input as Record<string, unknown>)?.file_path;
              if (typeof fp === 'string' && fp) filesTouched.add(toRelative(workdir, fp));
            }
            await logger.info(
              taskId,
              `→ ${block.name}(${summarizeToolInput(block.name, block.input)})`,
            );
          }
        }
      } else if (message.type === 'result') {
        costUsd = message.total_cost_usd;
        if (message.subtype === 'success') {
          summary = message.result || '';
          ok = true;
          await logger.info(
            taskId,
            `✓ done — ${message.num_turns} turns, $${message.total_cost_usd.toFixed(4)}`,
            { usage: message.usage },
          );
        } else {
          // SDKResultError shape — pull whatever message field exists
          const errMsg =
            (message as Record<string, unknown>).result ||
            (message as Record<string, unknown>).error ||
            'agent ended in error';
          error = String(errMsg).slice(0, 2000);
        }
      }
    }
  } catch (e) {
    if (abortController.signal.aborted) {
      error = `Agent timed out after ${timeoutMs}ms`;
    } else {
      error = `Claude Agent SDK error: ${(e as Error).message}`;
    }
  } finally {
    clearTimeout(timeoutHandle);
  }

  return {
    ok,
    summary,
    filesTouched: Array.from(filesTouched),
    costUsd,
    authPath: authMode,
    error: ok ? undefined : error || 'agent did not produce a result',
  };
}
