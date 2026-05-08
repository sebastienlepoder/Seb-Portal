import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
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
