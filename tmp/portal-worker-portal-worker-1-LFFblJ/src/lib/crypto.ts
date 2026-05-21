import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const SALT = 'lepoder-portal-1password-v1';
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret =
    process.env.ONEPASSWORD_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'Cannot encrypt/decrypt secrets: neither ONEPASSWORD_ENCRYPTION_KEY nor AUTH_SECRET is set.'
    );
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ct = Buffer.from(payload.ciphertext, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString('utf8');
}
