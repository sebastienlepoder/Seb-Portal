import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';

const PORTAL_TODOS = [
  { title: "Gmail Integration", description: "Add Gmail to email hub alongside Outlook", category: "Portal", priority: 1 },
  { title: "Shopify Dashboard", description: "Orders, revenue summary from existing API", category: "Portal", priority: 1 },
  { title: "OneNote Full Integration", description: "Notebooks list, create notes via Graph API", category: "Portal", priority: 1 },
  { title: "Synology File Browser", description: "WebDAV/API file access", category: "Portal", priority: 0 },
  { title: "n8n Webhook Hub", description: "Trigger automations from portal", category: "Portal", priority: 0 },
  { title: "AI Icon Generation", description: "Wire up Cloud AI for auto-icons when adding services", category: "Portal", priority: 0 },
  { title: "Notification Center", description: "Unified alerts from all services", category: "Portal", priority: 1 },
  { title: "Admin Reports UI", description: "Uptime graphs, health history dashboard", category: "Portal", priority: 0 },
  { title: "Chrome Bookmarks Import", description: "Sync bookmarks from browser", category: "Portal", priority: 0 },
  { title: "MCP Auto-Detection", description: "Suggest native integrations when adding services", category: "Portal", priority: 0 },
  { title: "Activity Feed", description: "Recent actions log", category: "Portal", priority: 0 },
  { title: "Web SSH Terminal", description: "Quick server access from portal", category: "Portal", priority: 0 },
  { title: "AI Chat Panel", description: "Embedded ChatGPT/Claude in portal", category: "Portal", priority: 0 },
];

// POST /api/todos/seed - Seed portal todos (admin only, one-time)
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Check if already seeded
    const existing = await prisma.todo.count({
      where: { userId: user.id, category: 'Portal' }
    });

    if (existing > 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `Already have ${existing} Portal todos. Delete them first if you want to re-seed.` 
      }, { status: 400 });
    }

    // Create todos
    const created = await prisma.todo.createMany({
      data: PORTAL_TODOS.map((t, i) => ({
        userId: user.id,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        sortOrder: i,
      })),
    });

    return NextResponse.json({ 
      ok: true, 
      message: `Created ${created.count} Portal todos` 
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ ok: false, error: 'Seed failed' }, { status: 500 });
  }
}
