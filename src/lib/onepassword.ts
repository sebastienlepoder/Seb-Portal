import prisma from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

const REQUEST_TIMEOUT_MS = 10_000;

type ConnectField = {
  id?: string;
  label?: string;
  value?: string;
  type?: string;
};

type ConnectItem = {
  id: string;
  title: string;
  category: string;
  fields?: ConnectField[];
};

type ConnectVault = {
  id: string;
  name: string;
  description?: string;
};

async function connectFetch(
  host: string,
  token: string,
  path: string
): Promise<unknown> {
  const url = `${host}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`1Password Connect request failed: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `1Password Connect ${res.status}: ${body.slice(0, 200)}`
    );
  }
  return res.json();
}

export async function getConnection() {
  return prisma.onePasswordConnection.findUnique({ where: { slug: 'default' } });
}

async function loadHostAndToken(): Promise<{ host: string; token: string; defaultVaultId: string | null }> {
  const conn = await getConnection();
  if (!conn) throw new Error('No 1Password connection configured');
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
): Promise<{ ok: boolean; message: string; vaultCount?: number }> {
  try {
    const data = await connectFetch(host, token, '/v1/vaults');
    if (!Array.isArray(data)) {
      return { ok: false, message: 'Unexpected response from /v1/vaults (not an array)' };
    }
    return { ok: true, message: 'Connection successful', vaultCount: data.length };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function listVaults(): Promise<ConnectVault[]> {
  const { host, token } = await loadHostAndToken();
  const data = (await connectFetch(host, token, '/v1/vaults')) as ConnectVault[];
  return data.map((v) => ({ id: v.id, name: v.name, description: v.description }));
}

export async function listItems(
  vaultId: string
): Promise<{ id: string; title: string; category: string }[]> {
  const { host, token } = await loadHostAndToken();
  const data = (await connectFetch(
    host,
    token,
    `/v1/vaults/${encodeURIComponent(vaultId)}/items`
  )) as ConnectItem[];
  return data.map((i) => ({ id: i.id, title: i.title, category: i.category }));
}

export async function getItem(
  vaultId: string,
  itemId: string
): Promise<{
  id: string;
  title: string;
  category: string;
  fields: ConnectField[];
}> {
  const { host, token } = await loadHostAndToken();
  const data = (await connectFetch(
    host,
    token,
    `/v1/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}`
  )) as ConnectItem;
  return {
    id: data.id,
    title: data.title,
    category: data.category,
    fields: (data.fields ?? []).map((f) => ({
      id: f.id,
      label: f.label ?? '',
      value: f.value,
      type: f.type,
    })),
  };
}

export async function resolveSecret(
  vaultId: string,
  itemId: string,
  fieldLabel: string
): Promise<string> {
  const item = await getItem(vaultId, itemId);
  const target = fieldLabel.toLowerCase();
  const match = item.fields.find((f) => (f.label ?? '').toLowerCase() === target);
  if (!match) {
    throw new Error(`Field "${fieldLabel}" not found in item ${itemId}`);
  }
  if (typeof match.value !== 'string' || match.value.length === 0) {
    throw new Error(`Field "${fieldLabel}" has no value in item ${itemId}`);
  }
  return match.value;
}
