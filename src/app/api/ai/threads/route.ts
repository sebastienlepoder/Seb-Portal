import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';

// GET /api/ai/threads — list current user's threads, newest first
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const threads = await prisma.aiThread.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });
    const summaries = threads.map((t) => {
      let count = 0;
      try {
        const arr = JSON.parse(t.messages);
        if (Array.isArray(arr)) count = arr.length;
      } catch {}
      return {
        id: t.id,
        title: t.title,
        provider: t.provider,
        messageCount: count,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });
    return NextResponse.json({ ok: true, data: summaries });
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
