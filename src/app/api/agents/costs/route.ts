import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';

export interface CostDailyBucket {
  /** YYYY-MM-DD in UTC. */
  date: string;
  /** Sum of costUsd for tasks completed on that day. */
  totalUsd: number;
  /** How many of those tasks had cost > 0 (API-key path). */
  paidCount: number;
  /** How many had cost = 0 (Max OAuth path). */
  freeCount: number;
}

export interface CostRow {
  taskId: string;
  title: string;
  status: string;
  costUsd: number;
  projectSlug: string;
  projectName: string;
  agentSlug: string | null;
  agentName: string | null;
  completedAt: string | null;
  authPath: 'oauth' | 'api_key' | 'unknown';
}

export interface CostsResponse {
  /** Window covered by `daily`. */
  fromIso: string;
  toIso: string;
  totalUsd: number;
  taskCount: number;
  paidTaskCount: number;
  daily: CostDailyBucket[];
  /** Most recent tasks (capped at 200). */
  rows: CostRow[];
}

const MAX_ROWS = 200;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    await requireApiAuth();

    const url = new URL(req.url);
    const rawDays = parseInt(url.searchParams.get('days') || '', 10);
    const days =
      Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(rawDays, MAX_DAYS)
        : DEFAULT_DAYS;

    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // We only count tasks that finished inside the window AND have a cost
    // recorded (so older runs that pre-date this column don't pollute totals).
    const tasks = await prisma.task.findMany({
      where: {
        completedAt: { gte: from, lte: to },
        costUsd: { not: null },
      },
      include: {
        project: { select: { slug: true, name: true } },
        agentProfile: { select: { slug: true, name: true } },
      },
      orderBy: { completedAt: 'desc' },
    });

    const dailyMap = new Map<string, CostDailyBucket>();
    // Seed every day in the window with a zero bucket so the chart's x-axis
    // is dense even when there are no tasks on that day.
    for (let i = 0; i < days; i++) {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - i);
      const key = utcDateKey(d);
      dailyMap.set(key, { date: key, totalUsd: 0, paidCount: 0, freeCount: 0 });
    }

    let totalUsd = 0;
    let paidTaskCount = 0;
    const rows: CostRow[] = [];

    for (const t of tasks) {
      const cost = t.costUsd ?? 0;
      totalUsd += cost;
      if (cost > 0) paidTaskCount++;

      const key = t.completedAt ? utcDateKey(t.completedAt) : null;
      if (key && dailyMap.has(key)) {
        const b = dailyMap.get(key)!;
        b.totalUsd += cost;
        if (cost > 0) b.paidCount++;
        else b.freeCount++;
      }

      if (rows.length < MAX_ROWS) {
        rows.push({
          taskId: t.id,
          title: t.title,
          status: t.status,
          costUsd: cost,
          projectSlug: t.project.slug,
          projectName: t.project.name,
          agentSlug: t.agentProfile?.slug ?? null,
          agentName: t.agentProfile?.name ?? null,
          completedAt: t.completedAt?.toISOString() ?? null,
          authPath: cost > 0 ? 'api_key' : 'oauth',
        });
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const body: CostsResponse = {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      totalUsd,
      taskCount: tasks.length,
      paidTaskCount,
      daily,
      rows,
    };

    return NextResponse.json({ ok: true, data: body });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    console.error('[agents/costs] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
