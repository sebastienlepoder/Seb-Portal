import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import prisma from './db';
import type { ServiceConfig } from '@/types';

const CONFIG_PATH = join(process.cwd(), 'config', 'services.yaml');

export interface ServicesYaml {
  sections: string[];
  services: ServiceConfig[];
}

export function loadServicesFromFile(): ServicesYaml {
  if (!existsSync(CONFIG_PATH)) {
    console.warn('services.yaml not found at', CONFIG_PATH);
    return { sections: [], services: [] };
  }
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = yaml.load(raw) as ServicesYaml;
  return parsed;
}

export async function syncConfigToDb(): Promise<{ created: number; updated: number }> {
  const config = loadServicesFromFile();
  let created = 0;
  let updated = 0;

  for (const svc of config.services) {
    const existing = await prisma.service.findUnique({ where: { slug: svc.id } });
    const data = {
      slug: svc.id,
      name: svc.name,
      url: svc.url,
      type: svc.type || 'external',
      description: svc.description || null,
      tags: svc.tags ? JSON.stringify(svc.tags) : null,
      category: svc.category || 'Uncategorized',
      section: svc.section || 'General',
      openMode: svc.openMode || 'new_tab',
      requiresVPN: svc.requiresVPN ?? false,
      statusCheckUrl: svc.statusCheckUrl || null,
      favoriteDefault: svc.favoriteDefault ?? false,
      icon: svc.icon || null,
      credentialsHint: svc.credentialsHint || null,
      sortOrder: svc.sortOrder ?? 0,
      enabled: svc.enabled ?? true,
    };

    if (existing) {
      await prisma.service.update({ where: { slug: svc.id }, data });
      updated++;
    } else {
      await prisma.service.create({ data });
      created++;
    }
  }

  return { created, updated };
}

export async function getServicesFromDb() {
  return prisma.service.findMany({
    where: { enabled: true },
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getSections(): Promise<string[]> {
  const services = await prisma.service.findMany({
    where: { enabled: true },
    select: { section: true },
    distinct: ['section'],
    orderBy: { section: 'asc' },
  });
  return services.map((s) => s.section);
}
