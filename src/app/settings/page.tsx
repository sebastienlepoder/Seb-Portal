'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/usePortal';
import {
  Shield,
  Key,
  QrCode,
  Check,
  X,
  Loader2,
  Download,
  Upload,
  KeyRound,
  Vault,
  Lock,
  Trash2,
  Plus,
} from 'lucide-react';
import { UpdatePanel } from '@/components/admin/UpdatePanel';
import MainSidebar from '@/components/layout/MainSidebar';
import { ThemePicker } from '@/components/ThemePicker';

export default function SettingsPage() {
  const { user, loading, logout } = useAuth();
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpMessage, setTotpMessage] = useState('');

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  const startTotpSetup = async () => {
    const res = await fetch('/api/auth/totp');
    const data = await res.json();
    if (data.ok) {
      setTotpSetup(data.data);
    }
  };

  const enableTotp = async () => {
    if (!totpSetup || !totpCode) return;
    setTotpLoading(true);
    const res = await fetch('/api/auth/totp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
      },
      body: JSON.stringify({ secret: totpSetup.secret, code: totpCode }),
    });
    const data = await res.json();
    setTotpMessage(data.ok ? 'TOTP enabled successfully!' : data.error);
    setTotpLoading(false);
    if (data.ok) setTotpSetup(null);
  };

  const disableTotp = async () => {
    if (!confirm('Disable 2FA? This reduces account security.')) return;
    await fetch('/api/auth/totp', {
      method: 'DELETE',
      headers: {
        ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
      },
    });
    setTotpMessage('TOTP disabled.');
  };

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdmin = user.role?.toLowerCase() === 'admin';

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user!} onLogout={logout} />
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-portal-text mb-6">Settings</h1>

        {/* Profile */}
        <section className="bg-portal-card border border-portal-border rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-portal-text mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-portal-accent" />
            Account
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-portal-muted">Email</span>
              <span className="text-portal-text">{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-portal-muted">Role</span>
              <span className="text-portal-text capitalize">{user.role}</span>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <ThemePicker />

        {/* 2FA */}
        <section className="bg-portal-card border border-portal-border rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-portal-text mb-3 flex items-center gap-2">
            <Key className="h-4 w-4 text-portal-accent" />
            Two-Factor Authentication (TOTP)
          </h2>

          {totpMessage && (
            <div className="bg-portal-accent/10 border border-portal-accent/20 rounded-lg px-3 py-2 mb-3 text-xs text-portal-accent">
              {totpMessage}
            </div>
          )}

          {!totpSetup ? (
            <div className="flex gap-2">
              <button
                onClick={startTotpSetup}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors cursor-pointer"
              >
                <QrCode className="h-3.5 w-3.5" />
                Setup 2FA
              </button>
              <button
                onClick={disableTotp}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors cursor-pointer"
              >
                Disable 2FA
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="text-xs text-portal-muted">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
              </div>
              <div className="flex justify-center">
                <img src={totpSetup.qrDataUrl} alt="TOTP QR Code" className="w-48 h-48 rounded-lg" />
              </div>
              <div className="text-xs text-portal-muted">
                Manual entry key: <code className="bg-portal-bg px-2 py-1 rounded text-portal-text font-mono">{totpSetup.secret}</code>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text font-mono tracking-widest focus:outline-none focus:border-portal-accent/50"
                />
                <button
                  onClick={enableTotp}
                  disabled={totpCode.length !== 6 || totpLoading}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {totpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Verify & Enable
                </button>
                <button
                  onClick={() => setTotpSetup(null)}
                  className="p-2 text-portal-muted hover:text-portal-text cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Update Panel - Admin only */}
        {isAdmin && (
          <div className="mb-4">
            <UpdatePanel csrfToken={user.csrfToken} />
          </div>
        )}

        {/* Microsoft Integration */}
        <section className="bg-portal-card border border-portal-border rounded-xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-portal-text mb-3">Integrations</h2>
          <div className="space-y-3">
            <IntegrationRow
              name="Microsoft / OneNote"
              configured={!!process.env.NEXT_PUBLIC_MSFT_CLIENT_ID}
              onConnect={async () => {
                const res = await fetch('/api/microsoft/auth');
                const data = await res.json();
                if (data.ok) window.location.href = data.data.authUrl;
              }}
            />
          </div>
        </section>

        {/* 1Password (admin only) */}
        {isAdmin && (
          <OnePasswordPanel csrfToken={user.csrfToken} />
        )}
      </div>

        {/* Export / Import Section */}
        {isAdmin && (
          <section className="bg-portal-card border border-portal-border rounded-xl">
            <div className="px-4 py-3 border-b border-portal-border">
              <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                <Download className="h-4 w-4 text-green-400" />
                Backup & Restore
              </h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-portal-text">Export Configuration</p>
                  <p className="text-xs text-portal-muted">Download services, todos, settings as JSON</p>
                </div>
                <a
                  href="/api/admin/export"
                  download
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Export
                </a>
              </div>
              <div className="border-t border-portal-border pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-portal-text">Import Configuration</p>
                    <p className="text-xs text-portal-muted">Restore from exported JSON</p>
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Import
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const text = await file.text();
                          const d = JSON.parse(text);
                          const res = await fetch('/api/admin/export', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ data: d.data, options: { merge: true } }),
                          });
                          const result = await res.json();
                          alert(result.ok ? result.message : 'Import failed: ' + result.error);
                          if (result.ok) window.location.reload();
                        } catch { alert('Invalid JSON'); }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function IntegrationRow({
  name,
  configured,
  onConnect,
}: {
  name: string;
  configured: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-portal-text">{name}</span>
      <button
        onClick={onConnect}
        className="px-3 py-1.5 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors cursor-pointer"
      >
        {configured ? 'Reconnect' : 'Connect'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1Password panel
// ---------------------------------------------------------------------------

type OpConnectionState = {
  configured: boolean;
  connectHost: string | null;
  defaultVaultId: string | null;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
};

type OpVault = { id: string; name: string; description?: string };
type OpItem = { id: string; title: string; category: string };
type OpProject = { id: string; name: string; slug: string };
type OpMapping = {
  id: string;
  projectId: string;
  envName: string;
  vaultId: string;
  itemId: string;
  fieldLabel: string;
  note: string | null;
};

function OnePasswordPanel({ csrfToken }: { csrfToken?: string }) {
  const [state, setState] = useState<OpConnectionState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);

  const refresh = useCallback(async () => {
    setStateLoading(true);
    try {
      const res = await fetch('/api/onepassword/connection');
      const data = await res.json();
      if (data.ok) setState(data.data);
    } finally {
      setStateLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="bg-portal-card border border-portal-border rounded-xl p-6 mb-4">
      <h2 className="text-sm font-semibold text-portal-text mb-4 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-portal-accent" />
        1Password
      </h2>

      {stateLoading ? (
        <div className="flex items-center gap-2 text-xs text-portal-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : state?.configured ? (
        <ConfiguredConnection
          state={state}
          csrfToken={csrfToken}
          onChange={refresh}
        />
      ) : (
        <ConnectionForm csrfToken={csrfToken} onSaved={refresh} />
      )}

      {state?.configured && (
        <SecretMappings csrfToken={csrfToken} />
      )}
    </section>
  );
}

function ConnectionForm({
  csrfToken,
  onSaved,
}: {
  csrfToken?: string;
  onSaved: () => void;
}) {
  const [connectHost, setConnectHost] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [defaultVaultId, setDefaultVaultId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/onepassword/connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          connectHost: connectHost.trim(),
          accessToken,
          defaultVaultId: defaultVaultId.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Failed to save');
        return;
      }
      setAccessToken('');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-portal-muted">
        Connect this portal to a 1Password Connect server so the worker can
        inject secrets into agent tasks at runtime. The access token is
        encrypted at rest and never returned by the API.
      </p>

      <div>
        <label
          htmlFor="op-host"
          className="block text-xs text-portal-text-dim mb-1"
        >
          Connect host URL
        </label>
        <input
          id="op-host"
          type="url"
          value={connectHost}
          onChange={(e) => setConnectHost(e.target.value)}
          placeholder="https://op-connect.example.com"
          className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
        />
      </div>

      <div>
        <label
          htmlFor="op-token"
          className="block text-xs text-portal-text-dim mb-1"
        >
          Access token
        </label>
        <input
          id="op-token"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          autoComplete="off"
          placeholder="paste token here"
          className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text font-mono focus:outline-none focus:ring-2 focus:ring-portal-accent"
        />
        <p className="text-[11px] text-portal-muted mt-1">
          Write-only — the existing token is never displayed after saving.
        </p>
      </div>

      <div>
        <label
          htmlFor="op-default-vault"
          className="block text-xs text-portal-text-dim mb-1"
        >
          Default vault ID <span className="text-portal-muted">(optional)</span>
        </label>
        <input
          id="op-default-vault"
          type="text"
          value={defaultVaultId}
          onChange={(e) => setDefaultVaultId(e.target.value)}
          placeholder="e.g. abc123…"
          className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text font-mono focus:outline-none focus:ring-2 focus:ring-portal-accent"
        />
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={save}
        disabled={busy || !connectHost.trim() || !accessToken}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
        Save & test
      </button>
    </div>
  );
}

function ConfiguredConnection({
  state,
  csrfToken,
  onChange,
}: {
  state: OpConnectionState;
  csrfToken?: string;
  onChange: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const test = async () => {
    setMessage(null);
    setTesting(true);
    try {
      const res = await fetch('/api/onepassword/connection/test', {
        method: 'POST',
        headers: {
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      const data = await res.json();
      if (data.ok && data.data) {
        setMessage(
          data.data.ok
            ? `OK — ${data.data.message}`
            : `Failed — ${data.data.message}`
        );
      } else {
        setMessage(data.error || 'Test failed');
      }
      onChange();
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect 1Password? Existing secret mappings will be kept but cannot resolve until reconnected.')) {
      return;
    }
    setDisconnecting(true);
    try {
      await fetch('/api/onepassword/connection', {
        method: 'DELETE',
        headers: {
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
      });
      onChange();
    } finally {
      setDisconnecting(false);
    }
  };

  const statusOk = state.lastTestStatus === 'ok';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-sm">
        <span className="text-portal-muted text-xs sm:text-sm">Connect host</span>
        <span className="text-portal-text font-mono text-xs break-all">
          {state.connectHost}
        </span>

        {state.defaultVaultId && (
          <>
            <span className="text-portal-muted text-xs sm:text-sm">Default vault</span>
            <span className="text-portal-text font-mono text-xs break-all">
              {state.defaultVaultId}
            </span>
          </>
        )}

        <span className="text-portal-muted text-xs sm:text-sm">Last test</span>
        <span className="flex items-center gap-2 flex-wrap">
          {state.lastTestStatus ? (
            <span
              className={
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ' +
                (statusOk
                  ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                  : 'bg-red-500/15 text-red-400 border border-red-500/30')
              }
            >
              {statusOk ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
              {statusOk ? 'OK' : 'Failed'}
            </span>
          ) : (
            <span className="text-portal-muted text-xs">never</span>
          )}
          {state.lastTestedAt && (
            <span className="text-portal-muted text-[11px]">
              {new Date(state.lastTestedAt).toLocaleString()}
            </span>
          )}
        </span>

        {state.lastTestMessage && (
          <>
            <span className="text-portal-muted text-xs sm:text-sm">Detail</span>
            <span className="text-portal-text-dim text-xs">
              {state.lastTestMessage}
            </span>
          </>
        )}
      </div>

      {message && (
        <div className="text-xs text-portal-text-dim bg-portal-bg border border-portal-border rounded-md px-3 py-2">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={test}
          disabled={testing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Test connection
        </button>
        <button
          onClick={disconnect}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          {disconnecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          Disconnect
        </button>
      </div>
    </div>
  );
}

function SecretMappings({ csrfToken }: { csrfToken?: string }) {
  const [projects, setProjects] = useState<OpProject[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [mappings, setMappings] = useState<OpMapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  const [vaults, setVaults] = useState<OpVault[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [vaultsError, setVaultsError] = useState<string | null>(null);

  const [items, setItems] = useState<OpItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [envName, setEnvName] = useState('');
  const [vaultId, setVaultId] = useState('');
  const [itemId, setItemId] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Load projects on mount
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        const list: OpProject[] = data.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
        }));
        setProjects(list);
        if (list.length > 0 && !projectId) setProjectId(list[0]!.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load vaults once
  useEffect(() => {
    (async () => {
      setVaultsLoading(true);
      setVaultsError(null);
      try {
        const res = await fetch('/api/onepassword/vaults');
        const data = await res.json();
        if (data.ok) {
          setVaults(data.data);
        } else {
          setVaultsError(data.error || 'Failed to list vaults');
        }
      } catch (e) {
        setVaultsError((e as Error).message);
      } finally {
        setVaultsLoading(false);
      }
    })();
  }, []);

  const loadMappings = useCallback(async () => {
    if (!projectId) {
      setMappings([]);
      return;
    }
    setMappingsLoading(true);
    try {
      const res = await fetch(
        `/api/onepassword/mappings?projectId=${encodeURIComponent(projectId)}`
      );
      const data = await res.json();
      if (data.ok) setMappings(data.data);
    } finally {
      setMappingsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // When vault changes, load items
  useEffect(() => {
    setItems([]);
    setItemId('');
    if (!vaultId) return;
    (async () => {
      setItemsLoading(true);
      try {
        const res = await fetch(
          `/api/onepassword/vaults/${encodeURIComponent(vaultId)}/items`
        );
        const data = await res.json();
        if (data.ok) setItems(data.data);
      } finally {
        setItemsLoading(false);
      }
    })();
  }, [vaultId]);

  const envValid = /^[A-Z_][A-Z0-9_]*$/.test(envName);

  const submitMapping = async () => {
    setAddError(null);
    if (!projectId || !envName || !vaultId || !itemId || !fieldLabel.trim()) {
      setAddError('All fields are required.');
      return;
    }
    if (!envValid) {
      setAddError('envName must match ^[A-Z_][A-Z0-9_]*$');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/onepassword/mappings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          projectId,
          envName,
          vaultId,
          itemId,
          fieldLabel: fieldLabel.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAddError(data.error || 'Failed to create mapping');
        return;
      }
      setEnvName('');
      setFieldLabel('');
      setItemId('');
      loadMappings();
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const deleteMapping = async (id: string, env: string) => {
    if (!confirm(`Delete mapping for ${env}? The task worker will no longer inject this env var.`)) {
      return;
    }
    const res = await fetch(`/api/onepassword/mappings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || 'Failed to delete mapping');
      return;
    }
    loadMappings();
  };

  const vaultName = (id: string) =>
    vaults.find((v) => v.id === id)?.name || id;
  const itemName = (id: string) =>
    items.find((i) => i.id === id)?.title || id;

  return (
    <div className="mt-6 pt-6 border-t border-portal-border">
      <h3 className="text-sm font-semibold text-portal-text mb-4 flex items-center gap-2">
        <Vault className="h-4 w-4 text-portal-accent" />
        Secret mappings
      </h3>

      <div className="mb-4">
        <label
          htmlFor="op-project"
          className="block text-xs text-portal-text-dim mb-1"
        >
          Project
        </label>
        <select
          id="op-project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
        >
          {projects.length === 0 ? (
            <option value="">No projects</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug})
              </option>
            ))
          )}
        </select>
      </div>

      {/* Existing mappings */}
      <div className="mb-6">
        {mappingsLoading ? (
          <div className="flex items-center gap-2 text-xs text-portal-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading mappings…
          </div>
        ) : mappings.length === 0 ? (
          <p className="text-xs text-portal-muted">
            No mappings yet for this project.
          </p>
        ) : (
          <div className="overflow-x-auto border border-portal-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-portal-card-hover/50">
                <tr>
                  <th className="text-left p-2 border-b border-portal-border text-portal-text font-medium">Env name</th>
                  <th className="text-left p-2 border-b border-portal-border text-portal-text font-medium">Vault</th>
                  <th className="text-left p-2 border-b border-portal-border text-portal-text font-medium">Item</th>
                  <th className="text-left p-2 border-b border-portal-border text-portal-text font-medium">Field</th>
                  <th className="p-2 border-b border-portal-border w-8" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-portal-border last:border-0"
                  >
                    <td className="p-2 font-mono text-portal-accent whitespace-nowrap">
                      {m.envName}
                    </td>
                    <td className="p-2 text-portal-text-dim">
                      {vaultName(m.vaultId)}
                    </td>
                    <td className="p-2 text-portal-text-dim">
                      <span className="font-mono text-[11px] text-portal-muted block truncate max-w-[180px]">
                        {m.itemId}
                      </span>
                    </td>
                    <td className="p-2 text-portal-text-dim font-mono text-[11px]">
                      {m.fieldLabel}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => deleteMapping(m.id, m.envName)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                        title={`Delete ${m.envName}`}
                        aria-label={`Delete mapping ${m.envName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add mapping */}
      <div className="bg-portal-bg border border-portal-border rounded-lg p-4">
        <h4 className="text-xs font-semibold text-portal-text mb-3 flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5 text-portal-accent" />
          Add mapping
        </h4>

        {vaultsError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 mb-3">
            {vaultsError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="op-env-name"
              className="block text-xs text-portal-text-dim mb-1"
            >
              Env name
            </label>
            <input
              id="op-env-name"
              type="text"
              value={envName}
              onChange={(e) => setEnvName(e.target.value.toUpperCase())}
              placeholder="STRIPE_API_KEY"
              className={
                'w-full bg-portal-card border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-portal-accent ' +
                (envName && !envValid
                  ? 'border-red-500/50 text-red-400'
                  : 'border-portal-border text-portal-text')
              }
            />
            <p className="text-[11px] text-portal-muted mt-1">
              Pattern <code>^[A-Z_][A-Z0-9_]*$</code> — UPPER_SNAKE_CASE.
            </p>
          </div>

          <div>
            <label
              htmlFor="op-vault"
              className="block text-xs text-portal-text-dim mb-1"
            >
              Vault
            </label>
            <select
              id="op-vault"
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
              disabled={vaultsLoading || vaults.length === 0}
              className="w-full bg-portal-card border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent disabled:opacity-50"
            >
              <option value="">
                {vaultsLoading ? 'Loading…' : 'Select a vault'}
              </option>
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="op-item"
              className="block text-xs text-portal-text-dim mb-1"
            >
              Item
            </label>
            <select
              id="op-item"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              disabled={!vaultId || itemsLoading}
              className="w-full bg-portal-card border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent disabled:opacity-50"
            >
              <option value="">
                {!vaultId
                  ? 'Select a vault first'
                  : itemsLoading
                    ? 'Loading…'
                    : 'Select an item'}
              </option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} ({i.category})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="op-field"
              className="block text-xs text-portal-text-dim mb-1"
            >
              Field label
            </label>
            <input
              id="op-field"
              type="text"
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="credential"
              className="w-full bg-portal-card border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text font-mono focus:outline-none focus:ring-2 focus:ring-portal-accent"
            />
            <p className="text-[11px] text-portal-muted mt-1">
              Case-insensitive label of the field on the 1Password item, e.g.{' '}
              <code>password</code>, <code>credential</code>, <code>api_key</code>.
            </p>
          </div>
        </div>

        {addError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 mt-3">
            {addError}
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={submitMapping}
            disabled={
              adding ||
              !projectId ||
              !envValid ||
              !vaultId ||
              !itemId ||
              !fieldLabel.trim()
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark disabled:opacity-50 text-white rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add mapping
          </button>
        </div>
      </div>
    </div>
  );
}
