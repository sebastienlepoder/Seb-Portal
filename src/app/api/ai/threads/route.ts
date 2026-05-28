import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { checkRateLimit, aiThreadCreateLimiter } from '@/lib/rate-limit';
import prisma from '@/lib/db';

// GET /api/ai/threads — list current user's threads.
//   ?archived=1   include only archived (default: only non-archived)
//   ?search=foo   case-insensitive match on title or message content
//   ?tag=work     only threads carrying this tag
//   ?limit=N
// Pinned threads sort first, then by updatedAt desc.
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const wantArchived = searchParams.get('archived') === '1';
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const tagFilter = (searchParams.get('tag') || '').trim();

    const threads = await prisma.aiThread.findMany({
      where: { userId: user.id, archived: wantArchived },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      // Pull a wider set when filtering so client filters don't starve.
      take: search || tagFilter ? 500 : limit,
      select: {
        id: true,
        title: true,
        provider: true,
        pinned: true,
        archived: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });

    let summaries = threads.map((t) => {
      let count = 0;
      let contentBlob = '';
      try {
        const arr = JSON.parse(t.messages);
        if (Array.isArray(arr)) {
          count = arr.length;
          contentBlob = arr
            .map((m: { content?: string }) => (typeof m.content === 'string' ? m.content : ''))
            .join('\n')
            .toLowerCase();
        }
      } catch {}
      let tags: string[] = [];
      try {
        const parsed = t.tags ? JSON.parse(t.tags) : [];
        if (Array.isArray(parsed)) tags = parsed.filter((x): x is string => typeof x === 'string');
      } catch {}
      return {
        id: t.id,
        title: t.title,
        provider: t.provider,
        pinned: t.pinned,
        archived: t.archived,
        tags,
        messageCount: count,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        _searchBlob: `${(t.title || '').toLowerCase()}\n${contentBlob}`,
      };
    });

    if (search) {
      summaries = summaries.filter((s) => s._searchBlob.includes(search));
    }
    if (tagFilter) {
      summaries = summaries.filter((s) => s.tags.includes(tagFilter));
    }

    const data = summaries.slice(0, limit).map(({ _searchBlob, ...rest }) => {
      void _searchBlob;
      return rest;
    });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai/threads] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
  provider: z.enum(['openai', 'anthropic']).default('anthropic'),
});

// POST /api/ai/threads — create an empty thread so the client can
// render it in the sidebar before the first AI response arrives.
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }

    const check = checkRateLimit(aiThreadCreateLimiter, user.id);
    if (!check.allowed) {
      const retryAfter = check.retryAfterSec ?? 60;
      return NextResponse.json(
        {
          ok: false,
          error: 'Too many threads created. Please wait before creating another.',
          code: 'RATE_LIMITED',
        },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const title = parsed.data.title?.trim().slice(0, 200) || null;
    const thread = await prisma.aiThread.create({
      data: {
        userId: user.id,
        provider: parsed.data.provider,
        title,
        messages: '[]',
      },
      select: {
        id: true,
        title: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(
      {
        ok: true,
        data: {
          id: thread.id,
          title: thread.title,
          provider: thread.provider,
          messageCount: 0,
          createdAt: thread.createdAt.toISOString(),
          updatedAt: thread.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai/threads] POST error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
