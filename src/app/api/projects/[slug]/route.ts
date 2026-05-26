import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';

// GET - Get project details
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const project = await prisma.project.findUnique({
      where: { slug: params.slug },
      include: {
        sessions: {
          orderBy: { date: 'desc' },
          take: 10,
        },
        _count: {
          select: { sessions: true }
        }
      }
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: project });
  } catch (error) {
    console.error('Project fetch error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

// PUT - Update project (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, repoUrl, status, icon, color, kind } = body;

    const normalizedKind =
      kind === 'digital' || kind === 'physical' ? kind : undefined;

    const project = await prisma.project.update({
      where: { slug: params.slug },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(repoUrl !== undefined && { repoUrl }),
        ...(status && { status }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(normalizedKind && { kind: normalizedKind }),
      },
    });

    return NextResponse.json({ ok: true, data: project });
  } catch (error) {
    console.error('Project update error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

// DELETE - Delete project (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.project.delete({
      where: { slug: params.slug },
    });

    return NextResponse.json({ ok: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Project delete error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
