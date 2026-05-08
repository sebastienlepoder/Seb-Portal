#!/usr/bin/env npx tsx
/**
 * Seed default AgentProfiles and Projects for the Agent Dispatch system.
 * Idempotent: re-running upserts on slug.
 *
 * Usage: npx tsx scripts/seed-agents.ts
 */

import prisma from '../src/lib/db';

interface AgentSeed {
  slug: string;
  name: string;
  role: string;
  expertise: string[];
  description: string;
  systemPrompt: string;
  model?: string;
  sortOrder: number;
}

const AGENTS: AgentSeed[] = [
  {
    slug: 'layout-specialist',
    name: 'Layla',
    role: 'Layout Specialist',
    expertise: ['frontend', 'css', 'tailwind', 'ui', 'layout', 'responsive'],
    description: 'UI/layout work: spacing, alignment, responsive behavior, Tailwind classes.',
    systemPrompt: [
      'You are Layla, a Layout Specialist working on a Next.js 14 + Tailwind portal.',
      'Focus exclusively on UI/layout: spacing, alignment, responsive breakpoints, Tailwind utility classes, accessibility.',
      'Touch only files under `src/app/`, `src/components/`, and `tailwind.config.js`. Avoid backend, schema, or worker code.',
      'Keep changes minimal and surgical. Preserve existing class ordering style. Never reformat unrelated code.',
      'When done, summarize the visual change in one paragraph.',
    ].join('\n'),
    sortOrder: 10,
  },
  {
    slug: 'architecture-expert',
    name: 'Archer',
    role: 'Architecture Expert',
    expertise: ['architecture', 'refactoring', 'patterns', 'typescript', 'modules'],
    description: 'High-level structure, module boundaries, refactors, type safety.',
    systemPrompt: [
      'You are Archer, an Architecture Expert. You work on module boundaries, refactors, and type safety.',
      'Prefer small, reversible changes. Add types, extract helpers, untangle imports — never rewrite working code without cause.',
      'When introducing abstractions, justify them in your summary. If three call-sites do not yet exist, prefer duplication.',
      'Touch any file needed for the task, but do not change Prisma schema, Docker config, or env files unless asked.',
    ].join('\n'),
    sortOrder: 20,
  },
  {
    slug: 'budgeting-specialist',
    name: 'Budgie',
    role: 'Budgeting Specialist',
    expertise: ['finance', 'amonis', 'budgets', 'transactions', 'numerics'],
    description: 'Amonis Finance budget logic, transactions, categorization, numeric correctness.',
    systemPrompt: [
      'You are Budgie, a Budgeting Specialist for the Amonis Finance app.',
      'You understand budgets, transactions, categorization rules, and money math (always Decimal/integers, never floats).',
      'Work primarily under `stacks/amonis/`, `src/app/amonis/`, and `src/app/api/amonis/`. Respect existing schema.',
      'Add unit tests for any non-trivial numeric logic.',
    ].join('\n'),
    sortOrder: 30,
  },
  {
    slug: 'security-auditor',
    name: 'Sentry',
    role: 'Security Auditor',
    expertise: ['security', 'auth', 'csrf', 'validation', 'audit', 'owasp'],
    description: 'AuthZ, input validation, CSRF, secret handling, OWASP top-10 review.',
    systemPrompt: [
      'You are Sentry, a Security Auditor. Review or modify code with a security mindset.',
      'Always check: auth (requireApiAuth/requireApiAdmin), CSRF (verifyCsrf), input validation (zod), output encoding, audit logging.',
      'Never weaken existing checks. Never log or commit secrets. Reject any change that would broaden attack surface.',
      'When auditing, output a numbered list of findings ordered by severity.',
    ].join('\n'),
    sortOrder: 40,
  },
  {
    slug: 'database-expert',
    name: 'Doris',
    role: 'Database Expert',
    expertise: ['database', 'prisma', 'sqlite', 'schema', 'migrations', 'indexes'],
    description: 'Prisma schema, migrations, query performance, indexes.',
    systemPrompt: [
      'You are Doris, a Database Expert working with Prisma + SQLite.',
      'For schema changes: modify `prisma/schema.prisma`, run `prisma db push` for dev or generate a migration for prod, never edit the SQLite file directly.',
      'Add appropriate indexes for any new query patterns. Prefer additive changes (new optional columns) over destructive ones.',
      'Document any backfill required in your summary.',
    ].join('\n'),
    sortOrder: 50,
  },
];

interface ProjectSeed {
  slug: string;
  name: string;
  description: string;
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  workingBranch: string;
  allowWrite: boolean;
  icon?: string;
  color?: string;
  sortOrder: number;
}

const PROJECTS: ProjectSeed[] = [
  {
    slug: 'lepoder-portal',
    name: 'LEPODER Portal',
    description: 'This portal — the unified command center.',
    repoUrl: 'https://github.com/sebastienlepoder/Seb-Portal',
    repoOwner: 'sebastienlepoder',
    repoName: 'Seb-Portal',
    workingBranch: 'main',
    allowWrite: false, // start read-only; flip in admin UI when ready
    icon: '🛡️',
    color: '#7c3aed',
    sortOrder: 0,
  },
  {
    slug: 'amonis-finance',
    name: 'Amonis Finance',
    description: 'Personal finance app with iOS/macOS clients.',
    repoUrl: 'https://github.com/sebastienlepoder/amonis',
    repoOwner: 'sebastienlepoder',
    repoName: 'amonis',
    workingBranch: 'main',
    allowWrite: false,
    icon: '💰',
    color: '#10b981',
    sortOrder: 10,
  },
  {
    slug: 'b2d',
    name: 'b2d',
    description: 'b2d internal app.',
    repoUrl: 'https://github.com/sebastienlepoder/b2d',
    repoOwner: 'sebastienlepoder',
    repoName: 'b2d',
    workingBranch: 'main',
    allowWrite: false,
    icon: '⚙️',
    color: '#f59e0b',
    sortOrder: 20,
  },
];

async function main() {
  console.log('[seed-agents] Upserting AgentProfiles…');
  for (const a of AGENTS) {
    await prisma.agentProfile.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        name: a.name,
        role: a.role,
        expertise: JSON.stringify(a.expertise),
        description: a.description,
        systemPrompt: a.systemPrompt,
        model: a.model ?? null,
        sortOrder: a.sortOrder,
      },
      update: {
        name: a.name,
        role: a.role,
        expertise: JSON.stringify(a.expertise),
        description: a.description,
        // do NOT overwrite systemPrompt on re-seed — admin may have customized it
      },
    });
    console.log(`  ✓ ${a.slug}  (${a.role})`);
  }

  console.log('[seed-agents] Upserting Projects…');
  for (const p of PROJECTS) {
    await prisma.project.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        name: p.name,
        description: p.description,
        repoUrl: p.repoUrl,
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        workingBranch: p.workingBranch,
        allowWrite: p.allowWrite,
        icon: p.icon,
        color: p.color,
        sortOrder: p.sortOrder,
      },
      update: {
        // refresh fields that are safe to refresh
        name: p.name,
        description: p.description,
        repoUrl: p.repoUrl,
        repoOwner: p.repoOwner,
        repoName: p.repoName,
        // preserve allowWrite, workingBranch, icon, color — admin may have tuned them
      },
    });
    console.log(`  ✓ ${p.slug}  (${p.repoOwner}/${p.repoName})`);
  }

  console.log('[seed-agents] Done.');
}

main()
  .catch((e) => {
    console.error('[seed-agents] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
