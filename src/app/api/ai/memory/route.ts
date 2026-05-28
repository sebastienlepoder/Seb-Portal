import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';

export const runtime = 'nodejs';

const TYPES = ['user', 'project', 'feedback', 'reference', 'general'];

export async function GET() {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  const entries = await prisma.aiMemory.findMany({
    where: { userId: user.id },
    orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }],
  });
  return Response.json({
    ok: true,
    data: entries.map((e) => ({
      id: e.id,
      key: e.key,
      type: e.type,
      value: e.value,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

// POST { key, value, type? } — create or overwrite by (user, key)
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim().slice(0, 120) : '';
  const value = typeof body?.value === 'string' ? body.value : '';
  const type = TYPES.includes(body?.type) ? body.type : 'general';
  if (!key) return Response.json({ ok: false, error: 'key required' }, { status: 400 });

  const entry = await prisma.aiMemory.upsert({
    where: { userId_key: { userId: user.id, key } },
    create: { userId: user.id, key, value, type },
    update: { value, type },
  });
  return Response.json({
    ok: true,
    data: {
      id: entry.id,
      key: entry.key,
      type: entry.type,
      value: entry.value,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    },
  });
}

// DELETE ?id=<id>
export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!id) return Response.json({ ok: false, error: 'id required' }, { status: 400 });

  // Scope delete to the caller's own entries.
  const entry = await prisma.aiMemory.findUnique({ where: { id } });
  if (!entry || entry.userId !== user.id) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  await prisma.aiMemory.delete({ where: { id } });
  return Response.json({ ok: true });
}
