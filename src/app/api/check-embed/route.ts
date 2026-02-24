import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';

/**
 * GET /api/check-embed?url=<encoded_url>
 *
 * Makes a HEAD request to the target URL from the server and inspects
 * X-Frame-Options / CSP frame-ancestors headers to determine whether
 * the page can be safely embedded in an iframe.
 *
 * Returns:
 *   { canEmbed: true }                      — no blocking headers found
 *   { canEmbed: false, reason: string }     — explicitly blocked
 *   { canEmbed: null,  reason: string }     — couldn't determine (network error)
 */
export async function GET(request: Request) {
  try {
    await requireApiAuth();
  } catch {
    return NextResponse.json({ canEmbed: null, reason: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) {
    return NextResponse.json({ canEmbed: null, reason: 'No URL provided' });
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LePoder-Portal/1.0)' },
      redirect: 'follow',
    });

    const xfo = (res.headers.get('x-frame-options') ?? '').trim().toUpperCase();
    const csp = res.headers.get('content-security-policy') ?? '';

    // X-Frame-Options: DENY or SAMEORIGIN → blocked cross-origin
    if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
      return NextResponse.json({ canEmbed: false, reason: `X-Frame-Options: ${xfo}` });
    }

    // CSP frame-ancestors: 'none' or 'self' → blocked cross-origin
    const faMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (faMatch) {
      const val = faMatch[1].trim();
      if (/'none'|"none"/.test(val)) {
        return NextResponse.json({ canEmbed: false, reason: "CSP frame-ancestors: 'none'" });
      }
      // 'self' only → blocked unless portal shares the same origin
      if (/^['"]?self['"]?$/.test(val)) {
        return NextResponse.json({ canEmbed: false, reason: "CSP frame-ancestors: 'self'" });
      }
    }

    return NextResponse.json({ canEmbed: true });
  } catch (e) {
    // Network error, DNS failure, timeout — we can't determine embeddability
    return NextResponse.json({
      canEmbed: null,
      reason: `Cannot reach: ${(e as Error).message}`,
    });
  }
}
