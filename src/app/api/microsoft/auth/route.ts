import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';

/**
 * Microsoft Graph OAuth — delegated auth flow (step 1: redirect)
 * Setup: register app at portal.azure.com, configure redirect URI
 */
export async function GET() {
  try {
    await requireApiAuth();

    const clientId = process.env.MSFT_CLIENT_ID;
    const tenant = process.env.MSFT_TENANT || 'common';
    const redirectUri = process.env.MSFT_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft Graph not configured' },
        { status: 503 }
      );
    }

    const scopes = [
      'openid',
      'profile',
      'User.Read',
      'Notes.Read',
      'Notes.Read.All',
    ].join(' ');

    const authUrl =
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&response_mode=query`;

    return NextResponse.json({ ok: true, data: { authUrl } });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
