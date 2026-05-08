#!/usr/bin/env npx tsx
/**
 * Dev-only smoke test: dispatch a fake task and verify the row lands in
 * the DB with all relations populated. Run after seeding.
 */
import prisma from '../src/lib/db';
import { dispatchTask } from '../src/lib/agent-dispatch';

async function main() {
  const result = await dispatchTask({
    projectName: 'lepoder-portal',
    taskTitle: 'Smoke test task',
    taskDescription: 'This is a synthetic task created by scripts/test-dispatch.ts.',
    priority: 'low',
  });
  console.log('Dispatch result:', result);

  const task = await prisma.task.findUnique({
    where: { id: result.taskId },
    include: { project: true, agentProfile: true, logs: true },
  });
  if (!task) throw new Error('task not found after dispatch');
  console.log('Task in DB:');
  console.log({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    project: task.project.slug,
    agent: task.agentProfile?.slug,
    logCount: task.logs.length,
    firstLog: task.logs[0]?.message,
  });

  // Cleanup the smoke-test row so the dev DB stays tidy
  await prisma.taskLog.deleteMany({ where: { taskId: task.id } });
  await prisma.task.delete({ where: { id: task.id } });
  console.log('Cleaned up.');
}

main()
  .catch((e) => {
    console.error('FAIL:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
