import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/amonis/builds - List all builds
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const builds = await prisma.amonisBuild.findMany({
    orderBy: { buildNumber: 'desc' },
    take: 20,
  });

  return NextResponse.json({ ok: true, data: builds });
}
