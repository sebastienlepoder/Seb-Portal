import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

const DEFAULT_AGENTS = [
  {
    slug: 'budget',
    name: 'Budget Agent',
    description: 'Handles budget page, 50/30/20 view, envelope budgeting, and spending analysis',
    icon: 'layout-dashboard',
    color: '#3b82f6',
    scope: 'web/src/pages/BudgetV2.tsx, web/src/components/budget-*',
    sortOrder: 1,
  },
  {
    slug: 'transactions',
    name: 'Transactions Agent',
    description: 'Transaction list, filters, categorization, splits, and merchant management',
    icon: 'credit-card',
    color: '#10b981',
    scope: 'web/src/pages/Transactions.tsx, web/src/components/*Transaction*',
    sortOrder: 2,
  },
  {
    slug: 'accounts',
    name: 'Accounts Agent',
    description: 'Linked accounts, Plaid integration, manual accounts, and net worth',
    icon: 'wallet',
    color: '#8b5cf6',
    scope: 'web/src/pages/Accounts.tsx, web/src/components/*Account*',
    sortOrder: 3,
  },
  {
    slug: 'crypto',
    name: 'Crypto Agent',
    description: 'Crypto holdings, charts, exchange connections, and portfolio tracking',
    icon: 'trending-up',
    color: '#f59e0b',
    scope: 'web/src/pages/Crypto.tsx, web/src/components/*Crypto*',
    sortOrder: 4,
  },
  {
    slug: 'goals',
    name: 'Goals Agent',
    description: 'Savings goals, debt payoff tracking, and financial targets',
    icon: 'target',
    color: '#ec4899',
    scope: 'web/src/pages/Goals.tsx, web/src/components/*Goal*',
    sortOrder: 5,
  },
  {
    slug: 'settings',
    name: 'Settings Agent',
    description: 'App settings, profiles, preferences, categories, and rules',
    icon: 'settings',
    color: '#6b7280',
    scope: 'web/src/pages/settings/*, web/src/components/Settings*',
    sortOrder: 6,
  },
  {
    slug: 'research',
    name: 'Research Agent',
    description: 'Investigates UX patterns, competitor features, and best practices',
    icon: 'search',
    color: '#06b6d4',
    scope: null,
    sortOrder: 7,
  },
  {
    slug: 'designer',
    name: 'Designer Agent',
    description: 'Reviews and improves UI/UX, colors, spacing, and visual design',
    icon: 'palette',
    color: '#a855f7',
    scope: null,
    sortOrder: 8,
  },
  {
    slug: 'devil',
    name: "Devil's Advocate",
    description: 'Critiques work, finds edge cases, bugs, and potential issues',
    icon: 'bug',
    color: '#ef4444',
    scope: null,
    sortOrder: 9,
  },
];

// POST /api/amonis/seed - Initialize agents
export async function POST(request: Request) {
  const user = await requireAuth(request);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const results = [];

  for (const agent of DEFAULT_AGENTS) {
    const existing = await prisma.amonisAgent.findUnique({
      where: { slug: agent.slug },
    });

    if (existing) {
      // Update existing
      const updated = await prisma.amonisAgent.update({
        where: { slug: agent.slug },
        data: agent,
      });
      results.push({ ...updated, action: 'updated' });
    } else {
      // Create new
      const created = await prisma.amonisAgent.create({
        data: agent,
      });
      results.push({ ...created, action: 'created' });
    }
  }

  return NextResponse.json({ ok: true, data: results });
}
