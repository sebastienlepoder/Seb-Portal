import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toProjectSummary } from '@/lib/agents';

// Full project shape used by the agent dispatch admin UI. The portal also has
// /api/projects (lighter shape) for the existing Projects feature; both write
// to the same Project table.
const projectSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase, numbers, hyphens'),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  repoUrl: z.string().url().optional().nullable().or(z.literal('').transform(() => null)),
  repoOwner: z.string().max(120).optional().nullable(),
  repoName: z.string().max(120).optional().nullable(),
  workingBranch: z.string().max(120).default('main'),
  clonePath: z.string().max(500).optional().nullable(),
  allowWrite: z.boolean().default(false),
  status: z.enum(['active', 'paused', 'completed', 'archived']).default('active'),
  icon: z.string().max(120).optional().nullable(),
  color: z.string().max(40).optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  try {
    await requireApiAdmin();
    const projects = await prisma.project.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({
      ok: true,
      data: projects.map((p) => ({
        ...toProjectSummary(p),
        description: p.description,
        repoUrl: p.repoUrl,
        clonePath: p.clonePath,
        status: p.status,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const parsed = projectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const existing = await prisma.project.findUnique({ where: { slug: d.slug } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'Project with this slug already exists' },
        { status: 409 }
      );
    }
    const created = await prisma.project.create({
      data: {
        slug: d.slug,
        name: d.name,
        description: d.description ?? null,
        repoUrl: d.repoUrl ?? null,
        repoOwner: d.repoOwner ?? null,
        repoName: d.repoName ?? null,
        workingBranch: d.workingBranch,
        clonePath: d.clonePath ?? null,
        allowWrite: d.allowWrite,
        status: d.status,
        icon: d.icon ?? null,
        color: d.color ?? null,
        sortOrder: d.sortOrder,
      },
    });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'project', op: 'create', slug: created.slug, id: created.id },
      ipAddress: getClientIp(request),
    });
    return NextResponse.json(
      { ok: true, data: toProjectSummary(created) },
      { status: 201 }
    );
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
  console.error('[admin/projects] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
