import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/amonis/tasks/pending - Get pending tasks (service endpoint)
// Secured by AMONIS_SERVICE_TOKEN instead of user session
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const serviceToken = process.env.AMONIS_SERVICE_TOKEN;
  
  // Allow if service token matches OR if no token is configured (dev mode)
  if (serviceToken && authHeader !== `Bearer ${serviceToken}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Get tasks that are assigned but not yet in progress
  const tasks = await prisma.amonisTask.findMany({
    where: {
      status: { in: ['assigned', 'pending'] },
      agentId: { not: null },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { agent: true },
  });

  return NextResponse.json({ ok: true, data: tasks });
}
