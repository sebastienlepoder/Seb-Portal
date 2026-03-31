import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Force dynamic - don't pre-render at build time
export const dynamic = 'force-dynamic';

// POST /api/amonis/tasks/trigger - Manually trigger a task to start
// This is a public endpoint (no auth required) for the agent to call
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

  // Update status to in_progress
  await prisma.amonisTask.update({
    where: { id: taskId },
    data: { 
      status: 'in_progress', 
      startedAt: new Date(),
    },
  });

  // Log the trigger
  if (task.agentId) {
    await prisma.amonisAgentLog.create({
      data: {
        agentId: task.agentId,
        taskId,
        type: 'info',
        message: 'Task manually triggered by user',
      },
    });

    // Update agent status to working
    await prisma.amonisAgent.update({
      where: { id: task.agentId },
      data: { status: 'working' },
    });
  }

  // Send to OpenClaw via the cron wake mechanism
  // The next cron poll will pick up this in_progress task
  // Or we can call the webhook directly if configured
  
  return NextResponse.json({ 
    ok: true, 
    message: 'Task triggered. Agent will start working.',
    task: { id: task.id, title: task.title, agent: task.agent?.name },
  });
}
