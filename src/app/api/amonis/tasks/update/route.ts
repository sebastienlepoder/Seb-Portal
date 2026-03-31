import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/amonis/tasks/update - Update task status (service endpoint)
// Secured by AMONIS_SERVICE_TOKEN instead of user session
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const serviceToken = process.env.AMONIS_SERVICE_TOKEN;
  
  // Allow if service token matches OR if no token is configured (dev mode)
  if (serviceToken && authHeader !== `Bearer ${serviceToken}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { taskId, ...updateData } = body;

  if (!taskId) {
    return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });
  }

  // Handle status transitions
  if (updateData.status) {
    if (updateData.status === 'in_progress' && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }
    if (updateData.status === 'done' || updateData.status === 'approved') {
      updateData.completedAt = new Date();
    }
  }

  // Also log the update
  if (updateData.agentId || body.logMessage) {
    const task = await prisma.amonisTask.findUnique({ where: { id: taskId } });
    if (task?.agentId) {
      await prisma.amonisAgentLog.create({
        data: {
          agentId: task.agentId,
          taskId,
          type: body.logType || 'action',
          message: body.logMessage || `Task updated: ${updateData.status || 'modified'}`,
          metadata: JSON.stringify({ updates: Object.keys(updateData) }),
        },
      });
    }
  }

  const task = await prisma.amonisTask.update({
    where: { id: taskId },
    data: updateData,
    include: { agent: true },
  });

  return NextResponse.json({ ok: true, data: task });
}
