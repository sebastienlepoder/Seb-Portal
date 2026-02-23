/**
 * Cloud API Icon Provider
 * Calls external icon generation API and caches results.
 *
 * Env: ICON_API_URL, ICON_API_KEY
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/db';

const ICON_DIR = join(process.cwd(), 'public', 'icons', 'generated');

export interface IconGenRequest {
  name: string;
  description?: string;
  domain?: string;
  style?: 'flat' | 'gradient' | 'outlined';
  size?: number;
}

export interface IconGenResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

export async function generateIconViaApi(req: IconGenRequest): Promise<IconGenResult> {
  const apiUrl = process.env.ICON_API_URL;
  const apiKey = process.env.ICON_API_KEY;

  if (!apiUrl) {
    return { success: false, error: 'ICON_API_URL not configured' };
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        name: req.name,
        description: req.description,
        domain: req.domain,
        style: req.style || 'flat',
        size: req.size || 128,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { success: false, error: `API returned ${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    const slug = req.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

    if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });

    if (contentType.includes('image/svg') || contentType.includes('text/xml')) {
      const svg = await response.text();
      const filePath = join(ICON_DIR, `${slug}.svg`);
      writeFileSync(filePath, svg, 'utf-8');
      const url = `/icons/generated/${slug}.svg`;
      await cacheIcon(slug, filePath, 'cloud_api');
      return { success: true, path: filePath, url };
    }

    if (contentType.includes('image/png') || contentType.includes('image/')) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = contentType.includes('png') ? 'png' : 'webp';
      const filePath = join(ICON_DIR, `${slug}.${ext}`);
      writeFileSync(filePath, buffer);
      const url = `/icons/generated/${slug}.${ext}`;
      await cacheIcon(slug, filePath, 'cloud_api');
      return { success: true, path: filePath, url };
    }

    // Try JSON response with URL
    const json = await response.json();
    if (json.url) {
      return { success: true, url: json.url };
    }

    return { success: false, error: 'Unexpected API response format' };
  } catch (e) {
    return { success: false, error: `API error: ${(e as Error).message}` };
  }
}

async function cacheIcon(key: string, path: string, provider: string) {
  await prisma.iconCache.upsert({
    where: { key },
    create: { key, path, provider },
    update: { path, provider },
  });
}
