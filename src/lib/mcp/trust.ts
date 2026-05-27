import prisma from '../db';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ToolStats {
  toolName: string;
  totalCalls: number;
  totalCalls7d: number;
  successRate7d: number;       // 0-1, defaults to 1 with no data
  errors24h: number;
  avgDurationMs: number;
  p95DurationMs: number;
  lastCalledAt: string | null;
  lastError: string | null;
  trustScore: number;          // 0-100
}

/**
 * Compute the per-tool stats + trust score from raw McpCallLog rows.
 * Designed to be called on-demand by the admin dashboard — for a
 * personal portal the table stays small enough that a single
 * groupBy + a couple of selects is fast.
 */
export async function getAllToolStats(): Promise<ToolStats[]> {
  const now = Date.now();
  const day = new Date(now - DAY_MS);
  const week = new Date(now - 7 * DAY_MS);

  // One groupBy for lifetime totals
  const lifetime = await prisma.mcpCallLog.groupBy({
    by: ['toolName'],
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const stats: ToolStats[] = [];
  for (const row of lifetime) {
    const toolName = row.toolName;

    const [calls7d, calls24h, recent20] = await Promise.all([
      prisma.mcpCallLog.findMany({
        where: { toolName, createdAt: { gte: week } },
        select: { success: true, durationMs: true },
      }),
      prisma.mcpCallLog.findMany({
        where: { toolName, createdAt: { gte: day } },
        select: { success: true },
      }),
      prisma.mcpCallLog.findMany({
        where: { toolName, success: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { error: true },
      }),
    ]);

    const total7d = calls7d.length;
    const successes7d = calls7d.filter((c) => c.success).length;
    const successRate7d = total7d === 0 ? 1 : successes7d / total7d;
    const errors24h = calls24h.filter((c) => !c.success).length;

    const durations = calls7d.map((c) => c.durationMs).sort((a, b) => a - b);
    const avgDurationMs =
      durations.length === 0
        ? 0
        : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const p95DurationMs =
      durations.length === 0
        ? 0
        : durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];

    stats.push({
      toolName,
      totalCalls: row._count._all,
      totalCalls7d: total7d,
      successRate7d,
      errors24h,
      avgDurationMs,
      p95DurationMs,
      lastCalledAt: row._max.createdAt?.toISOString() ?? null,
      lastError: recent20[0]?.error ?? null,
      trustScore: computeTrustScore({
        totalCalls: row._count._all,
        totalCalls7d: total7d,
        successRate7d,
        errors24h,
      }),
    });
  }

  return stats.sort((a, b) => b.trustScore - a.trustScore);
}

interface TrustInputs {
  totalCalls: number;
  totalCalls7d: number;
  successRate7d: number;
  errors24h: number;
}

/**
 * Trust score in [0, 100]:
 *   base          = successRate7d × 100               (raw quality)
 *   volumeConf    = min(1, totalCalls7d / 20)         (low volume → low confidence)
 *   noveltyDock   = totalCalls < 10 ? 15 : 0          (untested tools start cautious)
 *   errorDock     = min(30, errors24h × 5)            (recent failures bite hard)
 *
 *   score = max(0, round(base × volumeConf - noveltyDock - errorDock))
 *
 * Worked examples:
 *   100 calls, all OK, no recent errors   → 100
 *   20  calls, all OK                      → 100
 *   5   calls, all OK                      → 25 (volume cap)
 *   100 calls, 90% success, 0 errors today → 90
 *   100 calls, 90% success, 4 errors today → 70
 *   first-ever 3 calls, all OK             → 0  (volume + novelty)
 */
export function computeTrustScore(s: TrustInputs): number {
  const base = s.successRate7d * 100;
  const volumeConf = Math.min(1, s.totalCalls7d / 20);
  const noveltyDock = s.totalCalls < 10 ? 15 : 0;
  const errorDock = Math.min(30, s.errors24h * 5);
  return Math.max(0, Math.round(base * volumeConf - noveltyDock - errorDock));
}
