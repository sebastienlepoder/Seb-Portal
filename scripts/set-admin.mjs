import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EMAIL = 'sebastien@lepoder.com';
const PASSWORD = '*/54Medford';

const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

// Upsert: update if exists, create if not
const existing = await prisma.user.findUnique({ where: { email: EMAIL } });

if (existing) {
  await prisma.user.update({
    where: { email: EMAIL },
    data: { passwordHash: hash, role: 'admin' },
  });
  console.log('Updated password for', EMAIL);
} else {
  await prisma.user.create({
    data: { email: EMAIL, passwordHash: hash, role: 'admin', displayName: 'Sebastien' },
  });
  console.log('Created admin user', EMAIL);
}

// Also delete the old placeholder account if it exists
const old = await prisma.user.findUnique({ where: { email: 'admin@lepoder.com' } });
if (old && old.email !== EMAIL) {
  await prisma.user.delete({ where: { email: 'admin@lepoder.com' } });
  console.log('Removed old admin@lepoder.com account');
}

await prisma.$disconnect();
