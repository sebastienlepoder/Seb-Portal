import { NextResponse } from 'next/server';
import { requireApiAuth, requireApiAdmin, getApiUser } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';

// GET: single service
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiAuth();
    const service = await prisma.service.findUnique({ where: { id: params.id } });
    if (!service) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      data: { ...service, tags: service.tags ? JSON.parse(service.tags) : [] },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// PUT: update service (admin)
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const body = await request.json();
    const service = await prisma.service.update({
      where: { id: params.id },
      data: {
        ...body,
        tags: body.tags ? JSON.stringify(body.tags) : undefined,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'service_update',
      details: { serviceId: params.id, changes: Object.keys(body) },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: service });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// DELETE: remove service (admin)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    await prisma.service.delete({ where: { id: params.id } });

    await auditLog({
      userId: user.id,
      action: 'service_delete',
      details: { serviceId: params.id },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: record click event
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    await prisma.clickEvent.create({
      data: { userId: user.id, serviceId: params.id },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
