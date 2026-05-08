import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { toProjectSummary } from '@/lib/agents';

// GET /api/ai-hub/projects — list projects available for dispatch (any authed user)
export async function GET() {
  try {
    await requireApiAuth();
    const projects = await prisma.project.findMany({
      where: { status: { in: ['active', 'paused'] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ ok: true, data: projects.map(toProjectSummary) });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai-hub/projects] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
