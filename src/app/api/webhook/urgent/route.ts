import { NextResponse } from 'next/server';
import { checkRateLimit, webhookLimiter } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/audit';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';
import type { UrgentItemPayload } from '@/types';

/**
 * Webhook endpoint for n8n (or other sources) to push urgent inbox items.
 * Auth: Bearer token from WEBHOOK_AUTH_TOKEN env.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Rate limit
  const check = checkRateLimit(webhookLimiter, ip);
  if (!check.allowed) {
    return NextResponse.json({ ok: false, error: 'Rate limited' }, { status: 429 });
  }

  // Auth check
  const authToken = process.env.WEBHOOK_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json(
      { ok: false, error: 'Webhook not configured' },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${authToken}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as UrgentItemPayload | UrgentItemPayload[];
    const items = Array.isArray(body) ? body : [body];

    const created = [];
    for (const item of items) {
      if (!item.title) continue;
      const record = await prisma.urgentItem.create({
        data: {
          source: item.source || 'n8n',
          priority: item.priority || 'normal',
          title: item.title,
          snippet: item.snippet || null,
          actionUrl: item.actionUrl || null,
        },
      });
      created.push(record);
    }

    return NextResponse.json(
      { ok: true, data: { created: created.length } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }
}

// GET: list urgent items (authenticated users)
export async function GET(request: Request) {
  // Quick auth check via cookie for dashboard
  const { getApiUser } = await import('@/lib/auth');
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const showDone = url.searchParams.get('done') === 'true';

  const items = await prisma.urgentItem.findMany({
    where: { done: showDone },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  });

  return NextResponse.json({ ok: true, data: items });
}

// PATCH: mark item done
export async function PATCH(request: Request) {
  const { requireApiAuth } = await import('@/lib/auth');
  try {
    const user = await requireApiAuth();

    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF' }, { status: 403 });
    }

    const { id, done } = (await request.json()) as { id: string; done: boolean };

    // Ownership: items with a userId may only be mutated by their owner.
    // Shared items (userId=null, e.g. n8n webhook ingest) remain mutable by any user.
    const item = await prisma.urgentItem.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!item) {
      return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    }
    if (item.userId && item.userId !== user.id) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    await prisma.urgentItem.update({
      where: { id },
      data: { done },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
