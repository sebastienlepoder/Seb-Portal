import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { dispatchTask, DispatchError } from '@/lib/agent-dispatch';
import { toTaskDTO } from '@/lib/agents';
import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from '@/types/agents';

const IMAGE_DATA_URI_RE = /^data:image\/(png|jpeg|gif|webp);base64,(.+)$/;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB decoded

const dispatchSchema = z.object({
  project_name: z.string().min(1).max(200),
  task_title: z.string().min(1).max(200),
  task_description: z.string().min(1).max(10000),
  agent_role: z.string().max(120).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  attachments: z
    .array(
      z.object({
        dataUri: z.string().regex(IMAGE_DATA_URI_RE),
        filename: z.string().max(255).optional(),
      })
    )
    .max(8)
    .optional(),
});

/**
 * POST /api/ai-hub/dispatch-task — create a new task from the AI Hub
 *
 * GET /api/ai-hub/dispatch-task?status=...&projectId=...&agentId=...
 *   Lists tasks with filters. Mostly delegates to /api/ai-hub/tasks but
 *   exists at this URL for the spec.
 */

export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const parsed = dispatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;

    // Pre-parse attachments so we can reject oversized payloads before
    // dispatching the task. Each entry yields the row we'll insert.
    const attachmentRows: {
      mimeType: string;
      dataBase64: string;
      filename: string | null;
      byteSize: number;
    }[] = [];
    for (const a of d.attachments ?? []) {
      const m = IMAGE_DATA_URI_RE.exec(a.dataUri)!;
      const mimeType = `image/${m[1]}`;
      const dataBase64 = m[2]!;
      const byteSize = Math.floor((dataBase64.length * 3) / 4);
      if (byteSize > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'Attachment exceeds 5 MB limit' },
          { status: 400 }
        );
      }
      attachmentRows.push({
        mimeType,
        dataBase64,
        filename: a.filename ?? null,
        byteSize,
      });
    }

    try {
      const result = await dispatchTask({
        projectName: d.project_name,
        taskTitle: d.task_title,
        taskDescription: d.task_description,
        agentRole: d.agent_role,
        priority: d.priority,
        createdById: user.id === 'amonis-worker' ? null : user.id,
      });

      if (attachmentRows.length > 0) {
        await prisma.taskAttachment.createMany({
          data: attachmentRows.map((row) => ({ ...row, taskId: result.taskId })),
        });
      }

      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: {
          resource: 'task',
          op: 'dispatch',
          taskId: result.taskId,
          project: result.matchedProjectSlug,
          agent: result.matchedAgentSlug,
          attachmentCount: attachmentRows.length,
        },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json(result, { status: 201 });
    } catch (e) {
      if (e instanceof DispatchError) {
        const status =
          e.code === 'INVALID_INPUT'
            ? 400
            : e.code === 'PROJECT_NOT_FOUND' || e.code === 'AGENT_NOT_FOUND'
              ? 404
              : 409;
        return NextResponse.json({ ok: false, error: e.message, code: e.code }, { status });
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(request: Request) {
  try {
    await requireApiAuth();
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const projectId = searchParams.get('projectId');
    const agentId = searchParams.get('agentId');
    const priorityParam = searchParams.get('priority');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500);

    const where: {
      status?: TaskStatus | { in: TaskStatus[] };
      projectId?: string;
      agentProfileId?: string;
      priority?: TaskPriority;
    } = {};

    if (statusParam) {
      const parts = statusParam.split(',').filter(isTaskStatus);
      if (parts.length === 1) where.status = parts[0];
      else if (parts.length > 1) where.status = { in: parts };
    }
    if (projectId) where.projectId = projectId;
    if (agentId) where.agentProfileId = agentId;
    if (priorityParam && isTaskPriority(priorityParam)) where.priority = priorityParam;

    const tasks = await prisma.task.findMany({
      where,
      include: { project: true, agentProfile: true, parent: { select: { title: true } } },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
    return NextResponse.json({ ok: true, data: tasks.map(toTaskDTO) });
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
  console.error('[ai-hub/dispatch-task] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
