/**
 * Multi-pass scanner harness. Each rule is run against the raw
 * text, a normalized form (homoglyphs + zero-width chars stripped),
 * and a few decoded forms (URL, base64, ROT13). Matches from any
 * pass are aggregated; the worst severity wins.
 */

export type Severity = 'info' | 'warning' | 'critical';

export interface SecurityRule {
  rule: string;
  severity: Severity;
  description?: string;
  pattern: RegExp;
}

export interface ScanMatch {
  rule: string;
  severity: Severity;
  description?: string;
  snippet: string;
  source: 'raw' | 'normalized' | 'decoded';
}

export interface ScanReport {
  status: 'clean' | 'warning' | 'rejected';
  matches: ScanMatch[];
}

const SNIPPET_RADIUS = 40;
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const HOMOGLYPHS: Record<string, string> = {
  // Latin/Cyrillic confusables — minimal set, covers the common evasions.
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
  'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C',
  'Х': 'X', 'І': 'I',
  // Fullwidth digits / letters
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
};

export function normalize(text: string): string {
  let out = text.replace(ZERO_WIDTH, '');
  out = Array.from(out)
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join('');
  return out;
}

/**
 * Attempt a few cheap decodings. Returns a list of strings to scan
 * in addition to the original. We don't try to be clever about
 * detecting WHAT was encoded — we just try each and run the rules.
 */
export function decodings(text: string): string[] {
  const out: string[] = [];

  try {
    const url = decodeURIComponent(text);
    if (url !== text) out.push(url);
  } catch { /* malformed % escapes */ }

  // ROT13
  out.push(rot13(text));

  // Base64 — pull out long-ish base64-looking tokens and decode each.
  const b64Tokens = text.match(/[A-Za-z0-9+/]{40,}={0,2}/g) ?? [];
  for (const tok of b64Tokens.slice(0, 5)) {
    try {
      const decoded = Buffer.from(tok, 'base64').toString('utf8');
      if (decoded && /[ -~]/.test(decoded)) out.push(decoded);
    } catch { /* not valid base64 */ }
  }

  return out;
}

function rot13(s: string): string {
  return s.replace(/[A-Za-z]/g, (c) => {
    const code = c.charCodeAt(0);
    const base = code <= 90 ? 65 : 97;
    return String.fromCharCode(((code - base + 13) % 26) + base);
  });
}

export function scanText(text: string, rules: SecurityRule[]): ScanReport {
  const matches: ScanMatch[] = [];

  const runRules = (source: 'raw' | 'normalized' | 'decoded', body: string) => {
    for (const rule of rules) {
      // Re-create the regex so its lastIndex doesn't bleed between passes.
      const re = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', '') + (rule.pattern.flags.includes('g') ? 'g' : ''));
      let m: RegExpExecArray | null = re.exec(body);
      if (!m) continue;
      do {
        matches.push({
          rule: rule.rule,
          severity: rule.severity,
          description: rule.description,
          snippet: extractSnippet(body, m.index, m[0].length),
          source,
        });
        if (!re.global) break;
        m = re.exec(body);
      } while (m);
    }
  };

  runRules('raw', text);
  const norm = normalize(text);
  if (norm !== text) runRules('normalized', norm);
  for (const decoded of decodings(text)) runRules('decoded', decoded);

  const deduped = dedupe(matches);

  const status = deduped.some((m) => m.severity === 'critical')
    ? 'rejected'
    : deduped.some((m) => m.severity === 'warning')
    ? 'warning'
    : 'clean';

  return { status, matches: deduped };
}

function extractSnippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  let s = text.slice(start, end);
  if (start > 0) s = '…' + s;
  if (end < text.length) s = s + '…';
  return s.replace(/\s+/g, ' ').slice(0, 200);
}

function dedupe(matches: ScanMatch[]): ScanMatch[] {
  const seen = new Map<string, ScanMatch>();
  for (const m of matches) {
    const key = `${m.rule}:${m.snippet.slice(0, 60)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, m);
      continue;
    }
    // Prefer raw > normalized > decoded for reporting clarity.
    const rank = { raw: 0, normalized: 1, decoded: 2 } as const;
    if (rank[m.source] < rank[existing.source]) seen.set(key, m);
  }
  return Array.from(seen.values());
}
