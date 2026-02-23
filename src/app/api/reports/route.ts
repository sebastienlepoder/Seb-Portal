import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';

export async function GET(request: Request) {
  try {
    const user = await requireApiAuth();
    const url = new URL(request.url);
    const period = url.searchParams.get('period') || 'week';
    const format = url.searchParams.get('format') || 'json';

    const now = new Date();
    let since: Date;
    switch (period) {
      case 'day':
        since = new Date(now.getTime() - 86400000);
        break;
      case 'month':
        since = new Date(now.getTime() - 30 * 86400000);
        break;
      default:
        since = new Date(now.getTime() - 7 * 86400000);
    }

    // Most visited services
    const clicks = await prisma.clickEvent.groupBy({
      by: ['serviceId'],
      where: { createdAt: { gte: since }, ...(user.role !== 'admin' ? { userId: user.id } : {}) },
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 20,
    });

    const serviceIds = clicks.map((c) => c.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    });
    const svcMap = new Map(services.map((s) => [s.id, s.name]));

    const mostVisited = clicks.map((c) => ({
      serviceId: c.serviceId,
      name: svcMap.get(c.serviceId) || 'Unknown',
      count: c._count.serviceId,
    }));

    // Favorites usage
    const favCounts = await prisma.favorite.groupBy({
      by: ['serviceId'],
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: 'desc' } },
      take: 20,
    });
    const favServiceIds = favCounts.map((f) => f.serviceId);
    const favServices = await prisma.service.findMany({
      where: { id: { in: favServiceIds } },
      select: { id: true, name: true },
    });
    const favMap = new Map(favServices.map((s) => [s.id, s.name]));
    const favoritesUsage = favCounts.map((f) => ({
      serviceId: f.serviceId,
      name: favMap.get(f.serviceId) || 'Unknown',
      count: f._count.serviceId,
    }));

    // Login activity
    const logins = await prisma.auditLog.findMany({
      where: {
        action: { in: ['login_success', 'login_fail'] },
        createdAt: { gte: since },
      },
      select: { action: true, createdAt: true },
    });

    const loginByDate: Record<string, { success: number; fail: number }> = {};
    for (const log of logins) {
      const date = log.createdAt.toISOString().split('T')[0]!;
      if (!loginByDate[date]) loginByDate[date] = { success: 0, fail: 0 };
      if (log.action === 'login_success') loginByDate[date].success++;
      else loginByDate[date].fail++;
    }
    const loginActivity = Object.entries(loginByDate).map(([date, counts]) => ({
      date,
      ...counts,
    }));

    // Urgent interactions
    const urgentInteractions = await prisma.urgentItem.count({
      where: { done: true, updatedAt: { gte: since } },
    });

    const reportData = {
      period,
      since: since.toISOString(),
      mostVisited,
      favoritesUsage,
      loginActivity,
      urgentInteractions,
    };

    if (format === 'csv') {
      const lines = ['Service,Visits'];
      for (const mv of mostVisited) {
        lines.push(`"${mv.name}",${mv.count}`);
      }
      return new Response(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="report-${period}.csv"`,
        },
      });
    }

    return NextResponse.json({ ok: true, data: reportData });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
