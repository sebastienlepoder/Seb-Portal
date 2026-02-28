'use client';

import {
  Download,
  Upload, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { Shield, Key, QrCode, Check, X, Loader2 } from 'lucide-react';
import { UpdatePanel } from '@/components/admin/UpdatePanel';
import { PortalShell } from '@/components/layout/PortalShell';

export default function SettingsPage() {
  const { user, loading } = useAuth();
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
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PortalShell activeItem="settings">
    <div className="p-6">
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
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors"
              >
                <QrCode className="h-3.5 w-3.5" />
                Setup 2FA
              </button>
              <button
                onClick={disableTotp}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors"
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
                  className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg disabled:opacity-50"
                >
                  {totpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Verify & Enable
                </button>
                <button
                  onClick={() => setTotpSetup(null)}
                  className="p-2 text-portal-muted hover:text-portal-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Update Panel - Admin only */}
        {user.role?.toLowerCase() === 'admin' && (
          <div className="mb-4">
            <UpdatePanel csrfToken={user.csrfToken} />
          </div>
        )}

        {/* Microsoft Integration */}
        <section className="bg-portal-card border border-portal-border rounded-xl p-6">
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
      </div>
    </div>

        {/* Export / Import Section */}
        {user?.role?.toLowerCase() === 'admin' && (
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
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors"
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
    </PortalShell>
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
        className="px-3 py-1.5 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors"
      >
        {configured ? 'Reconnect' : 'Connect'}
      </button>
    </div>
  );
}
