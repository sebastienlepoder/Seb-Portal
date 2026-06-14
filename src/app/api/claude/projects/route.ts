import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import prisma from '@/lib/db';

// GET /api/claude/projects — projects the Claude CLI can open a session in.
// Admin-only (the CLI runs shell commands on the portal server). Only projects
// with a clonable repo (repoOwner + repoName) or an explicit clonePath qualify.
export async function GET() {
  try {
    await requireApiAdmin();
    const projects = await prisma.project.findMany({
      where: { status: { in: ['active', 'paused'] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        icon: true,
        color: true,
        repoOwner: true,
        repoName: true,
        workingBranch: true,
        allowWrite: true,
        clonePath: true,
      },
    });

    const data = projects
      .filter((p) => (p.repoOwner && p.repoName) || p.clonePath)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        icon: p.icon,
        color: p.color,
        repo: p.repoOwner && p.repoName ? `${p.repoOwner}/${p.repoName}` : null,
        workingBranch: p.workingBranch,
        allowWrite: p.allowWrite,
      }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (msg === 'FORBIDDEN') {
      return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }
    console.error('[claude/projects] error:', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
