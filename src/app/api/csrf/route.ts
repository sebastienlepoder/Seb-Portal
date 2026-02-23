import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { ensureCsrfToken } from '@/lib/csrf';

export async function GET() {
  try {
    await requireApiAuth();
    const token = await ensureCsrfToken();
    return NextResponse.json({ ok: true, data: { csrfToken: token } });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
