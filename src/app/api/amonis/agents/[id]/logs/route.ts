import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// GET /api/amonis/agents/[id]/logs - Get agent logs
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const logs = await prisma.amonisAgentLog.findMany({
    where: { agentId: params.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ ok: true, data: logs });
}

// POST /api/amonis/agents/[id]/logs - Add a log entry
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const log = await prisma.amonisAgentLog.create({
    data: {
      agentId: params.id,
      taskId: body.taskId || null,
      type: body.type || 'info',
      message: body.message,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  });

  return NextResponse.json({ ok: true, data: log });
}
