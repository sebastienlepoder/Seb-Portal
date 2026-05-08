import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toProjectSummary } from '@/lib/agents';

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  repoUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  repoOwner: z.string().max(120).nullable().optional(),
  repoName: z.string().max(120).nullable().optional(),
  workingBranch: z.string().max(120).optional(),
  clonePath: z.string().max(500).nullable().optional(),
  allowWrite: z.boolean().optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  icon: z.string().max(120).nullable().optional(),
  color: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiAdmin();
    const p = await prisma.project.findUnique({ where: { id: params.id } });
    if (!p) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      data: {
        ...toProjectSummary(p),
        description: p.description,
        repoUrl: p.repoUrl,
        clonePath: p.clonePath,
        status: p.status,
        sortOrder: p.sortOrder,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updated = await prisma.project.update({
      where: { id: params.id },
      data: parsed.data,
    });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'project',
        op: 'update',
        id: params.id,
        changes: Object.keys(parsed.data),
      },
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ ok: true, data: toProjectSummary(updated) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const inFlight = await prisma.task.count({
      where: {
        projectId: params.id,
        status: { in: ['pending', 'queued', 'in_progress'] },
      },
    });
    if (inFlight > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot delete: ${inFlight} task(s) still pending/in-progress for this project`,
        },
        { status: 409 }
      );
    }
    await prisma.project.delete({ where: { id: params.id } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'project', op: 'delete', id: params.id },
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const msg = (e as Error).message;
  if (msg === 'UNAUTHORIZED') {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }
  if ((e as { code?: string }).code === 'P2025') {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
  console.error('[admin/projects/:id] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
