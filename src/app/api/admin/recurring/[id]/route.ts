import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';
import { parseNaturalSchedule } from '@/lib/schedule/parse';
import { computeNextRun } from '@/lib/schedule/cron';
import { validatePayload, type DispatchKind } from '@/lib/schedule/dispatch';

export const runtime = 'nodejs';

const ALLOWED_KINDS: DispatchKind[] = ['mcp', 'webhook', 'task'];

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

  const existing = await prisma.recurringTask.findUnique({ where: { id } });
  if (!existing) return Response.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') updates.title = body.title.trim() || existing.title;
  if (typeof body.description === 'string') updates.description = body.description.trim() || null;

  if (typeof body.naturalText === 'string' && body.naturalText.trim() !== existing.naturalText) {
    const parsed = parseNaturalSchedule(body.naturalText);
    if (!parsed) return Response.json({ ok: false, error: `Could not parse schedule` }, { status: 400 });
    updates.naturalText = body.naturalText.trim();
    updates.cronExpr = parsed.cronExpr;
    updates.humanReadable = parsed.humanReadable;
    updates.nextRunAt = computeNextRun(parsed.cronExpr);
  }

  if (typeof body.kind === 'string') {
    if (!ALLOWED_KINDS.includes(body.kind as DispatchKind)) {
      return Response.json({ ok: false, error: 'kind must be mcp|webhook|task' }, { status: 400 });
    }
    updates.kind = body.kind;
  }

  if (body.payload !== undefined) {
    const payloadStr =
      typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
    const kindForValidation = (updates.kind ?? existing.kind) as DispatchKind;
    const err = validatePayload(kindForValidation, payloadStr);
    if (err) return Response.json({ ok: false, error: err }, { status: 400 });
    updates.payload = payloadStr;
  }

  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;

  const row = await prisma.recurringTask.update({ where: { id }, data: updates });

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'recurring_update', id, changed: Object.keys(updates) },
    ipAddress: getClientIp(req),
  });

  return Response.json({
    ok: true,
    data: {
      id: row.id,
      title: row.title,
      description: row.description,
      naturalText: row.naturalText,
      cronExpr: row.cronExpr,
      humanReadable: row.humanReadable,
      kind: row.kind,
      payload: safeParse(row.payload),
      enabled: row.enabled,
      lastSpawnedAt: row.lastSpawnedAt?.toISOString() ?? null,
      nextRunAt: row.nextRunAt?.toISOString() ?? null,
      spawnCount: row.spawnCount,
      lastError: row.lastError,
    },
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  await prisma.recurringTask.delete({ where: { id } }).catch(() => null);

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'recurring_delete', id },
    ipAddress: getClientIp(req),
  });

  return Response.json({ ok: true });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
