import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { toTaskDTO } from '@/lib/agents';
import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from '@/types/agents';

// GET /api/ai-hub/tasks?status=pending,queued,in_progress&projectId=...&agentId=...
export async function GET(request: Request) {
  try {
    await requireApiAuth();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const agentId = searchParams.get('agentId');
    const priorityParam = searchParams.get('priority');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 500);

    const where: {
      status?: TaskStatus | { in: TaskStatus[] };
      projectId?: string;
      agentProfileId?: string;
      priority?: TaskPriority;
    } = {};

    if (statusParam) {
      const parts = statusParam.split(',').filter(isTaskStatus);
      if (parts.length === 1) where.status = parts[0];
      else if (parts.length > 1) where.status = { in: parts };
    }
    if (projectId) where.projectId = projectId;
    if (agentId) where.agentProfileId = agentId;
    if (priorityParam && isTaskPriority(priorityParam)) where.priority = priorityParam;

    const tasks = await prisma.task.findMany({
      where,
      include: { project: true, agentProfile: true },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
    return NextResponse.json({ ok: true, data: tasks.map(toTaskDTO) });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai-hub/tasks] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
