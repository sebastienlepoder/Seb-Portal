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
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }

    const conn = await getConnection();
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: '1Password Connect is not configured' },
        { status: 404 }
      );
    }

    const token = decryptSecret({
      ciphertext: conn.encryptedToken,
      iv: conn.tokenIv,
      tag: conn.tokenTag,
    });
    const result = await testConnection(conn.connectHost, token);

    const updated = await prisma.onePasswordConnection.update({
      where: { slug: 'default' },
      data: {
        lastTestedAt: new Date(),
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
        lastTestedAt: updated.lastTestedAt,
        lastTestStatus: updated.lastTestStatus,
      },
    });
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
  console.error('[onepassword/connection/test] error:', msg);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
