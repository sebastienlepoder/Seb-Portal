import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/amonis/webhook - Trigger OpenClaw to work on a task
// Called automatically when a task is assigned to an agent
export async function POST(request: Request) {
  // Verify webhook secret
  const authHeader = request.headers.get('authorization');
  const webhookSecret = process.env.AMONIS_WEBHOOK_SECRET;
  
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { taskId, action } = body;

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

  // Call OpenClaw webhook to trigger agent work
  const openclawWebhook = process.env.OPENCLAW_WEBHOOK_URL;
  
  if (openclawWebhook) {
    try {
      const message = buildAgentMessage(task, action);
      
      await fetch(openclawWebhook, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENCLAW_WEBHOOK_SECRET || ''}`,
        },
        body: JSON.stringify({
          message,
          metadata: {
            source: 'amonis',
            taskId: task.id,
            agentSlug: task.agent?.slug,
            action: action || 'work',
          },
        }),
      });

      // Log the trigger (agentId may be null if the task hasn't been assigned;
      // in that case we skip the agent-scoped log since AmonisAgentLog requires one).
      const agentId = task.agentId ?? null;
      if (agentId) {
        await prisma.amonisAgentLog.create({
          data: {
            agentId,
            taskId: task.id,
            type: 'info',
            message: `Task triggered: ${action || 'work'}`,
          },
        });
      }

      // Update task status to in_progress
      if (task.status === 'assigned' || task.status === 'pending') {
        await prisma.amonisTask.update({
          where: { id: taskId },
          data: { status: 'in_progress', startedAt: new Date() },
        });
      }

      return NextResponse.json({ ok: true, message: 'Agent triggered' });
    } catch (e) {
      console.error('Failed to trigger OpenClaw:', e);
      return NextResponse.json({ ok: false, error: 'Failed to trigger agent' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 500 });
}

function buildAgentMessage(task: { 
  id: string; 
  title: string; 
  description: string | null;
  agent?: { slug: string; name: string; systemPrompt: string | null; scope: string | null } | null;
}, action?: string): string {
  const agent = task.agent;
  
  if (action === 'designer_review') {
    return `[Amonis Designer Review] Review the work done on task "${task.title}" (ID: ${task.id}). Check UI/UX, colors, spacing, and visual design. Add your notes to designerNotes field via the API.`;
  }
  
  if (action === 'devil_review') {
    return `[Amonis QA Review] Review the work done on task "${task.title}" (ID: ${task.id}). Find edge cases, bugs, and potential issues. Add your critique to devilNotes field via the API.`;
  }

  let message = `[Amonis Task] Work on: "${task.title}"`;
  
  if (task.description) {
    message += `\n\nDescription: ${task.description}`;
  }
  
  if (agent) {
    message += `\n\nAgent: ${agent.name}`;
    if (agent.scope) {
      message += `\nScope: ${agent.scope}`;
    }
    if (agent.systemPrompt) {
      message += `\n\nAgent Instructions:\n${agent.systemPrompt}`;
    }
  }
  
  message += `\n\nTask ID: ${task.id}`;
  message += `\n\nWhen done, update the task via PATCH /api/amonis/tasks/${task.id} with:
- status: "review_designer" (for designer review) or "done" (if complete)
- workSummary: brief description of changes
- filesChanged: list of modified files`;

  return message;
}
