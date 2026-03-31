import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// POST /api/amonis/build - Trigger a TestFlight build
export async function POST(request: Request) {
  const user = await requireAuth(request);
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

  // TODO: Actually trigger the build via OpenClaw webhook or direct command
  // For now, we'll return success and the build can be triggered manually
  // or via a webhook that calls the Mac Mini

  // Simulate async build process
  // In production, this would call out to the Mac Mini to run:
  // 1. git commit & push
  // 2. npm run build
  // 3. npx cap sync ios
  // 4. xcodebuild archive
  // 5. xcodebuild exportArchive (upload to TestFlight)

  return NextResponse.json({
    ok: true,
    data: {
      build,
      message: `Build #${nextBuildNumber} created with ${approvedTasks.length} tasks. Trigger the build on Mac Mini.`,
      taskCount: approvedTasks.length,
    },
  });
}
