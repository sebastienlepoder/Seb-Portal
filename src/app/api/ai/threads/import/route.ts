import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';
import type { AiMessage, AiProvider } from '@/types';

export const runtime = 'nodejs';

// POST { title?, provider?, messages: AiMessage[] } — create a thread
// from an exported JSON payload.
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return Response.json({ ok: false, error: 'messages array required' }, { status: 400 });
  }

  const messages: AiMessage[] = body.messages
    .filter((m: unknown): m is { role: string; content: unknown } =>
      !!m && typeof m === 'object' && 'role' in m
    )
    .map((m: { role: string; content: unknown; images?: unknown; thinking?: unknown; toolCalls?: unknown }) => ({
      role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as AiMessage['role'],
      content: typeof m.content === 'string' ? m.content : '',
      ...(Array.isArray(m.images) ? { images: m.images.filter((i): i is string => typeof i === 'string') } : {}),
      ...(typeof m.thinking === 'string' ? { thinking: m.thinking } : {}),
      ...(Array.isArray(m.toolCalls) ? { toolCalls: m.toolCalls } : {}),
    }))
    .slice(0, 1000);

  if (messages.length === 0) {
    return Response.json({ ok: false, error: 'No valid messages' }, { status: 400 });
  }

  const provider: AiProvider = body.provider === 'openai' ? 'openai' : 'anthropic';
  const title =
    (typeof body.title === 'string' && body.title.trim().slice(0, 200)) ||
    messages.find((m) => m.role === 'user')?.content.slice(0, 100) ||
    'Imported chat';

  const thread = await prisma.aiThread.create({
    data: {
      userId: user.id,
      provider,
      title,
      messages: JSON.stringify(messages),
    },
  });

  return Response.json({ ok: true, data: { id: thread.id } });
}
