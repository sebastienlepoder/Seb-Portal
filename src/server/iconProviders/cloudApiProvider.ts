/**
 * Brand Icon Provider
 * Fetches real brand/favicon icons from public sources.
 *
 * Strategy (in order):
 *  1. Clearbit Logo API  — high-quality PNG logos for well-known brands
 *  2. Google Favicon API — works for almost any public website
 *  3. Falls back to SVG initials (handled by caller)
 *
 * Skips local/private IPs automatically.
 * Optional: ICON_API_URL overrides everything if set.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import prisma from '@/lib/db';

const ICON_DIR = join(process.cwd(), 'public', 'icons', 'generated');

export interface IconGenRequest {
  name: string;
  slug?: string;
  description?: string;
  domain?: string;
}

export interface IconGenResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
  provider?: string;
}

/** Returns true if the domain is a publicly reachable hostname (not LAN/localhost). */
function isPublicDomain(domain: string): boolean {
  return !/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(domain);
}

/** Downloads a URL to a local file. Returns false if the response looks like an error page. */
async function fetchAndSave(sourceUrl: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LePoder-Portal/1.0)' },
    });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    // Reject HTML error pages
    if (contentType.includes('text/html')) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Reject suspiciously small responses (likely error placeholders)
    if (buffer.length < 200) return false;
    writeFileSync(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

export async function generateIconViaApi(req: IconGenRequest): Promise<IconGenResult> {
  const fileSlug = (req.slug || req.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });

  // ── Optional custom API override ──────────────────────────
  const apiUrl = process.env.ICON_API_URL;
  const apiKey = process.env.ICON_API_KEY;
  if (apiUrl) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ name: req.name, description: req.description, domain: req.domain }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('image/')) {
          const ext = contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'webp';
          const filePath = join(ICON_DIR, `${fileSlug}.${ext}`);
          if (contentType.includes('svg')) {
            writeFileSync(filePath, await response.text(), 'utf-8');
          } else {
            writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
          }
          const url = `/icons/generated/${fileSlug}.${ext}`;
          await cacheIcon(fileSlug, filePath, 'custom_api');
          return { success: true, path: filePath, url, provider: 'custom_api' };
        }
        const json = await response.json().catch(() => null);
        if (json?.url) return { success: true, url: json.url, provider: 'custom_api' };
      }
    } catch {
      // Fall through to brand icon fetching
    }
  }

  // ── No public domain → cannot fetch brand icon ────────────
  if (!req.domain || !isPublicDomain(req.domain)) {
    return { success: false, error: 'No public domain — will use SVG fallback' };
  }

  const domain = req.domain;

  // ── Strategy 1: Clearbit Logo API ─────────────────────────
  // Returns high-quality PNG logos for ~1M well-known brands.
  const clearbitPath = join(ICON_DIR, `${fileSlug}.png`);
  if (await fetchAndSave(`https://logo.clearbit.com/${domain}`, clearbitPath)) {
    const url = `/icons/generated/${fileSlug}.png`;
    await cacheIcon(fileSlug, clearbitPath, 'clearbit');
    return { success: true, path: clearbitPath, url, provider: 'clearbit' };
  }

  // ── Strategy 2: Google Favicon API ────────────────────────
  // sz=128 requests a higher-resolution favicon.
  const faviconPath = join(ICON_DIR, `${fileSlug}-fav.png`);
  if (await fetchAndSave(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, faviconPath)) {
    const url = `/icons/generated/${fileSlug}-fav.png`;
    await cacheIcon(fileSlug, faviconPath, 'google_favicon');
    return { success: true, path: faviconPath, url, provider: 'google_favicon' };
  }

  return { success: false, error: 'No brand icon found for this domain' };
}

async function cacheIcon(key: string, path: string, provider: string) {
  await prisma.iconCache.upsert({
    where: { key },
    create: { key, path, provider },
    update: { path, provider },
  });
}
