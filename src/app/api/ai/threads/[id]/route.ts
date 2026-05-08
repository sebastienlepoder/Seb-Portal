import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';
import type { AiMessage } from '@/types';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAuth();
    const thread = await prisma.aiThread.findUnique({ where: { id: params.id } });
    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    let messages: AiMessage[] = [];
    try {
      const parsed = JSON.parse(thread.messages);
      if (Array.isArray(parsed)) messages = parsed as AiMessage[];
    } catch {
      messages = [];
    }
    return NextResponse.json({
      ok: true,
      data: {
        id: thread.id,
        title: thread.title,
        provider: thread.provider,
        messages,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai/threads/:id] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// PATCH — rename a thread (title only)
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }
    const body = (await request.json()) as { title?: string };
    const thread = await prisma.aiThread.findUnique({ where: { id: params.id } });
    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    await prisma.aiThread.update({
      where: { id: params.id },
      data: { title: (body.title || '').trim().slice(0, 200) || null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai/threads/:id] PATCH error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }
    const thread = await prisma.aiThread.findUnique({ where: { id: params.id } });
    if (!thread || thread.userId !== user.id) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    await prisma.aiThread.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai/threads/:id] DELETE error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
