import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getMicrosoftAccountInfo, disconnectMicrosoftAccount } from '@/lib/microsoft-auth';

// GET /api/microsoft/status - Check if Microsoft is connected
export async function GET() {
  try {
    const user = await requireApiAuth();
    const status = await getMicrosoftAccountInfo(user.id);
    return NextResponse.json({ ok: true, data: status });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

// DELETE /api/microsoft/status - Disconnect Microsoft account
export async function DELETE() {
  try {
    const user = await requireApiAuth();
    await disconnectMicrosoftAccount(user.id);
    return NextResponse.json({ ok: true, message: 'Microsoft account disconnected' });
  } catch (error) {
    if ((error as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
