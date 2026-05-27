import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireApiAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Recent call detail for a single tool. Used by the admin drill-in
 * view. Returns up to 50 recent calls with sanitised inputs/results.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ toolName: string }> }) {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }

  const { toolName } = await ctx.params;

  const calls = await prisma.mcpCallLog.findMany({
    where: { toolName },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return Response.json({
    ok: true,
    data: calls.map((c) => ({
      id: c.id,
      callerId: c.callerId,
      callerKind: c.callerKind,
      success: c.success,
      durationMs: c.durationMs,
      inputJson: c.inputJson,
      resultPreview: c.resultPreview,
      error: c.error,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
