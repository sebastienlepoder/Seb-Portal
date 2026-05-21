import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { listItems } from '@/lib/onepassword';

export async function GET(
  _request: Request,
  { params }: { params: { vaultId: string } }
) {
  try {
    await requireApiAdmin();
    const items = await listItems(params.vaultId);
    return NextResponse.json({ ok: true, data: items });
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
  return NextResponse.json({ ok: false, error: msg || 'Server error' }, { status: 502 });
}
