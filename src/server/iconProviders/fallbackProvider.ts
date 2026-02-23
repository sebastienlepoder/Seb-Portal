/**
 * Fallback deterministic SVG icon generator.
 * Produces unique icons from name/description using hash-based colors.
 */

import { createHash } from 'crypto';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/db';

const ICON_DIR = join(process.cwd(), 'public', 'icons', 'generated');

function hashColor(input: string, offset = 0): string {
  const hash = createHash('md5').update(input + offset).digest('hex');
  const h = parseInt(hash.substring(0, 3), 16) % 360;
  const s = 55 + (parseInt(hash.substring(3, 5), 16) % 30);
  const l = 45 + (parseInt(hash.substring(5, 7), 16) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function getInitials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function generateFallbackSvg(name: string, description?: string): string {
  const seed = name + (description || '');
  const bg = hashColor(seed, 0);
  const accent = hashColor(seed, 1);
  const initials = getInitials(name);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${accent};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="24" fill="url(#bg)" />
  <text x="64" y="64" font-family="system-ui, sans-serif" font-size="48" font-weight="700"
    fill="white" text-anchor="middle" dominant-baseline="central" opacity="0.95">
    ${initials}
  </text>
</svg>`;
}

export async function generateAndSaveFallback(
  slug: string,
  name: string,
  description?: string
): Promise<string> {
  if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });
  const svg = generateFallbackSvg(name, description);
  const filePath = join(ICON_DIR, `${slug}.svg`);
  writeFileSync(filePath, svg, 'utf-8');

  await prisma.iconCache.upsert({
    where: { key: slug },
    create: { key: slug, path: filePath, provider: 'fallback' },
    update: { path: filePath, provider: 'fallback' },
  });

  return `/icons/generated/${slug}.svg`;
}
