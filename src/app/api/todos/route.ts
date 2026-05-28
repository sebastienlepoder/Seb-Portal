import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';

// GET /api/todos - List todos
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const filter = url.searchParams.get('filter') || 'all'; // all, active, completed
    const category = url.searchParams.get('category');
    const projectId = url.searchParams.get('projectId'); // <id> | 'none' | null(all)

    const where: any = { userId: user.id };
    if (filter === 'active') where.completed = false;
    if (filter === 'completed') where.completed = true;
    if (category) where.category = category;
    if (projectId === 'none') where.projectId = null;
    else if (projectId) where.projectId = projectId;

    const todos = await prisma.todo.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: { project: { select: { slug: true, name: true, icon: true } } },
    });

    const categories = await prisma.todo.groupBy({
      by: ['category'],
      where: { userId: user.id },
      _count: true,
    });

    return NextResponse.json({
      ok: true,
      data: {
        todos,
        categories: categories.map(c => ({ name: c.category, count: c._count })),
        stats: {
          total: todos.length,
          active: todos.filter(t => !t.completed).length,
          completed: todos.filter(t => t.completed).length,
        }
      }
    });
  } catch (error) {
    console.error('Todos GET error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch todos' }, { status: 500 });
  }
}

// POST /api/todos - Create todo
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, category, priority, dueDate, projectId } = body;

    if (!title?.trim()) {
      return NextResponse.json({ ok: false, error: 'Title required' }, { status: 400 });
    }

    const todo = await prisma.todo.create({
      data: {
        userId: user.id,
        projectId: typeof projectId === 'string' && projectId ? projectId : null,
        title: title.trim(),
        description: description?.trim() || null,
        category: category?.trim() || 'General',
        priority: priority || 0,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: { project: { select: { slug: true, name: true, icon: true } } },
    });

    return NextResponse.json({ ok: true, data: todo });
  } catch (error) {
    console.error('Todos POST error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to create todo' }, { status: 500 });
  }
}

// PUT /api/todos - Update todo
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, title, description, category, priority, completed, dueDate, sortOrder, projectId } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Todo ID required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.todo.findFirst({
      where: { id, userId: user.id }
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Todo not found' }, { status: 404 });
    }

    const todo = await prisma.todo.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(category !== undefined && { category: category?.trim() || 'General' }),
        ...(priority !== undefined && { priority }),
        ...(completed !== undefined && { completed, completedAt: completed ? new Date() : null }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(projectId !== undefined && { projectId: projectId || null }),
      },
      include: { project: { select: { slug: true, name: true, icon: true } } },
    });

    return NextResponse.json({ ok: true, data: todo });
  } catch (error) {
    console.error('Todos PUT error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to update todo' }, { status: 500 });
  }
}

// DELETE /api/todos - Delete todo
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const clearCompleted = url.searchParams.get('clearCompleted');

    if (clearCompleted === 'true') {
      await prisma.todo.deleteMany({
        where: { userId: user.id, completed: true }
      });
      return NextResponse.json({ ok: true });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Todo ID required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.todo.findFirst({
      where: { id, userId: user.id }
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Todo not found' }, { status: 404 });
    }

    await prisma.todo.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Todos DELETE error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to delete todo' }, { status: 500 });
  }
}
