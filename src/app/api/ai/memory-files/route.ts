import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import {
  PORTAL_FILES,
  readPortalFile,
  writePortalFile,
  readProjectMemory,
  writeProjectMemory,
  MemoryError,
} from '@/lib/memory/files';

export const runtime = 'nodejs';

function handle(e: unknown): Response {
  if (e instanceof MemoryError) {
    return Response.json({ ok: false, error: e.message }, { status: e.status });
  }
  console.error('memory-files error:', e);
  return Response.json({ ok: false, error: 'Memory operation failed' }, { status: 500 });
}

// GET ?scope=portal            → all portal files with content + metadata
// GET ?scope=project&slug=foo  → that project's MEMORY.md content
export async function GET(req: NextRequest) {
  try {
    await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  const scope = url.searchParams.get('scope') ?? 'portal';
  try {
    if (scope === 'project') {
      const slug = url.searchParams.get('slug') ?? '';
      if (!slug) return Response.json({ ok: false, error: 'slug required' }, { status: 400 });
      const content = await readProjectMemory(slug);
      return Response.json({ ok: true, data: { slug, content } });
    }
    const files = await Promise.all(
      PORTAL_FILES.map(async (f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        injected: f.injected,
        content: await readPortalFile(f.key),
      }))
    );
    return Response.json({ ok: true, data: files });
  } catch (e) {
    return handle(e);
  }
}

// PUT { scope: 'portal', key, content } | { scope: 'project', slug, content }
export async function PUT(req: NextRequest) {
  try {
    await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const scope = body?.scope === 'project' ? 'project' : 'portal';
  const content = typeof body?.content === 'string' ? body.content : null;
  if (content === null) {
    return Response.json({ ok: false, error: 'content required' }, { status: 400 });
  }
  try {
    if (scope === 'project') {
      const slug = typeof body?.slug === 'string' ? body.slug : '';
      await writeProjectMemory(slug, content);
    } else {
      const key = typeof body?.key === 'string' ? body.key : '';
      await writePortalFile(key, content);
    }
    return Response.json({ ok: true });
  } catch (e) {
    return handle(e);
  }
}
