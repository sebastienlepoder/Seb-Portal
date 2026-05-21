import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { getConnection, listItems } from '@/lib/onepassword';

export async function GET(
  _request: Request,
  { params }: { params: { vaultId: string } }
) {
  try {
    await requireApiAdmin();
    const conn = await getConnection();
    if (!conn) {
      return NextResponse.json(
        { ok: false, error: 'No 1Password connection configured' },
        { status: 400 }
      );
    }
    const data = await listItems(params.vaultId);
    return NextResponse.json({ ok: true, data });
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
  return NextResponse.json({ ok: false, error: msg || 'Internal error' }, { status: 500 });
}
