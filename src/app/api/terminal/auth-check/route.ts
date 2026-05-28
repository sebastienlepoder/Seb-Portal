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
  return NextResponse.json({ ok: true });
}
