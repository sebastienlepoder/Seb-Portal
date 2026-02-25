import prisma from '@/lib/db';
import { refreshAccessToken } from '@/lib/microsoft';

/**
 * Get a valid Microsoft access token for a user.
 * Automatically refreshes if expired.
 */
export async function getMicrosoftToken(userId: string): Promise<string | null> {
  const account = await prisma.microsoftAccount.findUnique({
    where: { userId },
  });

  if (!account) {
    return null;
  }

  // Check if token is expired (with 5 min buffer)
  const now = new Date();
  const expiresAt = new Date(account.expiresAt);
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    // Token is still valid
    return account.accessToken;
  }

  // Token expired, refresh it
  try {
    const tokens = await refreshAccessToken(account.refreshToken);
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.microsoftAccount.update({
      where: { userId },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: newExpiresAt,
        scope: tokens.scope,
      },
    });

    return tokens.access_token;
  } catch (error) {
    console.error('Failed to refresh Microsoft token:', error);
    // Token refresh failed, user needs to re-authenticate
    await prisma.microsoftAccount.delete({ where: { userId } });
    return null;
  }
}

/**
 * Check if a user has connected their Microsoft account
 */
export async function hasMicrosoftAccount(userId: string): Promise<boolean> {
  const count = await prisma.microsoftAccount.count({
    where: { userId },
  });
  return count > 0;
}

/**
 * Get Microsoft account info for a user
 */
export async function getMicrosoftAccountInfo(userId: string): Promise<{
  connected: boolean;
  email?: string;
} | null> {
  const account = await prisma.microsoftAccount.findUnique({
    where: { userId },
    select: { email: true },
  });

  if (!account) {
    return { connected: false };
  }

  return {
    connected: true,
    email: account.email,
  };
}

/**
 * Disconnect Microsoft account
 */
export async function disconnectMicrosoftAccount(userId: string): Promise<void> {
  await prisma.microsoftAccount.deleteMany({
    where: { userId },
  });
}
