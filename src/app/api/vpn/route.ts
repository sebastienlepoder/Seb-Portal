import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getVpnStatus, setManualVpnStatus } from '@/server/vpnChecker';

export async function GET() {
  try {
    await requireApiAuth();
    const status = await getVpnStatus();
    return NextResponse.json({ ok: true, data: status });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: force refresh or set manual status
export async function POST(request: Request) {
  try {
    await requireApiAuth();
    const body = await request.json().catch(() => ({}));

    if (body.manual !== undefined) {
      setManualVpnStatus(!!body.manual);
    }

    const status = await getVpnStatus(true);
    return NextResponse.json({ ok: true, data: status });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
