import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toTaskDTO, toTaskLogDTO } from '@/lib/agents';

const patchSchema = z.object({
  action: z.enum([
    'cancel',
    'reassign',
    'reprioritize',
    'mark_reviewed',
    'merge_and_review',
    'undo',
  ]),
  agentProfileId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

const TASK_WITH_RELATIONS = {
  project: true,
  agentProfile: true,
  parent: { select: { title: true } },
} as const;

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    await requireApiAuth();
    const task = await prisma.task.findUnique({
      where: { id: params.taskId },
      include: {
        project: true,
        agentProfile: true,
        logs: { orderBy: { createdAt: 'asc' }, take: 1000 },
        attachments: { orderBy: { createdAt: 'asc' } },
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
 * PATCH — cancel | reassign | reprioritize | mark_reviewed | merge_and_review | undo
 *
 * Reassign / reprioritize only allowed while the task is still pending or
 * queued (not in flight). Cancel allowed while pending/queued/in_progress.
 * Review actions only allowed while status is needs_review.
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
        include: TASK_WITH_RELATIONS,
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
        include: TASK_WITH_RELATIONS,
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
        include: TASK_WITH_RELATIONS,
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

    if (action === 'mark_reviewed') {
      if (task.status !== 'needs_review') {
        return NextResponse.json(
          { ok: false, error: `Task is ${task.status}; only needs_review tasks can be marked reviewed` },
          { status: 409 }
        );
      }
      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: {
          status: 'completed',
          reviewedAt: new Date(),
          reviewedById: user.id,
        },
        include: TASK_WITH_RELATIONS,
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'info',
          message: `Marked reviewed by ${user.email}`,
        },
      });
      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: { resource: 'task', op: 'mark_reviewed', taskId: params.taskId },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    if (action === 'merge_and_review') {
      if (task.status !== 'needs_review') {
        return NextResponse.json(
          { ok: false, error: `Task is ${task.status}; only needs_review tasks can be merged` },
          { status: 409 }
        );
      }
      if (task.resultType !== 'pr' || !task.resultUrl) {
        return NextResponse.json(
          { ok: false, error: 'Task has no associated pull request to merge' },
          { status: 409 }
        );
      }
      if (task.mergedAt) {
        return NextResponse.json(
          { ok: false, error: 'PR is already merged — use mark_reviewed instead' },
          { status: 409 }
        );
      }
      const pr = parsePrUrl(task.resultUrl);
      if (!pr) {
        return NextResponse.json(
          { ok: false, error: `Could not parse PR URL: ${task.resultUrl}` },
          { status: 400 }
        );
      }
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        return NextResponse.json(
          { ok: false, error: 'GITHUB_TOKEN not configured on server' },
          { status: 500 }
        );
      }

      const res = await fetch(
        `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/merge`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify({ merge_method: 'squash' }),
        }
      );
      if (!res.ok) {
        const ghMessage = await extractGithubMessage(res);
        return NextResponse.json(
          { ok: false, error: `GitHub merge failed: ${ghMessage}` },
          { status: 502 }
        );
      }

      const now = new Date();
      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: {
          status: 'completed',
          mergedAt: now,
          reviewedAt: now,
          reviewedById: user.id,
        },
        include: TASK_WITH_RELATIONS,
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'info',
          message: `Merged PR #${pr.number} and marked reviewed by ${user.email}`,
        },
      });
      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: {
          resource: 'task',
          op: 'merge_and_review',
          taskId: params.taskId,
          prNumber: pr.number,
        },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    if (action === 'undo') {
      if (task.status !== 'needs_review') {
        return NextResponse.json(
          { ok: false, error: `Task is ${task.status}; only needs_review tasks can be undone` },
          { status: 409 }
        );
      }
      const token = process.env.GITHUB_TOKEN;
      if (task.mergedAt) {
        await prisma.taskLog.create({
          data: {
            taskId: params.taskId,
            level: 'warn',
            message: 'Undo on a merged task — revert manually on GitHub if needed.',
          },
        });
      } else if (task.resultType === 'pr' && task.resultUrl && token) {
        const pr = parsePrUrl(task.resultUrl);
        if (pr) {
          const res = await fetch(
            `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
              },
              body: JSON.stringify({ state: 'closed' }),
            }
          );
          if (!res.ok) {
            const ghMessage = await extractGithubMessage(res);
            await prisma.taskLog.create({
              data: {
                taskId: params.taskId,
                level: 'warn',
                message: `Failed to close PR #${pr.number} on GitHub: ${ghMessage}`,
              },
            });
          } else {
            await prisma.taskLog.create({
              data: {
                taskId: params.taskId,
                level: 'info',
                message: `Closed PR #${pr.number} on GitHub`,
              },
            });
          }
        }
      }

      const updated = await prisma.task.update({
        where: { id: params.taskId },
        data: {
          status: 'cancelled',
          errorMessage: 'Undone by user',
        },
        include: TASK_WITH_RELATIONS,
      });
      await prisma.taskLog.create({
        data: {
          taskId: params.taskId,
          level: 'warn',
          message: `Undone by ${user.email}`,
        },
      });
      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: { resource: 'task', op: 'undo', taskId: params.taskId },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true, data: toTaskDTO(updated) });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request, { params }: { params: { taskId: string } }) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const task = await prisma.task.findUnique({ where: { id: params.taskId } });
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    if (!['completed', 'failed', 'cancelled'].includes(task.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot delete a task that is ${task.status}; cancel or review it first`,
        },
        { status: 409 }
      );
    }
    await prisma.task.deleteMany({ where: { parentTaskId: params.taskId } });
    await prisma.task.delete({ where: { id: params.taskId } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'task', op: 'delete', taskId: params.taskId },
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

function parsePrUrl(url: string): { owner: string; repo: string; number: number } | null {
  // Accept trailing slashes and query strings.
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/);
  if (!m) return null;
  const number = parseInt(m[3], 10);
  if (!Number.isFinite(number)) return null;
  return { owner: m[1], repo: m[2], number };
}

async function extractGithubMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }
  } catch {
    // fall through
  }
  return `HTTP ${res.status}`;
}

function errorResponse(e: unknown): NextResponse {
  const msg = (e as Error).message;
  if (msg === 'UNAUTHORIZED') {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  console.error('[ai-hub/tasks/:taskId] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
