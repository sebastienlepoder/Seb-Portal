// In-memory sliding window rate limiter
// For production at scale, swap for Redis-backed implementation

interface RateLimitEntry {
  timestamps: number[];
}

const stores: Record<string, Map<string, RateLimitEntry>> = {};

function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores[name]) stores[name] = new Map();
  return stores[name];
}

export interface RateLimitConfig {
  /** Store name (e.g., 'login_ip', 'login_account') */
  name: string;
  /** Max attempts in the window */
  max: number;
  /** Window in seconds */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec?: number;
}

export function checkRateLimit(config: RateLimitConfig, key: string): RateLimitResult {
  const store = getStore(config.name);
  const now = Date.now();
  const windowMs = config.windowSec * 1000;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= config.max) {
    const oldest = entry.timestamps[0]!;
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: config.max - entry.timestamps.length };
}

// Pre-configured limiters
export const loginIpLimiter: RateLimitConfig = {
  name: 'login_ip',
  max: 10,
  windowSec: 300, // 10 attempts per 5 min per IP
};

export const loginAccountLimiter: RateLimitConfig = {
  name: 'login_account',
  max: 5,
  windowSec: 300, // 5 attempts per 5 min per account
};

export const apiLimiter: RateLimitConfig = {
  name: 'api_general',
  max: 100,
  windowSec: 60, // 100 req/min
};

export const aiChatLimiter: RateLimitConfig = {
  name: 'ai_chat',
  max: 20,
  windowSec: 60, // 20 AI requests/min per user
};

export const webhookLimiter: RateLimitConfig = {
  name: 'webhook',
  max: 30,
  windowSec: 60,
};

// Cleanup stale entries periodically.
// .unref() so the interval doesn't keep the Node process (or HMR worker) alive.
const cleanupInterval = setInterval(() => {
  for (const storeName of Object.keys(stores)) {
    const store = stores[storeName]!;
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < 600_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }
}, 60_000);
cleanupInterval.unref?.();
