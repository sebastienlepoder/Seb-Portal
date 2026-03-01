import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { generateIconViaApi } from '@/server/iconProviders/cloudApiProvider';
import { generateIconWithAI } from '@/server/iconProviders/aiIconProvider';
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

    // Extract domain (safe parse — some services may have invalid URLs)
    let domain: string | undefined;
    try { domain = new URL(service.url).hostname; } catch { /* keep undefined */ }

    let iconUrl: string | null = null;
    let provider: string = 'fallback';

    // Step 1: Try brand icon first (Google Favicon → DuckDuckGo)
    const brandResult = await generateIconViaApi({
      name: service.name,
      slug: service.slug,
      description: service.description || undefined,
      domain,
    });

    if (brandResult.success && brandResult.url) {
      iconUrl = brandResult.url;
      provider = brandResult.provider || 'brand';
    } else {
      // Step 2: Try AI-generated icon using Claude
      console.log(`[icon] Trying AI generation for ${service.name}...`);
      const aiResult = await generateIconWithAI({
        name: service.name,
        slug: service.slug,
        description: service.description || undefined,
        category: service.category || undefined,
      });

      if (aiResult.success && aiResult.url) {
        iconUrl = aiResult.url;
        provider = 'ai-claude';
        console.log(`[icon] AI generated icon for ${service.name}`);
      } else {
        // Step 3: Final fallback - deterministic SVG with initials
        console.log(`[icon] Using fallback for ${service.name}: ${aiResult.error}`);
        iconUrl = await generateAndSaveFallback(
          service.slug,
          service.name,
          service.description || undefined
        );
        provider = 'fallback';
      }
    }

    await prisma.service.update({
      where: { id: serviceId },
      data: { icon: iconUrl, iconGenerated: true },
    });

    await auditLog({
      userId: user.id,
      action: 'icon_regenerate',
      details: { serviceId, provider, domain },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: { iconUrl, provider } });
  } catch (e) {
    console.error('[icon] Regenerate error:', e);
    if ((e as Error).message === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
