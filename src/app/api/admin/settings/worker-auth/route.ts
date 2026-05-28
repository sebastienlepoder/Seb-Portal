import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';

const SETTING_KEY = 'worker.auth.mode';

export type WorkerAuthMode = 'oauth' | 'api_key';

interface WorkerAuthState {
  mode: WorkerAuthMode;
}

const putSchema = z.object({
  mode: z.enum(['oauth', 'api_key']),
});

async function readMode(): Promise<WorkerAuthMode> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  return row?.value === 'api_key' ? 'api_key' : 'oauth';
}

export async function GET() {
  try {
    await requireApiAdmin();
    const state: WorkerAuthState = { mode: await readMode() };
    return NextResponse.json({ ok: true, data: state });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(req))) {
      return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
    }
    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { mode } = parsed.data;
    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: mode },
      update: { value: mode },
    });
    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'setting', op: 'set', key: SETTING_KEY, value: mode },
      ipAddress: getClientIp(req),
    });
    const state: WorkerAuthState = { mode };
    return NextResponse.json({ ok: true, data: state });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
