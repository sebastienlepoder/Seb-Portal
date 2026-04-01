import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getApiUser } from '@/lib/auth';

// GET /api/amonis/tasks - List all tasks
export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const agentId = searchParams.get('agentId');

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (agentId) where.agentId = agentId;

  const tasks = await prisma.amonisTask.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    include: { agent: true },
  });

  return NextResponse.json({ ok: true, data: tasks });
}

// POST /api/amonis/tasks - Create a new task
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  
  // Auto-assign agent if not specified
  let agentId = body.agentId || null;
  
  if (!agentId && (body.title || body.description)) {
    // Simple keyword-based auto-assignment - check both title AND description
    const searchText = `${body.title || ''} ${body.description || ''}`.toLowerCase();
    const agents = await prisma.amonisAgent.findMany({ where: { enabled: true } });
    
    const keywords: Record<string, string[]> = {
      budget: ['budget', 'pie chart', 'donut', '50/30/20', 'envelope', 'spending', 'wizard', 'kpi'],
      transactions: ['transaction', 'expense', 'categorize', 'split', 'merchant'],
      accounts: ['account', 'bank', 'plaid', 'link', 'balance', 'institution'],
      crypto: ['crypto', 'bitcoin', 'ethereum', 'coin', 'portfolio', 'wallet'],
      goals: ['goal', 'saving', 'debt', 'payoff', 'target'],
      settings: ['setting', 'profile', 'preference', 'notification', 'theme'],
    };
    
    for (const [slug, words] of Object.entries(keywords)) {
      if (words.some(w => searchText.includes(w))) {
        const agent = agents.find(a => a.slug === slug);
        if (agent) {
          agentId = agent.id;
          break;
        }
      }
    }
  }

  const task = await prisma.amonisTask.create({
    data: {
      title: body.title,
      description: body.description,
      agentId,
      priority: body.priority || 1,
      status: agentId ? 'assigned' : 'pending',
      assignedAt: agentId ? new Date() : null,
    },
    include: { agent: true },
  });

  // Auto-trigger agent if task was assigned and autoTrigger not disabled
  if (agentId && body.autoTrigger !== false) {
    triggerAgent(task.id).catch(console.error);
  }

  return NextResponse.json({ ok: true, data: task });
}

async function triggerAgent(taskId: string) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const webhookSecret = process.env.AMONIS_WEBHOOK_SECRET;
  
  await fetch(`${baseUrl}/api/amonis/webhook`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(webhookSecret ? { 'Authorization': `Bearer ${webhookSecret}` } : {}),
    },
    body: JSON.stringify({ taskId, action: 'work' }),
  });
}
