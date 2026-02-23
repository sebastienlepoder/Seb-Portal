import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';

// GET: user's favorites
export async function GET() {
  try {
    const user = await requireApiAuth();
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      include: { service: true },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      ok: true,
      data: favorites.map((f) => ({
        ...f,
        service: { ...f.service, tags: f.service.tags ? JSON.parse(f.service.tags) : [] },
      })),
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: toggle favorite
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const { serviceId } = (await request.json()) as { serviceId: string };
    if (!serviceId) {
      return NextResponse.json({ ok: false, error: 'serviceId required' }, { status: 400 });
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_serviceId: { userId: user.id, serviceId } },
    });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, data: { favorited: false } });
    } else {
      const count = await prisma.favorite.count({ where: { userId: user.id } });
      await prisma.favorite.create({
        data: { userId: user.id, serviceId, sortOrder: count },
      });
      return NextResponse.json({ ok: true, data: { favorited: true } });
    }
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
