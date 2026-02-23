import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { z } from 'zod';

const serviceImportSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  type: z.string().default('external'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().default('Uncategorized'),
  section: z.string().default('General'),
  openMode: z.string().default('new_tab'),
  requiresVPN: z.boolean().default(false),
});

const importSchema = z.object({
  services: z.array(serviceImportSchema),
  dryRun: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { services, dryRun } = parsed.data;

    // Preview/dry-run
    const preview = {
      total: services.length,
      toCreate: 0,
      toUpdate: 0,
      items: [] as { slug: string; action: 'create' | 'update' }[],
    };

    for (const svc of services) {
      const existing = await prisma.service.findUnique({ where: { slug: svc.slug } });
      if (existing) {
        preview.toUpdate++;
        preview.items.push({ slug: svc.slug, action: 'update' });
      } else {
        preview.toCreate++;
        preview.items.push({ slug: svc.slug, action: 'create' });
      }
    }

    if (dryRun) {
      return NextResponse.json({ ok: true, data: { dryRun: true, preview } });
    }

    // Actually import
    for (const svc of services) {
      const data = {
        slug: svc.slug,
        name: svc.name,
        url: svc.url,
        type: svc.type,
        description: svc.description || null,
        tags: svc.tags ? JSON.stringify(svc.tags) : null,
        category: svc.category,
        section: svc.section,
        openMode: svc.openMode,
        requiresVPN: svc.requiresVPN,
      };

      await prisma.service.upsert({
        where: { slug: svc.slug },
        create: data,
        update: data,
      });
    }

    await auditLog({
      userId: user.id,
      action: 'backup_import',
      details: { ...preview },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: { imported: true, preview } });
  } catch (e) {
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
