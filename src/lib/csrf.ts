import { randomBytes, createHmac } from 'crypto';
import { getSession } from './auth';

const CSRF_SECRET = process.env.CSRF_SECRET || process.env.AUTH_SECRET || 'csrf-fallback-secret';

export function generateCsrfToken(): string {
  const nonce = randomBytes(16).toString('hex');
  const hmac = createHmac('sha256', CSRF_SECRET).update(nonce).digest('hex');
  return `${nonce}.${hmac}`;
}

export function validateCsrfToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [nonce, providedHmac] = parts;
  const expectedHmac = createHmac('sha256', CSRF_SECRET).update(nonce!).digest('hex');
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
