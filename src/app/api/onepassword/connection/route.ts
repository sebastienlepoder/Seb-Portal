import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { testConnection, getConnection } from '@/lib/onepassword';

const postSchema = z.object({
  connectHost: z.string().min(1).max(500),
  accessToken: z.string().min(1).max(4000),
  defaultVaultId: z.string().max(200).optional().nullable(),
});

type RedactedConnection = {
  configured: boolean;
  connectHost: string | null;
  defaultVaultId: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
};

function redact(
  conn: Awaited<ReturnType<typeof getConnection>>
): RedactedConnection {
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
    lastTestedAt: conn.lastTestedAt ? conn.lastTestedAt.toISOString() : null,
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

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(parsed.data.connectHost);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'connectHost is not a valid URL' },
        { status: 400 }
      );
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return NextResponse.json(
        { ok: false, error: 'connectHost must be http or https' },
        { status: 400 }
      );
    }

    const host = parsed.data.connectHost.replace(/\/+$/, '');
    const token = parsed.data.accessToken;
    const defaultVaultId = parsed.data.defaultVaultId ?? null;

    const result = await testConnection(host, token);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: 400 }
      );
    }

    const enc = encryptSecret(token);
    const now = new Date();
    const upserted = await prisma.onePasswordConnection.upsert({
      where: { slug: 'default' },
      create: {
        slug: 'default',
        connectHost: host,
        encryptedToken: enc.ciphertext,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        defaultVaultId,
        lastTestedAt: now,
        lastTestStatus: 'ok',
        lastTestMessage: result.message,
      },
      update: {
        connectHost: host,
        encryptedToken: enc.ciphertext,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        defaultVaultId,
        lastTestedAt: now,
        lastTestStatus: 'ok',
        lastTestMessage: result.message,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'onepassword_connection',
        op: 'upsert',
        connectHost: host,
        vaultCount: result.vaultCount,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: redact(upserted) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }
    await prisma.onePasswordConnection.deleteMany({ where: { slug: 'default' } });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'onepassword_connection', op: 'delete' },
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
