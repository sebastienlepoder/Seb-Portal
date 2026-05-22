import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';

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

    const existing = await prisma.projectSecretMapping.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        projectId: true,
        envName: true,
        vaultId: true,
        itemId: true,
        fieldLabel: true,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'Mapping not found' },
        { status: 404 }
      );
    }

    await prisma.projectSecretMapping.delete({ where: { id: existing.id } });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'onepassword_secret_mapping',
        op: 'delete',
        mappingId: existing.id,
        projectId: existing.projectId,
        envName: existing.envName,
        vaultId: existing.vaultId,
        itemId: existing.itemId,
        fieldLabel: existing.fieldLabel,
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
  return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
}
