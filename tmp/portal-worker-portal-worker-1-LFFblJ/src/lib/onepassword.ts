import prisma from './db';
import { decryptSecret } from './crypto';

const REQUEST_TIMEOUT_MS = 10_000;

export interface OPVault {
  id: string;
  name: string;
  description?: string;
}

export interface OPItemSummary {
  id: string;
  title: string;
  category: string;
}

export interface OPField {
  id?: string;
  label?: string;
  type?: string;
  purpose?: string;
  value?: string;
}

export interface OPItem {
  id: string;
  title: string;
  category: string;
  vault?: { id: string };
  fields?: OPField[];
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  vaultCount?: number;
}

function trimHost(host: string): string {
  return host.replace(/\/+$/, '');
}

async function opFetch<T>(
  host: string,
  token: string,
  path: string
): Promise<T> {
  const url = `${trimHost(host)}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(
      `1Password Connect request failed (${path}): ${(e as Error).message}`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const snippet = body.slice(0, 240).replace(/\s+/g, ' ');
    throw new Error(
      `1Password Connect ${res.status} on ${path}: ${snippet || res.statusText}`
    );
  }
  return (await res.json()) as T;
}

export async function getConnection() {
  return prisma.onePasswordConnection.findUnique({ where: { slug: 'default' } });
}

async function loadCredentials(): Promise<{ host: string; token: string; defaultVaultId: string | null }> {
  const conn = await getConnection();
  if (!conn) {
    throw new Error('1Password Connect is not configured');
  }
  const token = decryptSecret({
    ciphertext: conn.encryptedToken,
    iv: conn.tokenIv,
    tag: conn.tokenTag,
  });
  return { host: conn.connectHost, token, defaultVaultId: conn.defaultVaultId };
}

export async function testConnection(
  host: string,
  token: string
): Promise<TestConnectionResult> {
  try {
    const vaults = await opFetch<OPVault[]>(host, token, '/v1/vaults');
    return {
      ok: true,
      message: `Connected — ${vaults.length} vault(s) visible`,
      vaultCount: vaults.length,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function listVaults(): Promise<OPVault[]> {
  const { host, token } = await loadCredentials();
  const raw = await opFetch<Array<OPVault & Record<string, unknown>>>(
    host,
    token,
    '/v1/vaults'
  );
  return raw.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
  }));
}

export async function listItems(vaultId: string): Promise<OPItemSummary[]> {
  const { host, token } = await loadCredentials();
  const raw = await opFetch<Array<OPItemSummary & Record<string, unknown>>>(
    host,
    token,
    `/v1/vaults/${encodeURIComponent(vaultId)}/items`
  );
  return raw.map((i) => ({ id: i.id, title: i.title, category: i.category }));
}

export async function getItem(vaultId: string, itemId: string): Promise<OPItem> {
  const { host, token } = await loadCredentials();
  return opFetch<OPItem>(
    host,
    token,
    `/v1/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}`
  );
}

export async function resolveSecret(
  vaultId: string,
  itemId: string,
  fieldLabel: string
): Promise<string> {
  const item = await getItem(vaultId, itemId);
  const target = fieldLabel.toLowerCase();
  const field = item.fields?.find(
    (f) => (f.label || '').toLowerCase() === target
  );
  if (!field || typeof field.value !== 'string' || field.value.length === 0) {
    throw new Error(
      `1Password field "${fieldLabel}" not found (or empty) on item ${itemId}`
    );
  }
  return field.value;
}
