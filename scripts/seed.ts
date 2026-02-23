#!/usr/bin/env npx tsx
/**
 * LEPODER Portal — Database seed script
 * Runs bootstrap: creates admin user + syncs config.
 *
 * Usage: npx tsx scripts/seed.ts
 */

import { PrismaClient } from '@prisma/client';

async function main() {
  // Ensure env is loaded
  const { bootstrapApp } = await import('../src/lib/bootstrap');
  await bootstrapApp();
  console.log('[Seed] Bootstrap complete.');
}

main().catch((e) => {
  console.error('[Seed] Error:', e);
  process.exit(1);
});
