import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';

interface WorkerStatus {
  workerId: string;
  lastSeen: string;
  status: 'running' | 'draining' | 'stopped';
  inFlight: number;
  concurrency: number;
  pollIntervalMs: number;
  hasAnthropicKey: boolean;
  /** True when $HOME/.claude/.credentials.json is mounted — Max OAuth path. */
  hasMaxOauth?: boolean;
  hasGithubToken: boolean;
}

interface WorkerRow extends WorkerStatus {
  /** seconds since last heartbeat */
  ageSec: number;
  /** considered active if ageSec < 3 * pollIntervalMs/1000 */
  active: boolean;
}

const STALE_MULTIPLIER = 3;

// GET /api/ai-hub/workers — list workers from their AppSetting heartbeat rows
export async function GET() {
  try {
    await requireApiAuth();
    const rows = await prisma.appSetting.findMany({
      where: { key: { startsWith: 'worker:' } },
    });
    const now = Date.now();
    const workers: WorkerRow[] = [];
    for (const r of rows) {
      try {
        const v = JSON.parse(r.value) as WorkerStatus;
        const ageSec = Math.max(0, Math.floor((now - new Date(v.lastSeen).getTime()) / 1000));
        const staleAfterSec = Math.max(15, (v.pollIntervalMs / 1000) * STALE_MULTIPLIER);
        workers.push({
          ...v,
          ageSec,
          active: v.status !== 'stopped' && ageSec < staleAfterSec,
        });
      } catch {
        // skip malformed rows
      }
    }
    workers.sort((a, b) => a.ageSec - b.ageSec);
    return NextResponse.json({
      ok: true,
      data: {
        workers,
        anyActive: workers.some((w) => w.active),
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[ai-hub/workers] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
