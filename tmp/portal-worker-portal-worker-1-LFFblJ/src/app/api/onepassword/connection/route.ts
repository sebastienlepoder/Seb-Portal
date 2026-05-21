import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { getConnection, testConnection } from '@/lib/onepassword';

const upsertSchema = z.object({
  connectHost: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => /^https?:\/\//i.test(v), 'connectHost must start with http:// or https://'),
  accessToken: z.string().min(10).max(8192),
  defaultVaultId: z.string().min(1).max(200).optional().nullable(),
});

function redact(conn: Awaited<ReturnType<typeof getConnection>>) {
  if (!conn) {
    return {
      configured: false,
      connectHost: null,
      defaultVaultId: null,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestMessage: null,
    };
  }
  return {
    configured: true,
    connectHost: conn.connectHost,
    defaultVaultId: conn.defaultVaultId,
    lastTestedAt: conn.lastTestedAt,
    lastTestStatus: conn.lastTestStatus,
    lastTestMessage: conn.lastTestMessage,
  };
}

export async function GET() {
  try {
    await requireApiAdmin();
    const conn = await getConnection();
    return NextResponse.json({ ok: true, data: redact(conn) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }
    const parsed = upsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { connectHost, accessToken, defaultVaultId } = parsed.data;

    const test = await testConnection(connectHost, accessToken);
    if (!test.ok) {
      return NextResponse.json(
        { ok: false, error: `Test failed: ${test.message}` },
        { status: 400 }
      );
    }

    const enc = encryptSecret(accessToken);
    const now = new Date();
    const saved = await prisma.onePasswordConnection.upsert({
      where: { slug: 'default' },
      update: {
        connectHost,
        encryptedToken: enc.ciphertext,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        defaultVaultId: defaultVaultId ?? null,
        lastTestedAt: now,
        lastTestStatus: 'ok',
        lastTestMessage: test.message,
      },
      create: {
        slug: 'default',
        connectHost,
        encryptedToken: enc.ciphertext,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        defaultVaultId: defaultVaultId ?? null,
        lastTestedAt: now,
        lastTestStatus: 'ok',
        lastTestMessage: test.message,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'onepassword_connection',
        op: 'upsert',
        connectHost,
        vaultCount: test.vaultCount,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: redact(saved) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }
    await prisma.onePasswordConnection.deleteMany({ where: { slug: 'default' } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'onepassword_connection', op: 'delete' },
      ipAddress: getClientIp(request),
    });
    return NextResponse.json({ ok: true, data: redact(null) });
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
  console.error('[onepassword/connection] error:', msg);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
