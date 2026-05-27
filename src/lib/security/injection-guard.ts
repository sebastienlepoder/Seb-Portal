import type { SecurityRule } from './scan';

/**
 * Prompt-injection / role-reassignment / safety-bypass patterns.
 * Lifted from common public rule sets and adapted. Each rule is
 * intentionally narrow — the multi-pass scanner runs them against
 * raw + normalized + decoded text, so we don't have to encode
 * every evasion variant in the regex itself.
 */
export const INJECTION_RULES: SecurityRule[] = [
  // ── Prompt override
  {
    rule: 'prompt-override',
    severity: 'critical',
    description: 'Attempt to discard previous instructions.',
    pattern: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules?)/i,
  },
  {
    rule: 'prompt-reset',
    severity: 'critical',
    description: 'Attempt to clear the system context.',
    pattern: /\b(?:reset|clear|wipe|erase)\s+(?:your\s+)?(?:memory|context|history|instructions?)/i,
  },

  // ── Role reassignment
  {
    rule: 'role-reassign-evil',
    severity: 'critical',
    description: 'Tries to switch the assistant into an unrestricted persona.',
    pattern: /\byou\s+are\s+(?:now\s+)?(?:a|an)\s+(?:evil|unrestricted|jailbroken|uncensored|dan|developer\s+mode|god\s+mode)/i,
  },
  {
    rule: 'role-reassign-pretend',
    severity: 'warning',
    description: 'Pretend-to-be persona switching.',
    pattern: /\b(?:pretend|act|behave|roleplay)\s+(?:to\s+be|as)\s+(?:a|an)?\s*(?:hacker|attacker|jailbroken|unrestricted|evil)/i,
  },

  // ── Safety bypass
  {
    rule: 'safety-bypass-explicit',
    severity: 'critical',
    description: 'Explicit request to bypass safety / guidelines.',
    pattern: /\b(?:bypass|circumvent|disable|turn\s+off|ignore)\s+(?:your\s+)?(?:safety|content\s+policy|guidelines?|filters?|restrictions?)/i,
  },
  {
    rule: 'safety-bypass-jailbreak',
    severity: 'critical',
    description: 'Known jailbreak vocabulary.',
    pattern: /\b(?:do\s+anything\s+now|dan\s+mode|jailbreak|jail\s*break)\b/i,
  },

  // ── Delimiter / fence escape
  {
    rule: 'delimiter-escape',
    severity: 'warning',
    description: 'Fake end-of-system markers that try to break out of the system prompt.',
    pattern: /<\/?(?:system|instructions?|prompt|user|assistant)>|\[\/?(?:system|instructions?|prompt|user|assistant)\]/i,
  },

  // ── Hidden instructions
  {
    rule: 'hidden-html-instruction',
    severity: 'warning',
    description: 'Instruction smuggled into an HTML comment.',
    pattern: /<!--[\s\S]{0,400}?(?:ignore|override|bypass|inject|execute|system|instructions?)[\s\S]{0,400}?-->/i,
  },
  {
    rule: 'hidden-spoiler-instruction',
    severity: 'warning',
    description: 'Instruction smuggled inside a Markdown spoiler / details block.',
    pattern: /(?:<details>|\|\|)[\s\S]{0,400}?(?:ignore|override|bypass|system\s+prompt)[\s\S]{0,400}?(?:<\/details>|\|\|)/i,
  },

  // ── Prompt extraction
  {
    rule: 'prompt-extraction',
    severity: 'warning',
    description: 'Tries to dump the system prompt or hidden context.',
    pattern: /\b(?:print|reveal|show|repeat|output|dump|leak)\s+(?:your\s+|the\s+)?(?:system\s+prompt|instructions?|hidden\s+context|secret|api\s+key)/i,
  },

  // ── Shell exec inside fenced blocks
  {
    rule: 'shell-exec-rm-rf',
    severity: 'critical',
    description: 'rm -rf inside a shell-fenced code block.',
    pattern: /```(?:bash|sh|zsh)\s*\n[\s\S]{0,400}\brm\s+-rf?\s+\/[^`]*```/i,
  },
  {
    rule: 'shell-exec-pipe-curl',
    severity: 'critical',
    description: 'curl | bash style remote execution.',
    pattern: /\bcurl\s+(?:-[A-Za-z]+\s+)*['"]?https?:\/\/[^|`'"]+['"]?\s*\|\s*(?:bash|sh|zsh)\b/i,
  },
  {
    rule: 'shell-exec-eval',
    severity: 'critical',
    description: 'eval/exec on remote content.',
    pattern: /\b(?:eval|exec)\s*\(\s*(?:fetch|require|Function|atob)\b/i,
  },

  // ── Path traversal / SSRF
  {
    rule: 'path-traversal',
    severity: 'critical',
    description: 'Repeated ../ or %2e%2e/ sequences.',
    pattern: /(?:\.\.\/){3,}|(?:%2e%2e(?:%2f|\/)){3,}/i,
  },
  {
    rule: 'ssrf-internal',
    severity: 'critical',
    description: 'Outbound request to private network range.',
    pattern: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)\b/i,
  },
  {
    rule: 'ssrf-metadata',
    severity: 'critical',
    description: 'Cloud-metadata endpoint.',
    pattern: /(?:169\.254\.169\.254|metadata\.google\.internal|fd00:ec2::254|metadata\.azure\.com)/i,
  },

  // ── Obfuscation
  {
    rule: 'obfuscation-base64-decode',
    severity: 'warning',
    description: 'Runtime base64 decode of a string literal — often used to hide intent.',
    pattern: /\b(?:atob|Buffer\.from)\s*\(\s*['"][A-Za-z0-9+/=]{40,}['"]/,
  },
  {
    rule: 'obfuscation-hex-escapes',
    severity: 'warning',
    description: 'Long sequence of \\xNN hex-escape literals.',
    pattern: /(?:\\x[0-9a-f]{2}){10,}/i,
  },
];
