/**
 * Pure-regex secret scanner. Used to sanitise inputs/results before
 * persisting them to McpCallLog and (Phase 4) to gate skill installs.
 *
 * Pattern list adapted from common public secret-detection rule sets
 * (truffleHog, gitleaks). Best-effort: false negatives are possible
 * for novel secret formats. Designed to be conservative — when a
 * pattern matches we redact rather than refuse, so we never crash a
 * tool call on a false positive.
 */

export interface SecretRule {
  name: string;
  pattern: RegExp;
}

export const SECRET_RULES: SecretRule[] = [
  { name: 'aws-access-key',       pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'aws-secret',           pattern: /\b(?:aws_secret_access_key|aws_secret)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi },
  { name: 'github-classic-pat',   pattern: /\bghp_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-fine-grained',  pattern: /\bgithub_pat_[A-Za-z0-9_]{82,}\b/g },
  { name: 'github-oauth',         pattern: /\bgho_[A-Za-z0-9]{36,}\b/g },
  { name: 'github-app',           pattern: /\b(?:ghu_|ghs_|ghr_)[A-Za-z0-9]{36,}\b/g },
  { name: 'stripe-live',          pattern: /\b(?:sk|rk|pk)_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'stripe-test',          pattern: /\b(?:sk|rk|pk)_test_[A-Za-z0-9]{20,}\b/g },
  { name: 'anthropic',            pattern: /\bsk-ant-(?:api|admin)\d+-[A-Za-z0-9_\-]{40,}\b/g },
  { name: 'openai',               pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_\-]{20,}T3BlbkFJ[A-Za-z0-9_\-]+\b/g },
  { name: 'openai-generic',       pattern: /\bsk-[A-Za-z0-9]{48,}\b/g },
  { name: 'slack-token',          pattern: /\bxox[abprs]-[A-Za-z0-9\-]{10,}\b/g },
  { name: 'slack-webhook',        pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g },
  { name: 'discord-webhook',      pattern: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]{40,}/g },
  { name: 'twilio-sid',           pattern: /\bSK[0-9a-fA-F]{32}\b/g },
  { name: 'sendgrid',             pattern: /\bSG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}\b/g },
  { name: 'mailgun',              pattern: /\bkey-[0-9a-f]{32}\b/g },
  { name: 'gcp-service-account',  pattern: /"type"\s*:\s*"service_account"[\s\S]{0,200}"private_key"\s*:\s*"-----BEGIN/g },
  { name: 'azure-storage',        pattern: /DefaultEndpointsProtocol=https?;AccountName=[A-Za-z0-9]+;AccountKey=[A-Za-z0-9+/=]+/g },
  { name: 'pem-private-key',      pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP |)PRIVATE KEY-----/g },
  { name: 'jwt',                  pattern: /\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g },
  { name: 'db-postgres-url',      pattern: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g },
  { name: 'db-mysql-url',         pattern: /\bmysql:\/\/[^:\s]+:[^@\s]+@[^\s]+/g },
  { name: 'db-mongodb-url',       pattern: /\bmongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\s]+/g },
  { name: 'generic-bearer',       pattern: /\b(?:Bearer|Authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-\.]{20,}['"]?/gi },
];

export interface SecretMatch {
  rule: string;
  preview: string;
}

/**
 * Replace every secret occurrence in `text` with a redaction marker
 * that preserves the rule name (so the audit log shows WHAT was
 * scrubbed without exposing the value).
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const rule of SECRET_RULES) {
    out = out.replace(rule.pattern, () => `[REDACTED:${rule.name}]`);
  }
  return out;
}

/**
 * Return every match found, with a short preview (first/last 3 chars).
 * Use when you need to flag rather than redact — e.g. Phase 4 skill scan.
 */
export function scanForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const rule of SECRET_RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[0];
      const preview =
        value.length <= 8 ? '***' : `${value.slice(0, 3)}…${value.slice(-3)}`;
      matches.push({ rule: rule.name, preview });
      if (!re.global) break;
    }
  }
  return matches;
}

/** Deep-walk an object and redact secrets in every string leaf. */
export function redactSecretsInObject<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsInObject(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSecretsInObject(v);
    }
    return out as unknown as T;
  }
  return value;
}
