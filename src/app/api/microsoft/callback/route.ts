import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * Microsoft OAuth callback — exchange code for tokens
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/settings?msft_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(new URL('/settings?msft_error=no_code', request.url));
    }

    const clientId = process.env.MSFT_CLIENT_ID!;
    const clientSecret = process.env.MSFT_CLIENT_SECRET!;
    const tenant = process.env.MSFT_TENANT || 'common';
    const redirectUri = process.env.MSFT_REDIRECT_URI!;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid profile User.Read Notes.Read Notes.Read.All',
        }),
      }
    );

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        new URL('/settings?msft_error=token_exchange_failed', request.url)
      );
    }

    const tokens = await tokenRes.json();

    // Store tokens securely in session (not in DB for delegated flow)
    // In production, encrypt tokens at rest
    (session as Record<string, unknown>).msftAccessToken = tokens.access_token;
    (session as Record<string, unknown>).msftRefreshToken = tokens.refresh_token;
    await session.save();

    return NextResponse.redirect(new URL('/settings?msft_connected=true', request.url));
  } catch {
    return NextResponse.redirect(
      new URL('/settings?msft_error=server_error', request.url)
    );
  }
}
