#!/usr/bin/env tsx
/**
 * LEPODER Portal — Agent Dispatch Worker
 *
 * Polls the Task table for pending/queued tasks, locks them by setting
 * workerId, runs the headless Claude agent, then records the result.
 *
 * Required env:
 *   DATABASE_URL          — same SQLite/Postgres URL as the portal
 *   ANTHROPIC_API_KEY     — Claude API key
 *
 * Optional env:
 *   GITHUB_TOKEN          — required for cloning private repos and opening PRs
 *   WORKER_ID             — unique id (default: hostname-pid)
 *   WORKER_POLL_INTERVAL_MS  default 5000
 *   WORKER_TIMEOUT_MS     per-task hard timeout (default 300000 = 5 min)
 *   WORKER_MAX_ITERATIONS agent tool-loop budget (default 40)
 *   WORKER_DEFAULT_MODEL  default model id (default claude-sonnet-4-6)
 *   WORKER_CONCURRENCY    max simultaneous tasks (default 1)
 *   ANTHROPIC_BASE_URL    optional proxy
 */

import * as os from 'os';
import prisma from '../src/lib/db';
import { executeTask } from './task-executor';
import { logger } from './logger';

const WORKER_ID = process.env.WORKER_ID || `${os.hostname()}-${process.pid}`;
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000', 10) || 5000;
const CONCURRENCY = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '1', 10) || 1);
const TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '300000', 10) || 300000;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

let shuttingDown = false;
const inFlight = new Set<string>();

async function lockNextTask(): Promise<string | null> {
  // Pick the next non-locked pending/queued task, ordered by priority then age.
  // SQLite doesn't support SKIP LOCKED, so we use an optimistic update on a
  // single row with the workerId guard.
  const candidate = await prisma.task.findFirst({
    where: {
      status: { in: ['pending', 'queued'] },
      workerId: null,
    },
    orderBy: [{ createdAt: 'asc' }],
  });
  if (!candidate) return null;

  // Re-rank by priority among same-batch candidates by also looking at top N.
  const top = await prisma.task.findMany({
    where: { status: { in: ['pending', 'queued'] }, workerId: null },
    orderBy: [{ createdAt: 'asc' }],
    take: 20,
  });
  top.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const chosen = top[0];
  if (!chosen) return null;

  // Atomic claim
  const claimed = await prisma.task.updateMany({
    where: { id: chosen.id, workerId: null, status: { in: ['pending', 'queued'] } },
    data: {
      status: 'in_progress',
      workerId: WORKER_ID,
      workerStartedAt: new Date(),
    },
  });
  if (claimed.count === 0) return null;
  return chosen.id;
}

async function reapStaleTasks(): Promise<void> {
  // If a worker died mid-task, its rows still say in_progress. Re-queue any
  // task whose workerStartedAt is older than 2× the timeout.
  const cutoff = new Date(Date.now() - TIMEOUT_MS * 2);
  const stale = await prisma.task.findMany({
    where: {
      status: 'in_progress',
      workerStartedAt: { lt: cutoff },
    },
  });
  for (const t of stale) {
    await prisma.task.update({
      where: { id: t.id },
      data: {
        status: 'failed',
        errorMessage: `Stale task: worker "${t.workerId}" did not finish before ${cutoff.toISOString()}`,
        completedAt: new Date(),
      },
    });
    await logger.warn(t.id, `Reaped stale task previously held by ${t.workerId}`);
  }
}

async function heartbeat(status: 'running' | 'draining' | 'stopped'): Promise<void> {
  // Write a heartbeat row so the dashboard can show "worker online" / "no
  // worker running". Best-effort — never crash the loop if the DB is busy.
  const payload = JSON.stringify({
    workerId: WORKER_ID,
    lastSeen: new Date().toISOString(),
    status,
    inFlight: inFlight.size,
    concurrency: CONCURRENCY,
    pollIntervalMs: POLL_INTERVAL_MS,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasGithubToken: !!process.env.GITHUB_TOKEN,
  });
  try {
    await prisma.appSetting.upsert({
      where: { key: `worker:${WORKER_ID}` },
      create: { key: `worker:${WORKER_ID}`, value: payload },
      update: { value: payload },
    });
  } catch {
    /* ignore */
  }
}

async function tick(): Promise<void> {
  if (shuttingDown) return;
  if (inFlight.size >= CONCURRENCY) return;

  await reapStaleTasks();

  while (!shuttingDown && inFlight.size < CONCURRENCY) {
    const taskId = await lockNextTask();
    if (!taskId) break;
    inFlight.add(taskId);
    process.stdout.write(`[worker] Picked up task ${taskId} (in-flight=${inFlight.size})\n`);

    // Per-task timeout wrapper. The agent itself also enforces a timeout, but
    // this guards against anything else hanging (git clone, push, PR, etc.).
    const taskPromise = (async () => {
      try {
        await Promise.race([
          executeTask({ taskId, workerId: WORKER_ID }),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error(`worker hard timeout after ${TIMEOUT_MS}ms`)),
              TIMEOUT_MS
            )
          ),
        ]);
      } catch (e) {
        const msg = (e as Error).message;
        await logger.error(taskId, `Worker error: ${msg}`).catch(() => {});
        await prisma.task
          .update({
            where: { id: taskId },
            data: {
              status: 'failed',
              completedAt: new Date(),
              errorMessage: msg.slice(0, 2000),
            },
          })
          .catch(() => {});
      } finally {
        inFlight.delete(taskId);
      }
    })();
    // fire-and-forget; loop continues
    void taskPromise;
  }
}

async function main(): Promise<void> {
  process.stdout.write(`[worker] Starting "${WORKER_ID}" (concurrency=${CONCURRENCY}, poll=${POLL_INTERVAL_MS}ms, timeout=${TIMEOUT_MS}ms)\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('[worker] WARNING: ANTHROPIC_API_KEY not set — tasks will fail.\n');
  }
  if (!process.env.GITHUB_TOKEN) {
    process.stderr.write('[worker] WARNING: GITHUB_TOKEN not set — public repos only, no PR creation.\n');
  }

  process.on('SIGTERM', () => {
    process.stdout.write('[worker] SIGTERM received, draining…\n');
    shuttingDown = true;
  });
  process.on('SIGINT', () => {
    process.stdout.write('[worker] SIGINT received, draining…\n');
    shuttingDown = true;
  });

  await heartbeat('running');

  while (!shuttingDown) {
    try {
      await tick();
      await heartbeat('running');
    } catch (e) {
      process.stderr.write(`[worker] tick error: ${(e as Error).message}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Drain in-flight tasks before exit
  process.stdout.write(`[worker] draining ${inFlight.size} task(s)…\n`);
  await heartbeat('draining');
  while (inFlight.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await heartbeat('stopped');
  await prisma.$disconnect();
  process.stdout.write('[worker] shutdown complete\n');
}

main().catch((e) => {
  process.stderr.write(`[worker] fatal: ${(e as Error).stack}\n`);
  process.exit(1);
});
