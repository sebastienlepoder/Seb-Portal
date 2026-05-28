import * as path from 'path';
import { existsSync } from 'fs';
import prisma from '../src/lib/db';

export type WorkerAuthMode = 'oauth' | 'api_key';

const SETTING_KEY = 'worker.auth.mode';

/**
 * True when the Claude Max OAuth credentials file is mounted at
 * $HOME/.claude/.credentials.json. Reported in heartbeats and used by the
 * settings UI to flag a misconfigured "use OAuth" choice.
 */
export function hasOauthCreds(): boolean {
  const home = process.env.HOME || '/root';
  return existsSync(path.join(home, '.claude', '.credentials.json'));
}

/**
 * Read the admin-controlled auth mode (Settings → Worker authentication).
 * Defaults to 'oauth' — Max-subscription credentials win when they're
 * mounted; tasks fall back to error if not.
 */
export async function getWorkerAuthMode(): Promise<WorkerAuthMode> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    return row?.value === 'api_key' ? 'api_key' : 'oauth';
  } catch {
    return 'oauth';
  }
}

/**
 * Mutate `env` so the SDK subprocess uses the right auth path. In OAuth
 * mode we deliberately do NOT forward ANTHROPIC_API_KEY even when it's
 * set — the CLI treats it as an override and would bill per-token.
 */
export function applyAuthEnv(env: Record<string, string>, mode: WorkerAuthMode): void {
  if (mode === 'api_key' && process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (process.env.ANTHROPIC_BASE_URL) env.ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;
  }
}

export function describeAuthMode(mode: WorkerAuthMode): string {
  if (mode === 'api_key') return 'ANTHROPIC_API_KEY (per-token)';
  return hasOauthCreds()
    ? 'Max OAuth'
    : 'Max OAuth — WARNING: no ~/.claude/.credentials.json mounted; tasks may fail';
}
