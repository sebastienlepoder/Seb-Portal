import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { checkRateLimit, aiChatLimiter } from '@/lib/rate-limit';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import type { AiProvider, AiMessage } from '@/types';

export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    const ip = getClientIp(request);

    // Rate limit
    const check = checkRateLimit(aiChatLimiter, user.id);
    if (!check.allowed) {
      return NextResponse.json(
        { ok: false, error: 'AI rate limit exceeded. Wait a moment.' },
        { status: 429 }
      );
    }

    const body = (await request.json()) as {
      provider: AiProvider;
      messages: AiMessage[];
      threadId?: string;
      maxTokens?: number;
    };

    const { provider, messages, threadId, maxTokens = 2048 } = body;

    if (!messages?.length) {
      return NextResponse.json({ ok: false, error: 'Messages required' }, { status: 400 });
    }

    let reply: string;

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { ok: false, error: 'OpenAI API key not configured' },
          { status: 503 }
        );
      }
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
        max_tokens: Math.min(maxTokens, 4096),
      });
      reply = completion.choices[0]?.message?.content || 'No response';
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { ok: false, error: 'Anthropic API key not configured' },
          { status: 503 }
        );
      }
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({ apiKey });
      const systemMsg = messages.find((m) => m.role === 'system');
      const userMsgs = messages.filter((m) => m.role !== 'system');
      const completion = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: Math.min(maxTokens, 4096),
        system: systemMsg?.content || undefined,
        messages: userMsgs.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      });
      reply =
        completion.content[0]?.type === 'text' ? completion.content[0].text : 'No response';
    } else {
      return NextResponse.json({ ok: false, error: 'Invalid provider' }, { status: 400 });
    }

    // Save thread
    let savedThreadId = threadId;
    if (threadId) {
      const thread = await prisma.aiThread.findUnique({ where: { id: threadId } });
      if (thread) {
        const existingMessages = JSON.parse(thread.messages) as AiMessage[];
        existingMessages.push(
          messages[messages.length - 1]!,
          { role: 'assistant', content: reply }
        );
        await prisma.aiThread.update({
          where: { id: threadId },
          data: { messages: JSON.stringify(existingMessages) },
        });
      }
    } else {
      const allMessages = [...messages, { role: 'assistant' as const, content: reply }];
      const thread = await prisma.aiThread.create({
        data: {
          userId: user.id,
          provider,
          title: messages[0]?.content.slice(0, 100) || 'New chat',
          messages: JSON.stringify(allMessages),
        },
      });
      savedThreadId = thread.id;
    }

    await auditLog({
      userId: user.id,
      action: 'ai_chat',
      details: { provider, threadId: savedThreadId },
      ipAddress: ip,
    });

    return NextResponse.json({
      ok: true,
      data: { reply, threadId: savedThreadId },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('AI chat error:', e);
    return NextResponse.json(
      { ok: false, error: `AI error: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
