import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getSession } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit, loginIpLimiter, loginAccountLimiter } from '@/lib/rate-limit';
import { auditLog, getClientIp } from '@/lib/audit';
import { authenticator } from 'otplib';

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const ua = request.headers.get('user-agent') || '';

    // Rate limit by IP
    const ipCheck = checkRateLimit(loginIpLimiter, ip);
    if (!ipCheck.allowed) {
      await auditLog({ action: 'login_rate_limited', details: { ip }, ipAddress: ip });
      return NextResponse.json(
        { ok: false, error: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(ipCheck.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const { email, password, totpCode } = body as {
      email?: string;
      password?: string;
      totpCode?: string;
    };

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'Email and password required' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    // Rate limit by account
    const accountCheck = checkRateLimit(loginAccountLimiter, emailLower);
    if (!accountCheck.allowed) {
      await auditLog({
        action: 'login_rate_limited',
        details: { email: emailLower },
        ipAddress: ip,
      });
      return NextResponse.json(
        { ok: false, error: 'Account temporarily locked. Try again later.' },
        { status: 429 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({ where: { email: emailLower } });
    if (!user) {
      await auditLog({
        action: 'login_fail',
        details: { email: emailLower, reason: 'user_not_found' },
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await auditLog({
        userId: user.id,
        action: 'login_fail',
        details: { reason: 'wrong_password' },
        ipAddress: ip,
        userAgent: ua,
      });
      return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // TOTP check if enabled
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return NextResponse.json(
          { ok: false, error: 'TOTP code required', requireTotp: true },
          { status: 401 }
        );
      }
      const totpValid = authenticator.verify({ token: totpCode, secret: user.totpSecret });
      if (!totpValid) {
        await auditLog({
          userId: user.id,
          action: 'login_fail',
          details: { reason: 'invalid_totp' },
          ipAddress: ip,
          userAgent: ua,
        });
        return NextResponse.json({ ok: false, error: 'Invalid TOTP code' }, { status: 401 });
      }
    }

    // Create session
    const session = await getSession();
    session.user = {
      id: user.id,
      email: user.email,
      role: user.role as 'admin' | 'user',
      displayName: user.displayName || undefined,
    };
    await session.save();

    await auditLog({
      userId: user.id,
      action: 'login_success',
      ipAddress: ip,
      userAgent: ua,
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (e) {
    console.error('Login error:', e);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
