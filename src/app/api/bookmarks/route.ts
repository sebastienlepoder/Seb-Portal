import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';

// GET: list bookmarks
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const url = new URL(request.url);
    const search = url.searchParams.get('q');

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId: user.id,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { url: { contains: search } },
                { tags: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      ok: true,
      data: bookmarks.map((b) => ({ ...b, tags: b.tags ? JSON.parse(b.tags) : [] })),
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: import bookmarks (HTML or JSON)
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    let bookmarks: { title: string; url: string; folder?: string }[] = [];

    if (contentType.includes('text/html') || contentType.includes('multipart/form-data')) {
      // Parse Chrome bookmarks HTML export
      const text = await request.text();
      const linkRegex = /<A HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        bookmarks.push({ title: match[2]!, url: match[1]! });
      }
    } else {
      // JSON format: array of { title, url, folder? }
      const body = await request.json();
      bookmarks = Array.isArray(body) ? body : body.bookmarks || [];
    }

    let imported = 0;
    for (const bm of bookmarks) {
      if (!bm.url || !bm.title) continue;
      try {
        await prisma.bookmark.create({
          data: {
            userId: user.id,
            title: bm.title,
            url: bm.url,
            folder: bm.folder || null,
          },
        });
        imported++;
      } catch {
        // Skip duplicates or invalid
      }
    }

    return NextResponse.json({ ok: true, data: { imported, total: bookmarks.length } });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
