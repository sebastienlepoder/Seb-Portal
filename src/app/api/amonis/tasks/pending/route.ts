import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Force dynamic - don't pre-render at build time
export const dynamic = 'force-dynamic';

// GET /api/amonis/tasks/pending - Get pending tasks (service endpoint)
// Public endpoint for agent polling
export async function GET() {

  // Get tasks that need work (including in_progress that may have stalled)
  const tasks = await prisma.amonisTask.findMany({
    where: {
      status: { in: ['assigned', 'pending', 'in_progress'] },
      agentId: { not: null },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { agent: true },
  });

  return NextResponse.json({ ok: true, data: tasks });
}
