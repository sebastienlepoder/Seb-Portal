import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Pre-flight auth check for the Claude CLI terminal. The WebSocket upgrade
 * rejection codes (401/403/503) are not exposed to browser JS — every failed
 * upgrade looks like close code 1006 — so we expose the same auth contract
 * here as a regular HTTP endpoint to surface the real reason in the UI.
 */
export const runtime = 'nodejs';

export async function GET() {
  if (process.env.DISABLE_CLAUDE_CLI === 'true') {
    return NextResponse.json(
      { ok: false, error: 'Claude CLI is disabled (DISABLE_CLAUDE_CLI=true).' },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: 'Not signed in. Sign in to the portal first.' },
      { status: 401 },
    );
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'Claude CLI is admin-only. Your account is not an admin.' },
      { status: 403 },
    );
  }

  // No API key and no mounted Max OAuth creds → the CLI can't authenticate to
  // Anthropic, so surface that early instead of letting the session die after
  // the clone. (We can't read the mounted file here cheaply, so we only assert
  // the API-key path the AI Hub already relies on.)
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // `__PORTAL_TERMINAL_WS__` is set by server.js at boot. If it's absent, the
  // deploy is running the standalone Next server (no WS upgrade handler), so
  // the bridge can never connect — surface that instead of an opaque 1006.
  const wsServer = (globalThis as { __PORTAL_TERMINAL_WS__?: boolean })
    .__PORTAL_TERMINAL_WS__ === true;

  return NextResponse.json({ ok: true, wsServer, hasApiKey });
}
