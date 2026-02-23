import { NextResponse } from 'next/server';
import { requireApiAuth, requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import prisma from '@/lib/db';
import { z } from 'zod';

const serviceSchema = z.object({
  slug: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  url: z.string().url(),
  type: z.enum(['internal', 'external', 'github', 'email', 'remote', 'bookmark', 'tool', 'ai']).default('external'),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().default('Uncategorized'),
  section: z.string().default('General'),
  openMode: z.enum(['new_tab', 'iframe', 'modal', 'sidepanel']).default('new_tab'),
  requiresVPN: z.boolean().default(false),
  statusCheckUrl: z.string().url().optional().or(z.literal('')),
  favoriteDefault: z.boolean().default(false),
  icon: z.string().optional(),
  credentialsHint: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

// GET: list all services (authenticated)
export async function GET() {
  try {
    await requireApiAuth();
    const services = await prisma.service.findMany({
      where: { enabled: true },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const formatted = services.map((s) => ({
      ...s,
      tags: s.tags ? JSON.parse(s.tags) : [],
    }));

    return NextResponse.json({ ok: true, data: formatted });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST: create a new service (admin-only)
export async function POST(request: Request) {
  try {
    await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const service = await prisma.service.create({
      data: {
        slug: data.slug,
        name: data.name,
        url: data.url,
        type: data.type,
        description: data.description || null,
        tags: data.tags ? JSON.stringify(data.tags) : null,
        category: data.category,
        section: data.section,
        openMode: data.openMode,
        requiresVPN: data.requiresVPN,
        statusCheckUrl: data.statusCheckUrl || null,
        favoriteDefault: data.favoriteDefault,
        icon: data.icon || null,
        credentialsHint: data.credentialsHint || null,
        sortOrder: data.sortOrder,
        enabled: data.enabled,
      },
    });

    return NextResponse.json({ ok: true, data: service }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
