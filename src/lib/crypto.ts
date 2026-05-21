import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ONEPASSWORD_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'No encryption secret available: set ONEPASSWORD_ENCRYPTION_KEY or AUTH_SECRET'
    );
  }
  cachedKey = scryptSync(secret, 'lepoder-portal-1password-v1', 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(params: {
  ciphertext: string;
  iv: string;
  tag: string;
}): string {
  const iv = Buffer.from(params.iv, 'base64');
  const tag = Buffer.from(params.tag, 'base64');
  const ciphertext = Buffer.from(params.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}
