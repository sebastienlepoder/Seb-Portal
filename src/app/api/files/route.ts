import { NextRequest } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';
import {
  listDir,
  readFileContent,
  writeFileContent,
  createEntry,
  deleteEntry,
  renameEntry,
  WorkspaceError,
} from '@/lib/files/workspace';

export const runtime = 'nodejs';

async function admin(): Promise<boolean> {
  try {
    await requireApiAdmin();
    return true;
  } catch {
    return false;
  }
}

function handle(e: unknown): Response {
  if (e instanceof WorkspaceError) {
    return Response.json({ ok: false, error: e.message }, { status: e.status });
  }
  console.error('files api error:', e);
  return Response.json({ ok: false, error: 'File operation failed' }, { status: 500 });
}

// GET ?path=<rel>&mode=list|read
export async function GET(req: NextRequest) {
  if (!(await admin())) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  const url = new URL(req.url);
  const relPath = url.searchParams.get('path') ?? '';
  const mode = url.searchParams.get('mode') ?? 'list';
  try {
    if (mode === 'read') {
      const data = await readFileContent(relPath);
      return Response.json({ ok: true, data });
    }
    const data = await listDir(relPath);
    return Response.json({ ok: true, data });
  } catch (e) {
    return handle(e);
  }
}

// POST { path, type: 'file' | 'folder' } — create
export async function POST(req: NextRequest) {
  if (!(await admin())) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!(await verifyCsrf(req))) return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const relPath = typeof body?.path === 'string' ? body.path : '';
  const type = body?.type === 'folder' ? 'folder' : 'file';
  if (!relPath) return Response.json({ ok: false, error: 'path required' }, { status: 400 });
  try {
    await createEntry(relPath, type);
    await audit(req, 'file_create', { path: relPath, type });
    return Response.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

// PUT { path, content } — write file
export async function PUT(req: NextRequest) {
  if (!(await admin())) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!(await verifyCsrf(req))) return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const relPath = typeof body?.path === 'string' ? body.path : '';
  const content = typeof body?.content === 'string' ? body.content : null;
  if (!relPath || content === null) {
    return Response.json({ ok: false, error: 'path and content required' }, { status: 400 });
  }
  try {
    await writeFileContent(relPath, content);
    await audit(req, 'file_write', { path: relPath, bytes: content.length });
    return Response.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

// PATCH { from, to } — rename/move
export async function PATCH(req: NextRequest) {
  if (!(await admin())) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!(await verifyCsrf(req))) return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  const body = await req.json().catch(() => null);
  const from = typeof body?.from === 'string' ? body.from : '';
  const to = typeof body?.to === 'string' ? body.to : '';
  if (!from || !to) return Response.json({ ok: false, error: 'from and to required' }, { status: 400 });
  try {
    await renameEntry(from, to);
    await audit(req, 'file_rename', { from, to });
    return Response.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

// DELETE ?path=<rel>
export async function DELETE(req: NextRequest) {
  if (!(await admin())) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  if (!(await verifyCsrf(req))) return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  const url = new URL(req.url);
  const relPath = url.searchParams.get('path') ?? '';
  if (!relPath) return Response.json({ ok: false, error: 'path required' }, { status: 400 });
  try {
    await deleteEntry(relPath);
    await audit(req, 'file_delete', { path: relPath });
    return Response.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}

async function audit(req: NextRequest, action: string, details: Record<string, unknown>) {
  await auditLog({
    action: 'admin_action',
    details: { action, ...details },
    ipAddress: getClientIp(req),
  });
}
