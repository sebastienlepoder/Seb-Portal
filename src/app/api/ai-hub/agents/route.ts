import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { toAgentSummary } from '@/lib/agents';

// GET /api/ai-hub/agents — list active agents (for the dashboard, any authed user)
export async function GET() {
  try {
    await requireApiAuth();
    const agents = await prisma.agentProfile.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Annotate each with current workload (count of in-flight tasks)
    const summaries = await Promise.all(
      agents.map(async (a) => {
        const inFlight = await prisma.task.count({
          where: {
            agentProfileId: a.id,
            status: { in: ['pending', 'queued', 'in_progress'] },
          },
        });
        return { ...toAgentSummary(a), description: a.description, inFlightTaskCount: inFlight };
      })
    );
    return NextResponse.json({ ok: true, data: summaries });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai-hub/agents] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
