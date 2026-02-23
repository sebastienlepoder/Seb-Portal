import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';

// GET: list notes
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const url = new URL(request.url);
    const search = url.searchParams.get('q');

    const notes = await prisma.aiNote.findMany({
      where: {
        userId: user.id,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { content: { contains: search } },
                { tags: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      ok: true,
      data: notes.map((n) => ({ ...n, tags: n.tags ? JSON.parse(n.tags) : [] })),
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: create note
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const body = (await request.json()) as {
      title?: string;
      content: string;
      tags?: string[];
    };

    if (!body.content) {
      return NextResponse.json({ ok: false, error: 'Content required' }, { status: 400 });
    }

    const note = await prisma.aiNote.create({
      data: {
        userId: user.id,
        title: body.title || null,
        content: body.content,
        tags: body.tags ? JSON.stringify(body.tags) : null,
      },
    });

    return NextResponse.json({ ok: true, data: note }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
