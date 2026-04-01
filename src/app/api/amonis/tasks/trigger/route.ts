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

  // Trigger OpenClaw immediately via internal API
  let triggered = false;
  const openclawUrl = process.env.OPENCLAW_API_URL; // e.g., http://localhost:18789 or https://gateway.openclaw.ai
  const openclawToken = process.env.OPENCLAW_API_TOKEN;
  
  if (openclawUrl && openclawToken) {
    try {
      // Build the message for the agent
      const agent = task.agent;
      let message = `[Amonis Task - IMMEDIATE] Work on: "${task.title}"`;
      
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
      message += `\n\n## IMPORTANT - Completion Instructions`;
      message += `\nWhen you finish the task, your final message should include:`;
      message += `\n- A brief summary of what you did`;
      message += `\n- List of files changed (if any)`;
      message += `\n\nDo NOT use curl or exec commands to call APIs. Just complete the work and report back in plain text.`;
      message += `\nThe portal will handle status updates based on your completion.`;

      // Use OpenClaw's tools/invoke HTTP API to spawn an isolated session
      const response = await fetch(`${openclawUrl}/tools/invoke`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openclawToken}`,
        },
        body: JSON.stringify({
          tool: 'sessions_spawn',
          args: {
            task: message,
            mode: 'run', // One-shot execution
            label: `amonis-task-${task.id}`,
            runTimeoutSeconds: 600, // 10 minute timeout
          },
        }),
      });

      if (response.ok) {
        triggered = true;
        
        // Log that we kicked off the work
        await prisma.amonisAgentLog.create({
          data: {
            agentId: task.agentId!,
            taskId,
            type: 'info',
            message: 'OpenClaw agent session spawned for immediate work',
          },
        });
      } else {
        const errorText = await response.text();
        console.error('Failed to spawn OpenClaw session:', errorText);
      }
    } catch (e) {
      console.error('Error triggering OpenClaw:', e);
    }
  }
  
  return NextResponse.json({ 
    ok: true, 
    message: triggered ? 'Task triggered. Agent is working now.' : 'Task marked in progress. Waiting for agent poll.',
    triggered,
    task: { id: task.id, title: task.title, agent: task.agent?.name },
  });
}
