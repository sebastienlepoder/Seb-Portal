import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { getApiUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const typePrefix = url.searchParams.get('type') || undefined;

  const rows = await prisma.activity.findMany({
    where: typePrefix ? { type: { startsWith: typePrefix } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return Response.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      type: r.type,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actor,
      description: r.description,
      data: r.data ? safeParse(r.data) : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
