import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Pre-flight auth check for the SSH terminal. The WebSocket upgrade
 * rejection codes (401/403/503) are not exposed to browser JS — every
 * failed upgrade looks like close code 1006 from the client's side — so
 * we expose the same auth contract here as a regular HTTP endpoint to
 * surface the real reason in the UI.
 */
export const runtime = 'nodejs';

export async function GET() {
  if (process.env.DISABLE_TERMINAL === 'true') {
    return NextResponse.json(
      { ok: false, error: 'Terminal feature is disabled (DISABLE_TERMINAL=true).' },
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
      { ok: false, error: 'Terminal is admin-only. Your account is not an admin.' },
      { status: 403 },
    );
  }
  // `__PORTAL_TERMINAL_WS__` is set by server.js at boot. If it's absent, the
  // deploy is running the standalone Next server (no WS upgrade handler), so
  // the SSH bridge can never connect — surface that instead of letting the
  // client see an opaque 1006 close.
  const wsServer = (globalThis as { __PORTAL_TERMINAL_WS__?: boolean })
    .__PORTAL_TERMINAL_WS__ === true;
  return NextResponse.json({ ok: true, wsServer });
}
