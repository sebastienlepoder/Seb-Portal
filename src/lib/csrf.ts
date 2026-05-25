import { randomBytes, createHmac } from 'crypto';
import { getSession } from './auth';

// Validated at first use rather than at module load so `next build` (which
// runs without runtime env vars) doesn't blow up while collecting page data.
function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) throw new Error('CSRF_SECRET env var is required');
  return secret;
}

export function generateCsrfToken(): string {
  const nonce = randomBytes(16).toString('hex');
  const hmac = createHmac('sha256', getCsrfSecret()).update(nonce).digest('hex');
  return `${nonce}.${hmac}`;
}

export function validateCsrfToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, providedHmac] = parts;
  const expectedHmac = createHmac('sha256', getCsrfSecret()).update(nonce!).digest('hex');
  return providedHmac === expectedHmac;
}

export async function ensureCsrfToken(): Promise<string> {
  const session = await getSession();
  if (!session.csrfToken) {
    session.csrfToken = generateCsrfToken();
    await session.save();
  }
  return session.csrfToken;
}

export async function verifyCsrf(request: Request): Promise<boolean> {
  const session = await getSession();
  const headerToken = request.headers.get('x-csrf-token');
  if (!headerToken || !session.csrfToken) return false;
  return headerToken === session.csrfToken && validateCsrfToken(headerToken);
}
