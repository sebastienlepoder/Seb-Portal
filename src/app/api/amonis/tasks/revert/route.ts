import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/amonis/tasks/revert - Revert changes made by agent
// This marks the task as reverted and triggers OpenClaw to git revert
export async function POST(request: Request) {
  const body = await request.json();
  const { taskId } = body;

  if (!taskId) {
    return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });
  }

  const task = await prisma.amonisTask.findUnique({
    where: { id: taskId },
    include: { agent: true },
  });

  if (!task) {
    return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
  }

  // Update task status to reverted
  await prisma.amonisTask.update({
    where: { id: taskId },
    data: { 
      status: 'reverted',
      description: task.description + '\n\n---\n⚠️ **REVERTED** - Changes were undone.',
    },
  });

  // Log the revert
  if (task.agentId) {
    await prisma.amonisAgentLog.create({
      data: {
        agentId: task.agentId,
        taskId,
        type: 'action',
        message: 'Task reverted by user - git revert requested',
      },
    });
  }

  return NextResponse.json({ 
    ok: true, 
    message: 'Task marked as reverted. Run git revert manually or wait for agent to process.',
  });
}
