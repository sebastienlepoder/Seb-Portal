import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// GET /api/amonis/agents/[id] - Get agent details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const agent = await prisma.amonisAgent.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  if (!agent) {
    return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: agent });
}

// PATCH /api/amonis/agents/[id] - Update agent
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updateData: Record<string, unknown> = {};

  const allowedFields = [
    'name', 'description', 'systemPrompt', 'icon', 'color', 'scope', 'status', 'enabled', 'sortOrder',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  const agent = await prisma.amonisAgent.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ ok: true, data: agent });
}
