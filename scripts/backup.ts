#!/usr/bin/env npx tsx
/**
 * LEPODER Portal — CLI Backup Script
 *
 * Usage:
 *   npx tsx scripts/backup.ts
 *   npx tsx scripts/backup.ts --output /path/to/backup
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const prisma = new PrismaClient();
  const args = process.argv.slice(2);
  const outputDir = args.includes('--output')
    ? args[args.indexOf('--output') + 1]!
    : join(process.cwd(), 'backups');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(outputDir, `backup-${timestamp}`);

  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  console.log(`[Backup] Starting backup to ${backupDir}`);

  // 1. Export services config
  const services = await prisma.service.findMany({ orderBy: { section: 'asc' } });
  writeFileSync(
    join(backupDir, 'services.json'),
    JSON.stringify(
      services.map((s) => ({ ...s, tags: s.tags ? JSON.parse(s.tags) : [] })),
      null,
      2
    )
  );
  console.log(`[Backup] Exported ${services.length} services`);

  // 2. Export users (no passwords)
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, displayName: true, createdAt: true },
  });
  writeFileSync(join(backupDir, 'users.json'), JSON.stringify(users, null, 2));
  console.log(`[Backup] Exported ${users.length} users`);

  // 3. Export favorites
  const favorites = await prisma.favorite.findMany();
  writeFileSync(join(backupDir, 'favorites.json'), JSON.stringify(favorites, null, 2));

  // 4. Export audit logs (last 90 days)
  const since = new Date(Date.now() - 90 * 86400000);
  const auditLogs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });
  writeFileSync(join(backupDir, 'audit-logs.json'), JSON.stringify(auditLogs, null, 2));
  console.log(`[Backup] Exported ${auditLogs.length} audit logs`);

  // 5. Copy SQLite DB file
  const dbPath = join(process.cwd(), 'data', 'portal.db');
  if (existsSync(dbPath)) {
    copyFileSync(dbPath, join(backupDir, 'portal.db'));
    console.log('[Backup] Copied database file');
  }

  // 6. Export icon metadata
  const iconCache = await prisma.iconCache.findMany();
  writeFileSync(join(backupDir, 'icon-cache.json'), JSON.stringify(iconCache, null, 2));

  console.log(`[Backup] Complete! Files saved to: ${backupDir}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[Backup] Error:', e);
  process.exit(1);
});
