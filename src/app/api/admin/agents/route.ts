import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import prisma from '@/lib/db';
import { toAgentProfileDTO } from '@/lib/agents';

const agentSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lowercase, numbers, hyphens'),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  expertise: z.array(z.string().min(1).max(40)).default([]),
  description: z.string().max(2000).optional().nullable(),
  systemPrompt: z.string().min(1).max(20000),
  model: z.string().max(80).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// GET — list all agent profiles (admin only)
export async function GET() {
  try {
    await requireApiAdmin();
    const agents = await prisma.agentProfile.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ ok: true, data: agents.map(toAgentProfileDTO) });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST — create agent profile (admin only)
export async function POST(request: Request) {
  try {
    const user = await requireApiAdmin();
    if (!(await verifyCsrf(request))) {
      return NextResponse.json(
        { ok: false, error: 'CSRF validation failed' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = agentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const existing = await prisma.agentProfile.findUnique({ where: { slug: d.slug } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'Agent with this slug already exists' },
        { status: 409 }
      );
    }

    const created = await prisma.agentProfile.create({
      data: {
        slug: d.slug,
        name: d.name,
        role: d.role,
        expertise: JSON.stringify(d.expertise),
        description: d.description ?? null,
        systemPrompt: d.systemPrompt,
        model: d.model ?? null,
        isActive: d.isActive,
        sortOrder: d.sortOrder,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'admin_action',
      details: { resource: 'agent_profile', op: 'create', slug: created.slug, id: created.id },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json(
      { ok: true, data: toAgentProfileDTO(created) },
      { status: 201 }
    );
  } catch (e) {
    return errorResponse(e);
  }
}

function errorResponse(e: unknown): NextResponse {
  const msg = (e as Error).message;
  if (msg === 'UNAUTHORIZED') {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }
  console.error('[admin/agents] error:', e);
  return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
}
