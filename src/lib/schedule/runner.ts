import prisma from '../db';
import { writeActivity } from '../activity';
import { computeNextRun, isCronDue } from './cron';
import { dispatchScheduled, type DispatchKind } from './dispatch';

const MINUTE_MS = 60_000;
let lastTickMs = 0;

/**
 * Called from the worker poll loop. Gates internally so it only does
 * real work once per minute — safe to call as often as the worker polls.
 */
export async function schedulerTick(): Promise<void> {
  const now = Date.now();
  if (now - lastTickMs < MINUTE_MS) return;
  lastTickMs = now;

  await runDueSchedules(new Date(now));
}

async function runDueSchedules(now: Date): Promise<void> {
  const tasks = await prisma.recurringTask.findMany({
    where: { enabled: true },
  });

  for (const task of tasks) {
    if (!isCronDue(task.cronExpr, now, task.lastSpawnedAt)) continue;
    await fireOnce(task.id, 'tick');
  }
}

/**
 * Called once at worker boot. For each enabled schedule whose
 * nextRunAt is in the past, fire exactly one catch-up. Caps at 1 per
 * task so a long outage doesn't produce a stampede of identical runs.
 */
export async function catchUpOnBoot(): Promise<void> {
  const now = new Date();
  const tasks = await prisma.recurringTask.findMany({
    where: { enabled: true },
  });

  for (const task of tasks) {
    // Skip first-ever runs — nothing to catch up.
    if (!task.lastSpawnedAt && !task.nextRunAt) {
      const next = computeNextRun(task.cronExpr, now);
      await prisma.recurringTask.update({
        where: { id: task.id },
        data: { nextRunAt: next },
      });
      continue;
    }

    // Already caught up this slot?
    if (task.lastCatchUpAt && task.nextRunAt && task.lastCatchUpAt >= task.nextRunAt) {
      continue;
    }

    if (task.nextRunAt && task.nextRunAt < now) {
      await fireOnce(task.id, 'catchup');
      await prisma.recurringTask.update({
        where: { id: task.id },
        data: { lastCatchUpAt: now },
      });
    }
  }
}

async function fireOnce(taskId: string, reason: 'tick' | 'catchup'): Promise<void> {
  const task = await prisma.recurringTask.findUnique({ where: { id: taskId } });
  if (!task || !task.enabled) return;

  const startedAt = new Date();
  let lastError: string | null = null;

  const result = await dispatchScheduled(task.kind as DispatchKind, task.payload);
  if (!result.ok) {
    lastError = result.error.slice(0, 1000);
  }

  const nextRun = computeNextRun(task.cronExpr, startedAt);

  await prisma.recurringTask.update({
    where: { id: taskId },
    data: {
      lastSpawnedAt: startedAt,
      nextRunAt: nextRun,
      spawnCount: { increment: 1 },
      lastError,
    },
  });

  await writeActivity({
    type: result.ok
      ? reason === 'catchup' ? 'schedule.catchup' : 'schedule.spawned'
      : 'schedule.failed',
    description: result.ok
      ? `Scheduled "${task.title}" ${reason === 'catchup' ? 'caught up' : 'ran'}`
      : `Scheduled "${task.title}" failed: ${lastError ?? 'unknown error'}`,
    entityType: 'schedule',
    entityId: task.id,
    actor: 'scheduler',
    data: {
      kind: task.kind,
      result: result.ok ? result.result : undefined,
      error: result.ok ? undefined : result.error,
    },
  });
}
