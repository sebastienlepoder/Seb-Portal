import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  const existing = await prisma.skill.findUnique({ where: { id } });
  if (!existing) return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  if (typeof body.enabled !== 'boolean') {
    return Response.json({ ok: false, error: 'only enabled toggle is supported' }, { status: 400 });
  }

  if (body.enabled && existing.securityStatus === 'rejected') {
    return Response.json(
      { ok: false, error: 'Rejected skills cannot be enabled. Fix the file and re-sync.' },
      { status: 400 }
    );
  }

  const row = await prisma.skill.update({
    where: { id },
    data: { enabled: body.enabled },
  });

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'skill_toggle', id, enabled: body.enabled, name: row.name },
    ipAddress: getClientIp(req),
  });

  return Response.json({ ok: true, data: { id: row.id, enabled: row.enabled } });
}
