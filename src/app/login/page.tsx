'use client';

import { useState } from 'react';
import { Lock, Mail, Key, Loader2, Shield } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode: showTotp ? totpCode : undefined }),
      });

      const data = await res.json();

      if (data.requireTotp) {
        setShowTotp(true);
        setLoading(false);
        return;
      }

      if (data.ok) {
        window.location.href = '/dashboard';
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-portal-bg px-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-portal-accent/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-portal-accent/10 border border-portal-accent/20 mb-4">
            <Shield className="h-8 w-8 text-portal-accent" />
          </div>
          <h1 className="text-2xl font-bold text-portal-text">LEPODER</h1>
          <p className="text-sm text-portal-muted mt-1">Personal Portal</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-portal-card border border-portal-border rounded-2xl p-6 shadow-xl"
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 text-sm text-red-400 animate-fade-in">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-portal-muted mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50 focus:ring-1 focus:ring-portal-accent/30 transition-all"
                  placeholder="admin@lepoder.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-portal-muted mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50 focus:ring-1 focus:ring-portal-accent/30 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {showTotp && (
              <div className="animate-slide-up">
                <label className="block text-xs font-medium text-portal-muted mb-1.5">
                  2FA Code
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    maxLength={6}
                    className="w-full bg-portal-bg border border-portal-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50 focus:ring-1 focus:ring-portal-accent/30 transition-all font-mono tracking-widest"
                    placeholder="000000"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-2.5 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-portal-muted mt-4">
          Secure portal — all traffic encrypted
        </p>
      </div>
    </div>
  );
}
