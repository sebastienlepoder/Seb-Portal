import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import type { AiMessage } from '@/types';

export const runtime = 'nodejs';

// GET ?format=md|json — download the conversation.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return Response.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  const format = new URL(req.url).searchParams.get('format') === 'json' ? 'json' : 'md';

  const thread = await prisma.aiThread.findUnique({ where: { id: params.id } });
  if (!thread || thread.userId !== user.id) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  let messages: AiMessage[] = [];
  try {
    const parsed = JSON.parse(thread.messages);
    if (Array.isArray(parsed)) messages = parsed as AiMessage[];
  } catch { /* empty */ }

  const safeTitle = (thread.title || 'chat').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60);

  if (format === 'json') {
    const payload = {
      title: thread.title,
      provider: thread.provider,
      createdAt: thread.createdAt.toISOString(),
      messages,
    };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${safeTitle}.json"`,
      },
    });
  }

  const md = renderMarkdown(thread.title, messages);
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}.md"`,
    },
  });
}

function renderMarkdown(title: string | null, messages: AiMessage[]): string {
  const lines: string[] = [`# ${title || 'Conversation'}`, ''];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const who = m.role === 'user' ? '🧑 **You**' : '🤖 **Assistant**';
    lines.push(`### ${who}`, '');
    if (m.thinking) {
      lines.push('<details><summary>Thinking</summary>', '', m.thinking, '', '</details>', '');
    }
    if (m.toolCalls?.length) {
      for (const c of m.toolCalls) {
        lines.push(`> 🔧 \`${c.name}\` — ${c.error ? `error: ${c.error}` : 'ok'}`);
      }
      lines.push('');
    }
    lines.push(m.content || '', '');
  }
  return lines.join('\n');
}
