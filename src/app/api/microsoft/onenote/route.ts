import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

/**
 * OneNote integration scaffold — list notebooks/sections/pages
 * Requires Microsoft Graph delegated auth
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }

    const accessToken = session.msftAccessToken;
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft account not connected. Go to Settings to connect.' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'notebooks';

    let graphUrl: string;
    switch (type) {
      case 'sections':
        graphUrl = 'https://graph.microsoft.com/v1.0/me/onenote/sections';
        break;
      case 'pages': {
        const sectionId = url.searchParams.get('sectionId');
        graphUrl = sectionId
          ? `https://graph.microsoft.com/v1.0/me/onenote/sections/${sectionId}/pages`
          : 'https://graph.microsoft.com/v1.0/me/onenote/pages?$top=20&$orderby=lastModifiedDateTime desc';
        break;
      }
      default:
        graphUrl = 'https://graph.microsoft.com/v1.0/me/onenote/notebooks';
    }

    const res = await fetch(graphUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401) {
      return NextResponse.json(
        { ok: false, error: 'Token expired. Reconnect Microsoft account.' },
        { status: 401 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Graph API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, data: data.value || data });
  } catch {
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
