import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// GET /api/amonis/logs - Get logs for a task
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const agentId = searchParams.get('agentId');

  const where: Record<string, string> = {};
  if (taskId) where.taskId = taskId;
  if (agentId) where.agentId = agentId;

  const logs = await prisma.amonisAgentLog.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  return NextResponse.json({ ok: true, data: logs });
}

// POST /api/amonis/logs - Create a log entry (used by worker)
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { taskId, agentId, type, content } = body;

  if (!agentId || !content) {
    return NextResponse.json({ ok: false, error: 'agentId and content required' }, { status: 400 });
  }

  const log = await prisma.amonisAgentLog.create({
    data: {
      agentId,
      taskId: taskId || null,
      type: type || 'info',
      message: content,
    },
  });

  return NextResponse.json({ ok: true, data: log });
}
