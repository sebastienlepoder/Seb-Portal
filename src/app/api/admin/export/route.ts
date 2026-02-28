import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';

// GET /api/admin/export - Export all config (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [services, todos, favorites] = await Promise.all([
      prisma.service.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.todo.findMany({ where: { userId: user.id } }),
      prisma.favorite.findMany({ where: { userId: user.id }, include: { service: true } }),
    ]);

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      data: {
        services: services.map(s => ({
          slug: s.slug,
          name: s.name,
          url: s.url,
          type: s.type,
          description: s.description,
          tags: s.tags,
          category: s.category,
          section: s.section,
          openMode: s.openMode,
          requiresVPN: s.requiresVPN,
          statusCheckUrl: s.statusCheckUrl,
          statusEnabled: s.statusEnabled,
          icon: s.icon,
          sortOrder: s.sortOrder,
          enabled: s.enabled,
        })),
        todos: todos.map(t => ({
          title: t.title,
          description: t.description,
          category: t.category,
          priority: t.priority,
          completed: t.completed,
        })),
        favorites: favorites.map(f => f.service.slug),
      }
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="portal-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ ok: false, error: 'Export failed' }, { status: 500 });
  }
}

// POST /api/admin/export - Import config (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { data, options } = body;
    
    if (!data || !data.services) {
      return NextResponse.json({ ok: false, error: 'Invalid import data' }, { status: 400 });
    }

    const results = { services: 0, todos: 0, errors: [] as string[] };
    const mergeMode = options?.merge !== false; // Default: merge (don't delete existing)

    // Import services
    for (const service of data.services) {
      try {
        await prisma.service.upsert({
          where: { slug: service.slug },
          create: {
            slug: service.slug,
            name: service.name,
            url: service.url,
            type: service.type || 'external',
            description: service.description,
            tags: service.tags,
            category: service.category || 'Uncategorized',
            section: service.section || 'General',
            openMode: service.openMode || 'new_tab',
            requiresVPN: service.requiresVPN || false,
            statusCheckUrl: service.statusCheckUrl,
            statusEnabled: service.statusEnabled ?? true,
            icon: service.icon,
            sortOrder: service.sortOrder || 0,
            enabled: service.enabled ?? true,
          },
          update: {
            name: service.name,
            url: service.url,
            type: service.type || 'external',
            description: service.description,
            tags: service.tags,
            category: service.category,
            section: service.section,
            openMode: service.openMode,
            requiresVPN: service.requiresVPN,
            statusCheckUrl: service.statusCheckUrl,
            statusEnabled: service.statusEnabled,
            icon: service.icon,
            sortOrder: service.sortOrder,
            enabled: service.enabled,
          },
        });
        results.services++;
      } catch (e) {
        results.errors.push(`Service ${service.slug}: ${(e as Error).message}`);
      }
    }

    // Import todos
    if (data.todos) {
      for (const todo of data.todos) {
        try {
          await prisma.todo.create({
            data: {
              userId: user.id,
              title: todo.title,
              description: todo.description,
              category: todo.category || 'General',
              priority: todo.priority || 0,
              completed: todo.completed || false,
            },
          });
          results.todos++;
        } catch (e) {
          results.errors.push(`Todo "${todo.title}": ${(e as Error).message}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: results,
      message: `Imported ${results.services} services, ${results.todos} todos` + 
               (results.errors.length ? ` with ${results.errors.length} errors` : ''),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ ok: false, error: 'Import failed' }, { status: 500 });
  }
}
