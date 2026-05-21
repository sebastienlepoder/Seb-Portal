import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { getConnection, getItem } from '@/lib/onepassword';

export async function GET(
  _request: Request,
  { params }: { params: { vaultId: string; itemId: string } }
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
    const item = await getItem(params.vaultId, params.itemId);
    const fieldLabels = item.fields
      .map((f) => f.label)
      .filter((l): l is string => typeof l === 'string' && l.length > 0);
    return NextResponse.json({
      ok: true,
      data: { id: item.id, title: item.title, fieldLabels },
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
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: false, error: msg || 'Internal error' }, { status: 500 });
}
