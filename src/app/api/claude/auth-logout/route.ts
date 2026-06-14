import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { runAuthLogout } from '@/server/claude-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/claude/auth-logout — sign out of the stored Max/OAuth account so
// CLI sessions fall back to the API key. Admin-only.
export async function POST() {
  try {
    await requireApiAdmin();
    const result = await runAuthLogout();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || `Logout failed (exit ${result.code})` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    console.error('[claude/auth-logout] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
