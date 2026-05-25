import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';

async function runClaudeAgent(
  taskId: string,
  agentId: string,
  systemPrompt: string | null,
  userMessage: string,
) {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    await prisma.amonisAgentLog.create({
      data: { agentId, taskId, type: 'error', message: 'ANTHROPIC_API_KEY not configured' },
    });
    await prisma.amonisTask.update({ where: { id: taskId }, data: { status: 'assigned' } });
    await prisma.amonisAgent.update({ where: { id: agentId }, data: { status: 'idle' } });
    return;
  }

  try {
    await prisma.amonisAgentLog.create({
      data: { agentId, taskId, type: 'info', message: 'Claude agent starting...' },
    });

    const stream = anthropic.messages.stream({
      model: ANTHROPIC_MODELS.sonnet,
      max_tokens: 8192,
      system:
        systemPrompt ||
        'You are a software engineer working on a mobile finance app. Analyze the task and provide a detailed plan and implementation summary.',
      messages: [{ role: 'user', content: userMessage }],
    });

    let buffer = '';
    let fullResponse = '';

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        buffer += chunk.delta.text;
        fullResponse += chunk.delta.text;

        // Flush buffer to DB on paragraph breaks or when it gets large
        if (buffer.includes('\n\n') || buffer.length > 400) {
          const parts = buffer.split('\n\n');
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i]!.trim();
            if (part) {
              await prisma.amonisAgentLog.create({
                data: { agentId, taskId, type: 'thinking', message: part },
              });
            }
          }
          buffer = parts[parts.length - 1] || '';
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      await prisma.amonisAgentLog.create({
        data: { agentId, taskId, type: 'thinking', message: buffer.trim() },
      });
    }

    // Mark task ready for review
    await prisma.amonisTask.update({
      where: { id: taskId },
      data: {
        status: 'needs_review',
        workSummary: fullResponse.slice(0, 5000),
      },
    });

    await prisma.amonisAgent.update({
      where: { id: agentId },
      data: { status: 'waiting_review' },
    });

    await prisma.amonisAgentLog.create({
      data: { agentId, taskId, type: 'info', message: 'Task complete. Ready for review.' },
    });
  } catch (e) {
    console.error('Claude agent error:', e);
    try {
      await prisma.amonisAgentLog.create({
        data: {
          agentId,
          taskId,
          type: 'error',
          message: `Agent error: ${(e as Error).message}`,
        },
      });
      await prisma.amonisTask.update({ where: { id: taskId }, data: { status: 'assigned' } });
      await prisma.amonisAgent.update({ where: { id: agentId }, data: { status: 'idle' } });
    } catch {
      // ignore secondary errors
    }
  }
}

// POST /api/amonis/tasks/trigger - Trigger a task to start running via Claude API
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
    data: { status: 'in_progress', startedAt: new Date() },
  });

  if (task.agentId) {
    await prisma.amonisAgentLog.create({
      data: { agentId: task.agentId, taskId, type: 'info', message: 'Task triggered by user' },
    });
    await prisma.amonisAgent.update({
      where: { id: task.agentId },
      data: { status: 'working' },
    });
  }

  // Build the prompt for Claude
  const agent = task.agent;
  let userMessage = `Work on this task: "${task.title}"`;
  if (task.description) {
    userMessage += `\n\nDescription:\n${task.description}`;
  }
  if (agent?.scope) {
    userMessage += `\n\nYour area of responsibility: ${agent.scope}`;
  }
  userMessage += `\n\nProvide a detailed analysis and work summary: what changes need to be made, which files are affected, and any implementation notes. Be specific about file paths and code changes.`;

  if (task.agentId) {
    // Fire and forget — Claude runs in the background, writing logs to the DB
    void runClaudeAgent(taskId, task.agentId, agent?.systemPrompt ?? null, userMessage);
  }

  return NextResponse.json({
    ok: true,
    message: task.agentId
      ? 'Task triggered. Claude agent is working.'
      : 'Task marked in progress. No agent assigned.',
    triggered: !!task.agentId,
    task: { id: task.id, title: task.title, agent: agent?.name },
  });
}
