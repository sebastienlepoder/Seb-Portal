import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toAgentProfileDTO } from '@/lib/agents';

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120).optional(),
  expertise: z.array(z.string().min(1).max(40)).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().min(1).max(20000).optional(),
  model: z.string().max(80).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiAdmin();
    const agent = await prisma.agentProfile.findUnique({ where: { id: params.id } });
    if (!agent) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: toAgentProfileDTO(agent) });
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
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const updated = await prisma.agentProfile.update({
      where: { id: params.id },
      data: {
        name: d.name,
        role: d.role,
        expertise: d.expertise ? JSON.stringify(d.expertise) : undefined,
        description: d.description,
        systemPrompt: d.systemPrompt,
        model: d.model,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'agent_profile',
        op: 'update',
        id: params.id,
        changes: Object.keys(d),
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: toAgentProfileDTO(updated) });
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

    // Refuse if there are tasks still in flight for this agent
    const inFlight = await prisma.task.count({
      where: {
        agentProfileId: params.id,
        status: { in: ['pending', 'queued', 'in_progress'] },
      },
    });
    if (inFlight > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot delete: ${inFlight} task(s) still pending/in-progress for this agent`,
        },
        { status: 409 }
      );
    }

    await prisma.agentProfile.delete({ where: { id: params.id } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'agent_profile', op: 'delete', id: params.id },
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
  console.error('[admin/agents/:id] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
