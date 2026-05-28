import { NextRequest } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';
import { syncReposToProjects } from '@/lib/github/sync';

export const runtime = 'nodejs';

// GET — report whether sync is configured + the active scope.
export async function GET() {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  return Response.json({
    ok: true,
    data: {
      configured: !!process.env.GITHUB_TOKEN,
      org: process.env.GITHUB_SYNC_ORG?.trim() || null,
      affiliation: process.env.GITHUB_SYNC_AFFILIATION?.trim() || 'owner',
      includeForks: process.env.GITHUB_SYNC_INCLUDE_FORKS === 'true',
      autoSyncMinutes: parseInt(process.env.GITHUB_SYNC_INTERVAL_MIN || '60', 10) || 0,
    },
  });
}

// POST — run a sync now.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return Response.json({ ok: false, error: 'GITHUB_TOKEN is not configured' }, { status: 503 });
  }

  const result = await syncReposToProjects();

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'github_repo_sync', ...result, errors: result.errors.slice(0, 5) },
    ipAddress: getClientIp(req),
  });

  return Response.json({ ok: result.errors.length === 0 || result.created > 0, data: result });
}
