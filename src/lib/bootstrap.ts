import prisma from './db';
import { hashPassword } from './password';
import { syncConfigToDb } from './config';

let bootstrapped = false;

export async function bootstrapApp() {
  if (bootstrapped) return;
  bootstrapped = true;

  console.log('[Bootstrap] Starting portal initialization...');

  // 1. Admin user bootstrap
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const passwordHash = await hashPassword(adminPassword);
      const totpSecret = process.env.ADMIN_TOTP_SECRET || null;
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          role: 'admin',
          displayName: 'Admin',
          totpSecret,
          totpEnabled: !!totpSecret,
        },
      });
      console.log(`[Bootstrap] Admin user created: ${adminEmail}`);
    } else {
      console.log('[Bootstrap] Admin user already exists, skipping.');
    }
  }

  // 2. Sync services config to DB
  try {
    const result = await syncConfigToDb();
    console.log(`[Bootstrap] Services synced: ${result.created} created, ${result.updated} updated`);
  } catch (e) {
    console.error('[Bootstrap] Failed to sync services config:', e);
  }

  // 3. Initialize default app settings
  const defaults: Record<string, string> = {
    bootstrapped: 'true',
    vpn_healthcheck_mode: process.env.VPN_HEALTHCHECK_MODE || 'ping_url',
    report_retention_days: process.env.REPORT_RETENTION_DAYS || '90',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  console.log('[Bootstrap] Portal initialization complete.');
}
