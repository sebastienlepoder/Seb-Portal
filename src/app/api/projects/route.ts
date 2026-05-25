import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - List all projects
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { updatedAt: 'desc' },
      ],
      include: {
        _count: {
          select: { sessions: true, tasks: true }
        }
      }
    });

    return NextResponse.json({ ok: true, data: projects });
  } catch (error) {
    console.error('Projects list error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST - Create new project (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, slug, description, repoUrl, icon, color, kind } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { ok: false, error: 'Name and slug are required' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json(
        { ok: false, error: 'Slug must be lowercase alphanumeric with hyphens' },
        { status: 400 }
      );
    }

    const normalizedKind = kind === 'physical' ? 'physical' : 'digital';

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        description,
        repoUrl,
        icon,
        color,
        kind: normalizedKind,
      },
    });

    return NextResponse.json({ ok: true, data: project });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'A project with this slug already exists' },
        { status: 400 }
      );
    }
    console.error('Project create error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
