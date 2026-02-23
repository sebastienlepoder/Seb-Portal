import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { generateIconViaApi } from '@/server/iconProviders/cloudApiProvider';
import { generateAndSaveFallback } from '@/server/iconProviders/fallbackProvider';

export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }

    const { serviceId } = (await request.json()) as { serviceId: string };
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return NextResponse.json({ ok: false, error: 'Service not found' }, { status: 404 });
    }

    // Try cloud API first
    let iconUrl: string | null = null;
    const domain = new URL(service.url).hostname;

    const cloudResult = await generateIconViaApi({
      name: service.name,
      description: service.description || undefined,
      domain,
    });

    if (cloudResult.success && cloudResult.url) {
      iconUrl = cloudResult.url;
    } else {
      // Fallback to local SVG
      iconUrl = await generateAndSaveFallback(
        service.slug,
        service.name,
        service.description || undefined
      );
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { icon: iconUrl, iconGenerated: true },
    });

    await auditLog({
      userId: user.id,
      action: 'icon_regenerate',
      details: { serviceId, provider: cloudResult.success ? 'cloud_api' : 'fallback' },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: { iconUrl } });
  } catch (e) {
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
