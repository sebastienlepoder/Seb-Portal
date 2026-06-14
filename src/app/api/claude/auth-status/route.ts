import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
// CJS server helper — no native deps, safe to bundle into this route.
import { getAuthStatus, shouldUseOauth } from '@/server/claude-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/claude/auth-status — report Claude CLI authentication for the UI.
// Admin-only. Returns the stored Max/OAuth login (via `claude auth status`),
// whether an API key is available, and which one a new session would actually
// use (effectiveMode).
export async function GET() {
  try {
    await requireApiAdmin();

    const status = await getAuthStatus();
    const apiKeyAvailable = !!process.env.ANTHROPIC_API_KEY;
    const forceApiKey = process.env.CLAUDE_CLI_FORCE_API_KEY === 'true';
    const oauthActive = shouldUseOauth();

    const effectiveMode = oauthActive ? 'max' : apiKeyAvailable ? 'api_key' : 'none';

    return NextResponse.json({
      ok: true,
      effectiveMode,
      apiKeyAvailable,
      forceApiKey,
      max: {
        available: status.available !== false,
        loggedIn: !!status.loggedIn,
        authMethod: status.authMethod ?? null,
        subscriptionType: status.subscriptionType ?? null,
        email: status.email ?? null,
        orgName: status.orgName ?? null,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    console.error('[claude/auth-status] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
