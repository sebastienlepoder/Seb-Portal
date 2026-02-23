import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    const userId = session.user?.id;

    if (userId) {
      await auditLog({
        userId,
        action: 'logout',
        ipAddress: getClientIp(request),
      });
    }

    session.destroy();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Logout failed' }, { status: 500 });
  }
}
