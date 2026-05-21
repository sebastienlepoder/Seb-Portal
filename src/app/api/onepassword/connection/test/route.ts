import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { getConnection, testConnection } from '@/lib/onepassword';

export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }

    const conn = await getConnection();
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: 'No connection configured' },
        { status: 400 }
      );
    }

    const token = decryptSecret({
      ciphertext: conn.encryptedToken,
      iv: conn.tokenIv,
      tag: conn.tokenTag,
    });

    const result = await testConnection(conn.connectHost, token);
    const now = new Date();
    await prisma.onePasswordConnection.update({
      where: { slug: 'default' },
      data: {
        lastTestedAt: now,
        lastTestStatus: result.ok ? 'ok' : 'failed',
        lastTestMessage: result.message,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: {
        resource: 'onepassword_connection',
        op: 'test',
        ok: result.ok,
        vaultCount: result.vaultCount,
      },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({
      ok: true,
      data: {
        ok: result.ok,
        message: result.message,
        vaultCount: result.vaultCount,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}
