import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';
import { syncSkillsFromDisk } from '@/lib/skills/registry';
import { writeActivity } from '@/lib/activity';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const rows = await prisma.skill.findMany({
    orderBy: [{ securityStatus: 'asc' }, { name: 'asc' }],
  });

  return Response.json({
    ok: true,
    data: rows.map(serialize),
  });
}

/**
 * POST = trigger a sync from disk. Reads every .md under skills/,
 * scans changed files, upserts metadata.
 */
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

  const result = await syncSkillsFromDisk();

  await auditLog({
    userId: user.id,
    action: 'admin_action',
    details: { action: 'skills_sync', ...result },
    ipAddress: getClientIp(req),
  });

  await writeActivity({
    type: 'skills.synced',
    description: `Skills synced: ${result.scanned} scanned, ${result.added} added, ${result.updated} updated, ${result.removed} removed`,
    entityType: 'skill',
    actor: user.id,
    data: result,
  });

  return Response.json({ ok: true, data: result });
}

function serialize(row: {
  id: string;
  source: string;
  name: string;
  filePath: string;
  description: string | null;
  contentHash: string;
  securityStatus: string;
  securityReport: string | null;
  enabled: boolean;
  lastScannedAt: Date | null;
  installedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    filePath: row.filePath,
    description: row.description,
    contentHash: row.contentHash,
    securityStatus: row.securityStatus,
    securityReport: row.securityReport ? safeParse(row.securityReport) : null,
    enabled: row.enabled,
    lastScannedAt: row.lastScannedAt?.toISOString() ?? null,
    installedAt: row.installedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
