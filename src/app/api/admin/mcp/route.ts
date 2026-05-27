import { requireApiAdmin } from '@/lib/auth';
import { getMcpTools } from '@/server/mcp/registry';
import { getAllToolStats } from '@/lib/mcp/trust';

export const runtime = 'nodejs';

/**
 * Returns one row per registered tool, joined with its call-log stats
 * and trust score. Tools that have never been called still appear,
 * with totalCalls=0 and trustScore=0 (volume cap).
 */
export async function GET() {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const registered = getMcpTools(true);
  const stats = await getAllToolStats();
  const statsByName = new Map(stats.map((s) => [s.toolName, s]));

  const rows = registered.map((t) => {
    const s = statsByName.get(t.name);
    return {
      toolName: t.name,
      description: t.description,
      adminOnly: t.adminOnly,
      registered: true,
      totalCalls: s?.totalCalls ?? 0,
      totalCalls7d: s?.totalCalls7d ?? 0,
      successRate7d: s?.successRate7d ?? 1,
      errors24h: s?.errors24h ?? 0,
      avgDurationMs: s?.avgDurationMs ?? 0,
      p95DurationMs: s?.p95DurationMs ?? 0,
      lastCalledAt: s?.lastCalledAt ?? null,
      lastError: s?.lastError ?? null,
      trustScore: s?.trustScore ?? 0,
    };
  });

  // Surface stats for tool names we have logs for but that aren't
  // currently registered (renamed/removed tools). Useful audit signal.
  for (const s of stats) {
    if (!rows.find((r) => r.toolName === s.toolName)) {
      rows.push({
        toolName: s.toolName,
        description: '(no longer registered)',
        adminOnly: false,
        registered: false,
        totalCalls: s.totalCalls,
        totalCalls7d: s.totalCalls7d,
        successRate7d: s.successRate7d,
        errors24h: s.errors24h,
        avgDurationMs: s.avgDurationMs,
        p95DurationMs: s.p95DurationMs,
        lastCalledAt: s.lastCalledAt,
        lastError: s.lastError,
        trustScore: s.trustScore,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.totalCalls === 0 && b.totalCalls > 0) return 1;
    if (b.totalCalls === 0 && a.totalCalls > 0) return -1;
    return b.trustScore - a.trustScore;
  });

  return Response.json({ ok: true, data: rows });
}
