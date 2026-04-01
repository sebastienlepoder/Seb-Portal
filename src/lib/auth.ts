import { getIronSession, type IronSession } from 'iron-session';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionData, SessionUser } from '@/types';

// API token for the Amonis worker (service account)
const AMONIS_API_TOKEN = process.env.AMONIS_API_TOKEN || 'amonis-claw-2026';

const SESSION_OPTIONS = {
  password: process.env.AUTH_SECRET || 'CHANGE_ME_GENERATE_A_RANDOM_64_CHAR_HEX_STRING_AT_LEAST_32',
  cookieName: 'lepoder_session',
  cookieOptions: {
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session.user ?? null;
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== 'admin') {
    redirect('/dashboard');
  }
  return user;
}

export function getSessionFromReq(req: Request) {
  // For API routes that receive Request objects
  return getIronSession<SessionData>(
    // @ts-expect-error — iron-session accepts Response-like
    { getAll: () => parseCookieHeader(req.headers.get('cookie') || '') },
    SESSION_OPTIONS
  );
}

function parseCookieHeader(header: string): { name: string; value: string }[] {
  return header.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name || '', value: rest.join('=') || '' };
  });
}

// Convenience: get session from cookies in API route handlers (App Router)
export async function getApiSession(): Promise<IronSession<SessionData>> {
  return getSession();
}

export async function getApiUser(): Promise<SessionUser | null> {
  // Check for Bearer token first (for worker/API access)
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token === AMONIS_API_TOKEN) {
      // Return a service account user for API token auth
      return {
        id: 'amonis-worker',
        email: 'worker@amonis.local',
        name: 'Amonis Worker',
        role: 'admin',
      };
    }
  }
  
  // Fall back to session auth
  const session = await getSession();
  return session.user ?? null;
}

export async function requireApiAuth(): Promise<SessionUser> {
  const user = await getApiUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiAuth();
  if (user.role !== 'admin') {
    throw new Error('FORBIDDEN');
  }
  return user;
}
