import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import prisma from '../db';
import { scanText, type ScanReport, type SecurityRule } from '../security/scan';
import { INJECTION_RULES } from '../security/injection-guard';
import { scanForSecrets } from '../security/secret-scanner';

/**
 * The skills/ directory at the project root is the canonical source
 * of truth for installed skills. Each .md file is one skill. The DB
 * rows are derived metadata + cached scan reports.
 *
 * Override the location with PORTAL_SKILLS_DIR if you mount skills
 * from a different volume.
 */
function skillsDir(): string {
  return process.env.PORTAL_SKILLS_DIR
    ? path.resolve(process.env.PORTAL_SKILLS_DIR)
    : path.resolve(process.cwd(), 'skills');
}

const ALL_RULES: SecurityRule[] = INJECTION_RULES;

export interface SyncResult {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
  rejected: number;
  warnings: number;
}

export async function syncSkillsFromDisk(): Promise<SyncResult> {
  const dir = skillsDir();
  await fs.mkdir(dir, { recursive: true });

  const onDisk = await listSkillFiles(dir);
  const result: SyncResult = { scanned: 0, added: 0, updated: 0, removed: 0, rejected: 0, warnings: 0 };

  const existingRows = await prisma.skill.findMany({ where: { source: 'local' } });
  const existingByName = new Map(existingRows.map((r) => [r.name, r]));
  const seenNames = new Set<string>();

  for (const file of onDisk) {
    const name = path.basename(file, '.md');
    seenNames.add(name);
    result.scanned += 1;

    const buf = await fs.readFile(file);
    const contentHash = sha256(buf);
    const existing = existingByName.get(name);

    // Unchanged file → keep the cached scan, only refresh updatedAt.
    if (existing && existing.contentHash === contentHash) {
      continue;
    }

    const text = buf.toString('utf8');
    const description = extractDescription(text);
    const report = scanSkill(text);

    if (report.status === 'rejected') result.rejected += 1;
    if (report.status === 'warning') result.warnings += 1;

    const relPath = path.relative(process.cwd(), file);

    if (existing) {
      await prisma.skill.update({
        where: { id: existing.id },
        data: {
          filePath: relPath,
          description,
          contentHash,
          securityStatus: report.status,
          securityReport: JSON.stringify(report),
          lastScannedAt: new Date(),
          // If the freshly scanned content turned out rejected, force-disable.
          enabled: report.status === 'rejected' ? false : existing.enabled,
        },
      });
      result.updated += 1;
    } else {
      await prisma.skill.create({
        data: {
          source: 'local',
          name,
          filePath: relPath,
          description,
          contentHash,
          securityStatus: report.status,
          securityReport: JSON.stringify(report),
          lastScannedAt: new Date(),
          enabled: false,
        },
      });
      result.added += 1;
    }
  }

  // Drop rows whose file disappeared. Keep the audit by re-syncing
  // is cheap, and unused rows would clutter the UI.
  for (const row of existingRows) {
    if (!seenNames.has(row.name)) {
      await prisma.skill.delete({ where: { id: row.id } });
      result.removed += 1;
    }
  }

  return result;
}

export function scanSkill(content: string): ScanReport {
  const baseReport = scanText(content, ALL_RULES);

  // Layer secret-scanner findings on top — any leaked credential
  // promotes the status to at least "warning".
  const secrets = scanForSecrets(content);
  if (secrets.length > 0) {
    const secretMatches = secrets.map((s) => ({
      rule: `secret:${s.rule}`,
      severity: 'warning' as const,
      description: `Possible ${s.rule} in skill content (${s.preview})`,
      snippet: s.preview,
      source: 'raw' as const,
    }));
    return {
      status:
        baseReport.status === 'rejected'
          ? 'rejected'
          : baseReport.status === 'warning'
          ? 'warning'
          : 'warning',
      matches: [...baseReport.matches, ...secretMatches],
    };
  }

  return baseReport;
}

async function listSkillFiles(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out.sort();
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function extractDescription(text: string): string | null {
  // First non-empty, non-heading line.
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('---')) continue;
    return line.slice(0, 280);
  }
  return null;
}
