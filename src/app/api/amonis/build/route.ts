import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// POST /api/amonis/build - Trigger a TestFlight build
export async function POST() {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  // Get approved tasks that haven't been included in a build
  const approvedTasks = await prisma.amonisTask.findMany({
    where: { status: 'approved', buildNumber: null },
  });

  if (approvedTasks.length === 0) {
    return NextResponse.json({ ok: false, error: 'No approved tasks to build' }, { status: 400 });
  }

  // Get the next build number
  const lastBuild = await prisma.amonisBuild.findFirst({
    orderBy: { buildNumber: 'desc' },
  });
  const nextBuildNumber = (lastBuild?.buildNumber || 28) + 1;

  // Create build record
  const build = await prisma.amonisBuild.create({
    data: {
      buildNumber: nextBuildNumber,
      version: '1.0',
      status: 'pending',
      taskIds: JSON.stringify(approvedTasks.map(t => t.id)),
    },
  });

  // Mark tasks as included in this build
  await prisma.amonisTask.updateMany({
    where: { id: { in: approvedTasks.map(t => t.id) } },
    data: { buildNumber: nextBuildNumber, status: 'done' },
  });

  return NextResponse.json({
    ok: true,
    data: {
      build,
      message: `Build #${nextBuildNumber} created with ${approvedTasks.length} tasks. Trigger the build on Mac Mini.`,
      taskCount: approvedTasks.length,
    },
  });
}
