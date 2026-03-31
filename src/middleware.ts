import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protect all routes except login, API auth, and static assets
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/webhook/urgent', '/api/todos/seed', '/api/todos/debug', '/api/icons/serve', '/api/debug', '/api/amonis/tasks/pending', '/api/amonis/tasks/update', '/api/amonis/tasks/trigger', '/_next', '/favicon.ico'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Docker healthcheck without authentication
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.startsWith('/_next/') || pathname.match(/\.(ico|svg|png|jpg|css|js)$/)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get('lepoder_session');
  if (!sessionCookie) {
    // API routes return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
};
