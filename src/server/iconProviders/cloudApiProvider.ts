/**
 * Brand Icon Provider
 * Fetches real brand/favicon icons from public sources.
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

function isPublicDomain(domain: string): boolean {
  return !/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(domain);
}

async function fetchAndSave(sourceUrl: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*'
      },
    });
    
    if (!res.ok) {
      console.log(`[icon] Fetch failed for ${sourceUrl}: ${res.status}`);
      return false;
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.log(`[icon] HTML response for ${sourceUrl}`);
      return false;
    }
    
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      console.log(`[icon] Too small (${buffer.length} bytes) for ${sourceUrl}`);
      return false;
    }
    
    writeFileSync(destPath, buffer);
    console.log(`[icon] Saved ${buffer.length} bytes to ${destPath}`);
    return true;
  } catch (e) {
    console.log(`[icon] Error fetching ${sourceUrl}:`, e);
    return false;
  }
}

export async function generateIconViaApi(req: IconGenRequest): Promise<IconGenResult> {
  const fileSlug = (req.slug || req.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (!existsSync(ICON_DIR)) {
    mkdirSync(ICON_DIR, { recursive: true });
    console.log(`[icon] Created directory: ${ICON_DIR}`);
  }

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
      // Fall through
    }
  }

  if (!req.domain || !isPublicDomain(req.domain)) {
    return { success: false, error: 'No public domain — will use SVG fallback' };
  }

  const domain = req.domain;
  console.log(`[icon] Fetching icon for domain: ${domain}`);

  // Strategy 1: Clearbit Logo API
  const clearbitPath = join(ICON_DIR, `${fileSlug}.png`);
  if (await fetchAndSave(`https://logo.clearbit.com/${domain}`, clearbitPath)) {
    const url = `/icons/generated/${fileSlug}.png`;
    await cacheIcon(fileSlug, clearbitPath, 'clearbit');
    return { success: true, path: clearbitPath, url, provider: 'clearbit' };
  }

  // Strategy 2: Google Favicon API (with redirect)
  const faviconPath = join(ICON_DIR, `${fileSlug}-fav.png`);
  if (await fetchAndSave(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, faviconPath)) {
    const url = `/icons/generated/${fileSlug}-fav.png`;
    await cacheIcon(fileSlug, faviconPath, 'google_favicon');
    return { success: true, path: faviconPath, url, provider: 'google_favicon' };
  }

  // Strategy 3: Try DuckDuckGo favicon
  const ddgPath = join(ICON_DIR, `${fileSlug}-ddg.png`);
  if (await fetchAndSave(`https://icons.duckduckgo.com/ip3/${domain}.ico`, ddgPath)) {
    const url = `/icons/generated/${fileSlug}-ddg.png`;
    await cacheIcon(fileSlug, ddgPath, 'duckduckgo');
    return { success: true, path: ddgPath, url, provider: 'duckduckgo' };
  }

  return { success: false, error: 'No brand icon found for this domain' };
}

async function cacheIcon(key: string, path: string, provider: string) {
  try {
    await prisma.iconCache.upsert({
      where: { key },
      create: { key, path, provider },
      update: { path, provider },
    });
  } catch (e) {
    console.log(`[icon] Cache error:`, e);
  }
}
