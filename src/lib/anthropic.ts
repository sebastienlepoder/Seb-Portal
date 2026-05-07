import Anthropic from '@anthropic-ai/sdk';

/**
 * Returns a configured Anthropic SDK client, or null if no API key is set.
 *
 * Honors ANTHROPIC_BASE_URL so the same code can talk to api.anthropic.com,
 * a self-hosted Anthropic-compatible proxy (e.g. Meridian bridging a Claude
 * Max subscription), or any other compatible gateway. Only the base URL and
 * key change — model IDs and request shape stay the standard SDK ones.
 */
export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  return new Anthropic(baseURL ? { apiKey, baseURL } : { apiKey });
}

/** Default model IDs used across the app. Override per-call when you need a specific tier. */
export const ANTHROPIC_MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
} as const;
