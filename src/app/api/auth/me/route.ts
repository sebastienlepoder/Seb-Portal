import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth';
import { ensureCsrfToken } from '@/lib/csrf';

export async function GET() {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const csrfToken = await ensureCsrfToken();

  return NextResponse.json({
    ok: true,
    data: { ...user, csrfToken },
  });
}
