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

export async function GET() {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const rows = await prisma.recurringTask.findMany({
    orderBy: [{ enabled: 'desc' }, { createdAt: 'desc' }],
  });

  return Response.json({
    ok: true,
    data: rows.map(serialize),
  });
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  if (!(await verifyCsrf(req))) {
    return Response.json({ ok: false, error: 'CSRF' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  const validation = validateInput(body);
  if (!validation.ok) {
    return Response.json({ ok: false, error: validation.error }, { status: 400 });
  }
  const { title, description, naturalText, cronExpr, humanReadable, kind, payload, enabled } =
    validation.value;

  const nextRunAt = computeNextRun(cronExpr);

  const row = await prisma.recurringTask.create({
    data: {
      title,
      description,
      naturalText,
      cronExpr,
      humanReadable,
      kind,
      payload,
      enabled,
      nextRunAt,
      createdById: user.id,
    },
  });

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'recurring_create', id: row.id, title, cronExpr, kind },
    ipAddress: getClientIp(req),
  });

  return Response.json({ ok: true, data: serialize(row) });
}

interface ValidatedInput {
  title: string;
  description: string | null;
  naturalText: string;
  cronExpr: string;
  humanReadable: string;
  kind: DispatchKind;
  payload: string;
  enabled: boolean;
}

export function validateInput(
  body: Record<string, unknown>
): { ok: true; value: ValidatedInput } | { ok: false; error: string } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { ok: false, error: 'title required' };

  const naturalText = typeof body.naturalText === 'string' ? body.naturalText.trim() : '';
  if (!naturalText) return { ok: false, error: 'naturalText required' };

  const parsed = parseNaturalSchedule(naturalText);
  if (!parsed) return { ok: false, error: `Could not parse schedule: "${naturalText}"` };

  const kind = body.kind as DispatchKind;
  if (!ALLOWED_KINDS.includes(kind)) return { ok: false, error: 'kind must be mcp|webhook|task' };

  let payload: string;
  if (typeof body.payload === 'string') {
    payload = body.payload;
  } else if (body.payload && typeof body.payload === 'object') {
    payload = JSON.stringify(body.payload);
  } else {
    return { ok: false, error: 'payload required' };
  }

  const payloadError = validatePayload(kind, payload);
  if (payloadError) return { ok: false, error: payloadError };

  return {
    ok: true,
    value: {
      title,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      naturalText,
      cronExpr: parsed.cronExpr,
      humanReadable: parsed.humanReadable,
      kind,
      payload,
      enabled: body.enabled !== false,
    },
  };
}

function serialize(row: {
  id: string;
  title: string;
  description: string | null;
  naturalText: string;
  cronExpr: string;
  humanReadable: string;
  kind: string;
  payload: string;
  enabled: boolean;
  lastSpawnedAt: Date | null;
  nextRunAt: Date | null;
  spawnCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
