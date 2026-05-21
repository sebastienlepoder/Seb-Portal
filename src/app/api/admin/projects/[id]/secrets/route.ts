import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';

const createSchema = z.object({
  envName: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'envName must match /^[A-Z_][A-Z0-9_]*$/'),
  vaultId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(200),
  fieldLabel: z.string().min(1).max(200),
  note: z.string().max(1000).nullable().optional(),
});

const mappingSelect = {
  id: true,
  envName: true,
  vaultId: true,
  itemId: true,
  fieldLabel: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await requireApiAdmin();
    const data = await prisma.projectSecretMapping.findMany({
      where: { projectId: params.id },
      orderBy: { envName: 'asc' },
      select: mappingSelect,
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    try {
      const created = await prisma.projectSecretMapping.create({
        data: {
          projectId: params.id,
          envName: parsed.data.envName,
          vaultId: parsed.data.vaultId,
          itemId: parsed.data.itemId,
          fieldLabel: parsed.data.fieldLabel,
          note: parsed.data.note ?? null,
        },
        select: mappingSelect,
      });
      await auditLog({
        userId: user.id,
        action: 'admin_action',
        details: {
          resource: 'project_secret_mapping',
          op: 'create',
          projectId: params.id,
          envName: parsed.data.envName,
        },
        ipAddress: getClientIp(request),
      });
      return NextResponse.json({ ok: true, data: created });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { ok: false, error: 'A mapping for this env var already exists' },
          { status: 400 }
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Missing id query parameter' },
        { status: 400 }
      );
    }
    const mapping = await prisma.projectSecretMapping.findUnique({
      where: { id },
      select: { id: true, projectId: true, envName: true },
    });
    if (!mapping || mapping.projectId !== params.id) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    await prisma.projectSecretMapping.delete({ where: { id } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'project_secret_mapping',
        op: 'delete',
        projectId: params.id,
        envName: mapping.envName,
      },
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
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  console.error('[projects/:id/secrets] error:', e);
  return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
}
