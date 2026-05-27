import { NextRequest } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { parseNaturalSchedule } from '@/lib/schedule/parse';
import { computeNextRun } from '@/lib/schedule/cron';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireApiAdmin();
  } catch {
    return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const naturalText = (body?.naturalText ?? '') as string;
  if (!naturalText.trim()) {
    return Response.json({ ok: false, error: 'naturalText required' }, { status: 400 });
  }

  const parsed = parseNaturalSchedule(naturalText);
  if (!parsed) {
    return Response.json({
      ok: false,
      error: `Could not parse "${naturalText.trim()}"`,
      hint: 'Try: "every weekday at 9am", "every 30 minutes", "daily at 7am", or a raw cron expression.',
    });
  }

  const next1 = computeNextRun(parsed.cronExpr);
  const next2 = next1 ? computeNextRun(parsed.cronExpr, next1) : null;
  const next3 = next2 ? computeNextRun(parsed.cronExpr, next2) : null;

  return Response.json({
    ok: true,
    data: {
      cronExpr: parsed.cronExpr,
      humanReadable: parsed.humanReadable,
      upcoming: [next1, next2, next3].filter((d): d is Date => d !== null).map((d) => d.toISOString()),
    },
  });
}
