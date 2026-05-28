import { NextRequest } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { gitStatus, WorkspaceError } from '@/lib/files/workspace';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const url = new URL(req.url);
  const relPath = url.searchParams.get('path') ?? '';
  try {
    const data = await gitStatus(relPath);
    return Response.json({ ok: true, data });
  } catch (e) {
    if (e instanceof WorkspaceError) {
      return Response.json({ ok: false, error: e.message }, { status: e.status });
    }
    return Response.json({ ok: true, data: { isRepo: false } });
  }
}
