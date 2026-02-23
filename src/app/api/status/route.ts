import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { checkAllStatuses } from '@/server/statusChecker';
import { getVpnStatus } from '@/server/vpnChecker';

export async function GET() {
  try {
    await requireApiAuth();
    const vpn = await getVpnStatus();
    const statuses = await checkAllStatuses(vpn.connected);

    return NextResponse.json({
      ok: true,
      data: { vpn, statuses },
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
