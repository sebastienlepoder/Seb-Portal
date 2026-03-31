import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// GET /api/amonis/agents - List all agents
export async function GET() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const agents = await prisma.amonisAgent.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json({ ok: true, data: agents });
}

// POST /api/amonis/agents - Create agent (admin only)
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const agent = await prisma.amonisAgent.create({
    data: {
      slug: body.slug,
      name: body.name,
      description: body.description,
      icon: body.icon,
      color: body.color,
      scope: body.scope,
      sortOrder: body.sortOrder || 0,
    },
  });

  return NextResponse.json({ ok: true, data: agent });
}
