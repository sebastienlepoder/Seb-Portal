import prisma from '../src/lib/db';
import type { TaskLogLevel } from '../src/types/agents';

/**
 * Streams a log line both to the TaskLog table (for the dashboard) and to
 * stdout (for `docker logs`). Errors swallowed — logging must never crash
 * the worker.
 */
export async function logTask(
  taskId: string,
  level: TaskLogLevel,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const truncated = message.length > 8000 ? message.slice(0, 8000) + '\n…[truncated]' : message;
  const stamp = new Date().toISOString();
  // Console first so we still see something if the DB write fails.
  const stream = level === 'error' || level === 'stderr' ? process.stderr : process.stdout;
  stream.write(`[${stamp}] [${taskId.slice(0, 8)}] [${level}] ${truncated}\n`);

  try {
    await prisma.taskLog.create({
      data: {
        taskId,
        level,
        message: truncated,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (e) {
    process.stderr.write(`[logger] failed to persist log: ${(e as Error).message}\n`);
  }
}

export const logger = {
  info: (taskId: string, msg: string, meta?: Record<string, unknown>) =>
    logTask(taskId, 'info', msg, meta),
  warn: (taskId: string, msg: string, meta?: Record<string, unknown>) =>
    logTask(taskId, 'warn', msg, meta),
  error: (taskId: string, msg: string, meta?: Record<string, unknown>) =>
    logTask(taskId, 'error', msg, meta),
  stdout: (taskId: string, msg: string) => logTask(taskId, 'stdout', msg),
  stderr: (taskId: string, msg: string) => logTask(taskId, 'stderr', msg),
};
