import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import prisma from '@/lib/db';

export interface CostDailyBucket {
  /** YYYY-MM-DD in UTC. */
  date: string;
  /** Real money: sum of costUsd where authPath = 'api_key'. */
  billedUsd: number;
  /** Informational: sum of costUsd for OAuth runs (SDK token-cost estimate;
   *  the user wasn't actually charged, this is "what it would have cost"). */
  estimatedOauthUsd: number;
  /** Count of API-key runs that day. */
  billedCount: number;
  /** Count of OAuth runs that day. */
  oauthCount: number;
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
  /** Real money charged via ANTHROPIC_API_KEY — matches Anthropic billing
   *  (within SDK estimation error). */
  billedUsd: number;
  /** SDK token-cost estimate across OAuth runs. Informational only; the
   *  user wasn't actually charged for any of this. */
  estimatedOauthUsd: number;
  /** Number of tasks in the window with a recorded auth path. */
  taskCount: number;
  /** Tasks billed via ANTHROPIC_API_KEY. */
  billedTaskCount: number;
  /** Tasks run via Max OAuth. */
  oauthTaskCount: number;
  /** Tasks where authPath was never recorded (pre-migration). */
  unknownTaskCount: number;
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

    // Tasks completed in window with a recorded cost OR authPath. Either
    // alone is informative; legacy rows that have neither don't belong here.
    const tasks = await prisma.task.findMany({
      where: {
        completedAt: { gte: from, lte: to },
        OR: [{ costUsd: { not: null } }, { authPath: { not: null } }],
      },
      include: {
        project: { select: { slug: true, name: true } },
        agentProfile: { select: { slug: true, name: true } },
      },
      orderBy: { completedAt: 'desc' },
    });

    const dailyMap = new Map<string, CostDailyBucket>();
    for (let i = 0; i < days; i++) {
      const d = new Date(to);
      d.setUTCDate(d.getUTCDate() - i);
      const key = utcDateKey(d);
      dailyMap.set(key, {
        date: key,
        billedUsd: 0,
        estimatedOauthUsd: 0,
        billedCount: 0,
        oauthCount: 0,
      });
    }

    let billedUsd = 0;
    let estimatedOauthUsd = 0;
    let billedTaskCount = 0;
    let oauthTaskCount = 0;
    let unknownTaskCount = 0;
    const rows: CostRow[] = [];

    for (const t of tasks) {
      const cost = t.costUsd ?? 0;
      const authPath = ((t as { authPath?: string | null }).authPath ?? null) as
        | 'oauth'
        | 'api_key'
        | null;

      if (authPath === 'api_key') {
        billedUsd += cost;
        billedTaskCount++;
      } else if (authPath === 'oauth') {
        estimatedOauthUsd += cost;
        oauthTaskCount++;
      } else {
        // No authPath recorded — pre-migration row. Don't count toward
        // either total; the user can see it in the table but it doesn't
        // pollute the spend number.
        unknownTaskCount++;
      }

      const key = t.completedAt ? utcDateKey(t.completedAt) : null;
      if (key && dailyMap.has(key)) {
        const b = dailyMap.get(key)!;
        if (authPath === 'api_key') {
          b.billedUsd += cost;
          b.billedCount++;
        } else if (authPath === 'oauth') {
          b.estimatedOauthUsd += cost;
          b.oauthCount++;
        }
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
          authPath: authPath ?? 'unknown',
        });
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const body: CostsResponse = {
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      billedUsd,
      estimatedOauthUsd,
      taskCount: tasks.length,
      billedTaskCount,
      oauthTaskCount,
      unknownTaskCount,
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
