import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toTaskDTO, toTaskLogDTO } from '@/lib/agents';

const patchSchema = z.object({
  action: z.enum(['cancel', 'reassign', 'reprioritize']),
  agentProfileId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    await requireApiAuth();
    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
      include: {
        project: true,
        agentProfile: true,
        logs: { orderBy: { createdAt: 'asc' }, take: 1000 },
      },
    });
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    const { logs, ...rest } = task;
    return NextResponse.json({
      ok: true,
      data: { ...toTaskDTO(rest), logs: logs.map(toTaskLogDTO) },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * PATCH — cancel | reassign (set agentProfileId) | reprioritize
 *
 * Reassign / reprioritize only allowed while the task is still pending or
 * queued (not in flight). Cancel allowed while pending/queued/in_progress.
 */
export async function PATCH(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const task = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }

    const { action } = parsed.data;
    const isInFlight = task.status === 'in_progress';
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(task.status);

    if (action === 'cancel') {
      if (isTerminal) {
        return NextResponse.json(
          { ok: false, error: `Task is already ${task.status}` },
          { status: 409 }
        );
      }
      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          errorMessage: task.errorMessage ?? 'Cancelled by user',
        },
        include: { project: true, agentProfile: true, parent: { select: { title: true } } },
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'warn',
          message: `Cancelled by user ${user.email}`,
        },
      });
      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: { resource: 'task', op: 'cancel', taskId: params.taskId },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    if (action === 'reassign') {
      if (isInFlight || isTerminal) {
        return NextResponse.json(
          { ok: false, error: `Cannot reassign a task that is ${task.status}` },
          { status: 409 }
        );
      }
      if (!parsed.data.agentProfileId) {
        return NextResponse.json(
          { ok: false, error: 'agentProfileId required for reassign' },
          { status: 400 }
        );
      }
      const agent = await prisma.agentProfile.findUnique({
        where: { id: parsed.data.agentProfileId },
      });
      if (!agent || !agent.isActive) {
        return NextResponse.json(
          { ok: false, error: 'Agent not found or inactive' },
          { status: 404 }
        );
      }
      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: { agentProfileId: agent.id },
        include: { project: true, agentProfile: true, parent: { select: { title: true } } },
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'info',
          message: `Reassigned to agent "${agent.slug}" by ${user.email}`,
        },
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    if (action === 'reprioritize') {
      if (isTerminal) {
        return NextResponse.json(
          { ok: false, error: `Cannot reprioritize a task that is ${task.status}` },
          { status: 409 }
        );
      }
      if (!parsed.data.priority) {
        return NextResponse.json(
          { ok: false, error: 'priority required for reprioritize' },
          { status: 400 }
        );
      }
      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: { priority: parsed.data.priority },
        include: { project: true, agentProfile: true, parent: { select: { title: true } } },
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'info',
          message: `Priority changed to "${parsed.data.priority}" by ${user.email}`,
        },
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const msg = (e as Error).message;
  if (msg === 'UNAUTHORIZED') {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  console.error('[ai-hub/tasks/:taskId] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
