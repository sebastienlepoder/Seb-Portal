import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { exchangeCodeForTokens, getMicrosoftUser } from '@/lib/microsoft';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    if (error) {
      console.error('Microsoft OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${baseUrl}/dashboard?error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(`${baseUrl}/dashboard?error=No authorization code`);
    }

    const session = await getSession();

    if (!session.user) {
      return NextResponse.redirect(`${baseUrl}/login`);
    }

    // Verify state
    if (state !== session.microsoftState) {
      return NextResponse.redirect(`${baseUrl}/dashboard?error=Invalid state`);
    }

    // Clear state
    session.microsoftState = undefined;
    await session.save();

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get Microsoft user info
    const msUser = await getMicrosoftUser(tokens.access_token);

    // Calculate expiration
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Store or update Microsoft account
    await prisma.microsoftAccount.upsert({
      where: { userId: session.user.id },
      update: {
        msUserId: msUser.id,
        email: msUser.mail || msUser.userPrincipalName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
      },
      create: {
        userId: session.user.id,
        msUserId: msUser.id,
        email: msUser.mail || msUser.userPrincipalName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
      },
    });

    return NextResponse.redirect(`${baseUrl}/dashboard?microsoft=connected`);
  } catch (error) {
    console.error('Microsoft callback error:', error);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${baseUrl}/dashboard?error=${encodeURIComponent((error as Error).message)}`
    );
  }
}
