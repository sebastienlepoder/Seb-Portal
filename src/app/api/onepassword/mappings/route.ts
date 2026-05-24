import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { getConnection, resolveSecret } from '@/lib/onepassword';

const postSchema = z.object({
  projectId: z.string().min(1).max(100),
  envName: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'envName must be UPPER_SNAKE_CASE'),
  vaultId: z.string().min(1).max(200),
  itemId: z.string().min(1).max(200),
  fieldLabel: z.string().min(1).max(200),
  note: z.string().max(500).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    await requireApiAdmin();
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: 'projectId query parameter is required' },
        { status: 400 }
      );
    }
    const rows = await prisma.projectSecretMapping.findMany({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
        envName: true,
        vaultId: true,
        itemId: true,
        fieldLabel: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ envName: 'asc' }],
    });
    return NextResponse.json({ ok: true, data: rows });
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

    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { projectId, envName, vaultId, itemId, fieldLabel, note } = parsed.data;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { ok: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const conn = await getConnection();
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: 'No 1Password connection configured' },
        { status: 400 }
      );
    }

    try {
      await resolveSecret(vaultId, itemId, fieldLabel);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `Field does not resolve: ${(e as Error).message}`,
        },
        { status: 400 }
      );
    }

    const existing = await prisma.projectSecretMapping.findUnique({
      where: { projectId_envName: { projectId, envName } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `Mapping for ${envName} already exists on this project` },
        { status: 409 }
      );
    }

    const created = await prisma.projectSecretMapping.create({
      data: {
        projectId,
        envName,
        vaultId,
        itemId,
        fieldLabel,
        note: note ?? null,
      },
      select: {
        id: true,
        projectId: true,
        envName: true,
        vaultId: true,
        itemId: true,
        fieldLabel: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'onepassword_secret_mapping',
        op: 'create',
        mappingId: created.id,
        projectId,
        envName,
        vaultId,
        itemId,
        fieldLabel,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: created });
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
  return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
}
