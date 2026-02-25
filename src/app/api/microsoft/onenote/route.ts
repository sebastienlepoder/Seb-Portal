import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getMicrosoftToken } from '@/lib/microsoft-auth';
import { getNotebooks, getSections, getPages, getPageContent, createPage } from '@/lib/microsoft';

// GET /api/microsoft/onenote - Get notebooks, sections, or pages
export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const token = await getMicrosoftToken(user.id);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft account not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'notebooks';
    const notebookId = url.searchParams.get('notebookId');
    const sectionId = url.searchParams.get('sectionId');
    const pageId = url.searchParams.get('pageId');

    let data;

    switch (type) {
      case 'notebooks':
        data = await getNotebooks(token);
        break;

      case 'sections':
        if (!notebookId) {
          return NextResponse.json({ ok: false, error: 'notebookId required' }, { status: 400 });
        }
        data = await getSections(token, notebookId);
        break;

      case 'pages':
        if (!sectionId) {
          return NextResponse.json({ ok: false, error: 'sectionId required' }, { status: 400 });
        }
        data = await getPages(token, sectionId);
        break;

      case 'content':
        if (!pageId) {
          return NextResponse.json({ ok: false, error: 'pageId required' }, { status: 400 });
        }
        const content = await getPageContent(token, pageId);
        return NextResponse.json({ ok: true, data: { content } });

      default:
        return NextResponse.json({ ok: false, error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error('OneNote API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST /api/microsoft/onenote - Create a new page
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
    const token = await getMicrosoftToken(user.id);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Microsoft account not connected', needsAuth: true },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sectionId, title, content } = body;

    if (!sectionId || !title) {
      return NextResponse.json(
        { ok: false, error: 'sectionId and title required' },
        { status: 400 }
      );
    }

    const page = await createPage(token, sectionId, title, content || '');

    return NextResponse.json({ ok: true, data: page });
  } catch (error) {
    console.error('OneNote create error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
