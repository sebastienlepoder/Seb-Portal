import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';

// GET: export config + data
export async function GET(request: Request) {
  try {
    const user = await requireApiAdmin();

    const format = new URL(request.url).searchParams.get('format') || 'json';

    const services = await prisma.service.findMany({ orderBy: { section: 'asc' } });
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, displayName: true, createdAt: true },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      services: services.map((s) => ({
        ...s,
        tags: s.tags ? JSON.parse(s.tags) : [],
      })),
      userCount: users.length,
      users: user.role === 'admin' ? users : undefined,
    };

    await auditLog({
      userId: user.id,
      action: 'backup_export',
      details: { format, serviceCount: services.length },
      ipAddress: getClientIp(request),
    });

    if (format === 'yaml') {
      const yaml = (await import('js-yaml')).default;
      const yamlStr = yaml.dump(exportData, { indent: 2 });
      return new Response(yamlStr, {
        headers: {
          'Content-Type': 'text/yaml',
          'Content-Disposition': `attachment; filename="lepoder-backup-${Date.now()}.yaml"`,
        },
      });
    }

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="lepoder-backup-${Date.now()}.json"`,
      },
    });
  } catch (e) {
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
