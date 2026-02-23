import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// GET: generate a new TOTP secret + QR code
export async function GET() {
  try {
    const user = await requireApiAuth();
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'LEPODER Portal', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    return NextResponse.json({
      ok: true,
      data: { secret, otpauth, qrDataUrl },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: enable TOTP with verification code
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const { secret, code } = (await request.json()) as { secret: string; code: string };

    if (!secret || !code) {
      return NextResponse.json({ ok: false, error: 'Secret and code required' }, { status: 400 });
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      return NextResponse.json({ ok: false, error: 'Invalid verification code' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, totpEnabled: true },
    });

    await auditLog({
      userId: user.id,
      action: 'totp_enable',
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, message: 'TOTP enabled successfully' });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// DELETE: disable TOTP
export async function DELETE(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabled: false },
    });

    await auditLog({
      userId: user.id,
      action: 'totp_disable',
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, message: 'TOTP disabled' });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
