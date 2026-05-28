'use client';

import '@xterm/xterm/css/xterm.css';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  AlertTriangle,
  Key,
  KeyRound,
  Loader2,
  Power,
  Terminal as TerminalIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { cn } from '@/lib/utils';
import type { StatusColor } from '@/types';

// xterm types – imported lazily inside an effect on the client. We type the
// refs as `any` so we don't pull the package types into the server bundle.
type XtermTerminal = any;
type XtermFitAddon = any;

type AuthMethod = 'key' | 'password';

interface FormState {
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  privateKey: string;
  password: string;
}

interface PersistedConnection {
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
}

type SessionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected' }
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'error'; message: string };

const STORAGE_KEY = 'portal.terminal.lastConnection';

const TERMINAL_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";

const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#58a6ff',
  cursorAccent: '#0d1117',
  selectionBackground: 'rgba(88, 166, 255, 0.3)',
  black: '#484f58',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

const DEFAULT_FORM: FormState = {
  host: '',
  port: '22',
  username: '',
  authMethod: 'key',
  privateKey: '',
  password: '',
};

function statusColor(status: SessionStatus): StatusColor {
  switch (status.kind) {
    case 'connected':
      return 'green';
    case 'connecting':
      return 'yellow';
    case 'error':
      return 'red';
    case 'disconnected':
    case 'idle':
    default:
      return 'gray';
  }
}

function statusLabel(status: SessionStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Idle';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return status.reason ? `Disconnected — ${status.reason}` : 'Disconnected';
    case 'error':
      return `Error: ${status.message}`;
  }
}

/**
 * Web SSH Terminal page (admin-only).
 *
 * Renders an Xterm.js terminal backed by a WebSocket bridge to ssh2 on the
 * portal server. See docs/WEB-SSH-TERMINAL.md for protocol + security model.
 */
export default function TerminalPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [status, setStatus] = useState<SessionStatus>({ kind: 'idle' });

  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<XtermFitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Track whether the user explicitly hit "Disconnect" so onclose can
  // distinguish a clean teardown from a remote-side drop.
  const userInitiatedCloseRef = useRef(false);

  // Auth gate — mirrors the pattern used by /tailscale.
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  // Admin gate — this feature is admin-only (shell access to every Tailscale
  // host is high-blast-radius; restrict to the portal owner).
  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  }, [authLoading, user]);

  // Hydrate the form with the last-used (non-secret) values.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedConnection>;
      setForm((prev) => ({
        ...prev,
        host: typeof parsed.host === 'string' ? parsed.host : prev.host,
        port:
          typeof parsed.port === 'string' && parsed.port.length > 0
            ? parsed.port
            : prev.port,
        username:
          typeof parsed.username === 'string' ? parsed.username : prev.username,
        authMethod:
          parsed.authMethod === 'password' || parsed.authMethod === 'key'
            ? parsed.authMethod
            : prev.authMethod,
      }));
    } catch {
      /* corrupt entry — ignore */
    }
  }, []);

  const persistForm = useCallback((next: FormState) => {
    if (typeof window === 'undefined') return;
    const payload: PersistedConnection = {
      host: next.host,
      port: next.port,
      username: next.username,
      authMethod: next.authMethod,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }, []);

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const cleanupTerminal = useCallback(() => {
    if (resizeObserverRef.current) {
      try {
        resizeObserverRef.current.disconnect();
      } catch {
        /* ignore */
      }
      resizeObserverRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(1000, 'client_closed');
        }
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch {
        /* ignore */
      }
      termRef.current = null;
    }
    fitRef.current = null;
  }, []);

  // Tear everything down when the page unmounts.
  useEffect(() => {
    return () => {
      userInitiatedCloseRef.current = true;
      cleanupTerminal();
    };
  }, [cleanupTerminal]);

  const canSubmit = useMemo(() => {
    if (status.kind === 'connecting' || status.kind === 'connected') return false;
    if (!form.host.trim() || !form.username.trim()) return false;
    if (form.authMethod === 'key' && !form.privateKey.trim()) return false;
    if (form.authMethod === 'password' && !form.password) return false;
    return true;
  }, [form, status.kind]);

  const disconnect = useCallback(
    (reason?: string) => {
      userInitiatedCloseRef.current = true;
      cleanupTerminal();
      setStatus({ kind: 'disconnected', reason });
    },
    [cleanupTerminal],
  );

  const startSession = useCallback(
    async (next: FormState) => {
      if (typeof window === 'undefined') return;
      // Pre-flight auth check. The WebSocket upgrade rejection code (401 /
      // 403 / 503) isn't exposed to browser JS — failed upgrades all surface
      // as close code 1006 — so we hit a regular HTTP endpoint first to get
      // the real reason and show it to the user.
      try {
        const check = await fetch('/api/terminal/auth-check', { credentials: 'include' });
        if (!check.ok) {
          const body = (await check.json().catch(() => null)) as { error?: string } | null;
          setStatus({
            kind: 'error',
            message:
              body?.error ||
              `Auth check failed (${check.status}). Reload the page and sign in again.`,
          });
          return;
        }
      } catch (err) {
        setStatus({
          kind: 'error',
          message: `Auth check network error: ${(err as Error).message}`,
        });
        return;
      }

      // Lazy-load xterm so it only ships to the client bundle.
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);

      // Yield one frame so React has flushed the layout switch (form →
      // terminal container) before xterm tries to attach.
      await new Promise<void>((resolve) => {
        if (typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });

      const container = termContainerRef.current;
      if (!container) {
        setStatus({ kind: 'error', message: 'Terminal container missing' });
        return;
      }

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: TERMINAL_FONT_FAMILY,
        fontSize: 13,
        lineHeight: 1.2,
        scrollback: 5000,
        allowProposedApi: true,
        theme: TERMINAL_THEME,
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);

      term.open(container);
      try {
        fit.fit();
      } catch {
        /* ignore — will retry on first resize */
      }

      termRef.current = term;
      fitRef.current = fit;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/api/terminal/ws`,
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      userInitiatedCloseRef.current = false;

      // Local "did the server say we're connected" flag — avoids React stale
      // closures inside the WS callbacks.
      let gotConnectedFrame = false;

      const sendResize = () => {
        if (!termRef.current || !fitRef.current) return;
        try {
          fitRef.current.fit();
        } catch {
          return;
        }
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          } catch {
            /* ignore */
          }
        }
      };

      ws.onopen = () => {
        const portNum = parseInt(next.port, 10);
        const config: Record<string, unknown> = {
          host: next.host.trim(),
          port: Number.isFinite(portNum) && portNum > 0 ? portNum : 22,
          username: next.username.trim(),
          authMethod: next.authMethod,
          cols: term.cols,
          rows: term.rows,
        };
        if (next.authMethod === 'key') {
          config.privateKey = next.privateKey;
        } else {
          config.password = next.password;
        }
        try {
          ws.send(JSON.stringify(config));
        } catch (err) {
          setStatus({
            kind: 'error',
            message: `Failed to send config: ${(err as Error).message}`,
          });
        }
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          try {
            term.write(new Uint8Array(data));
          } catch {
            /* ignore */
          }
          return;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          data.arrayBuffer().then((buf) => {
            try {
              term.write(new Uint8Array(buf));
            } catch {
              /* ignore */
            }
          });
          return;
        }
        if (typeof data === 'string') {
          const trimmed = data.trimStart();
          if (trimmed.startsWith('{')) {
            try {
              const envelope = JSON.parse(data) as {
                type?: string;
                status?: string;
                message?: string;
              };
              if (envelope.type === 'status' && envelope.status === 'connected') {
                gotConnectedFrame = true;
                setStatus({ kind: 'connected' });
                // Push current geometry now that PTY is live.
                sendResize();
                return;
              }
              if (envelope.type === 'error') {
                setStatus({
                  kind: 'error',
                  message: envelope.message || 'Unknown server error',
                });
                return;
              }
            } catch {
              /* fall through and write as raw */
            }
          }
          try {
            term.write(data);
          } catch {
            /* ignore */
          }
        }
      };

      ws.onerror = () => {
        // ws.onclose fires right after with the authoritative reason — keep
        // status as-is so the close handler can decide.
      };

      ws.onclose = (event) => {
        const wasUserInitiated = userInitiatedCloseRef.current;

        if (wasUserInitiated) {
          // disconnect() already set the status.
          return;
        }

        if (event.code === 1008) {
          setStatus({
            kind: 'error',
            message:
              'Connection refused: invalid credentials or host configuration',
          });
          return;
        }

        // Browsers report 1006 when the upgrade itself fails (e.g. 401) — we
        // only know it was the upgrade if we never received a connected frame.
        if (event.code === 1006 && !gotConnectedFrame) {
          setStatus((prev) =>
            prev.kind === 'error'
              ? prev
              : {
                  kind: 'error',
                  message: 'Unauthorized — please log in again',
                },
          );
          return;
        }

        // Preserve any explicit server-side error envelope we may have
        // already received.
        setStatus((prev) => {
          if (prev.kind === 'error') return prev;
          const reason =
            event.reason && event.reason.length > 0 ? event.reason : undefined;
          return { kind: 'disconnected', reason };
        });
      };

      // Wire keystrokes from the terminal to the backend.
      term.onData((s: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(s);
          } catch {
            /* ignore */
          }
        }
      });

      // Re-fit on container resize (sidebar collapse, window resize, etc.).
      const onWindowResize = () => sendResize();
      const ro = new ResizeObserver(() => {
        sendResize();
      });
      ro.observe(container);
      window.addEventListener('resize', onWindowResize);
      // Piggy-back the window listener cleanup on the observer so the central
      // cleanupTerminal() tears down everything in one place.
      const originalDisconnect = ro.disconnect.bind(ro);
      ro.disconnect = () => {
        window.removeEventListener('resize', onWindowResize);
        originalDisconnect();
      };
      resizeObserverRef.current = ro;

      term.focus();
    },
    [],
  );

  const handleConnect = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      persistForm(form);
      setStatus({ kind: 'connecting' });

      try {
        await startSession(form);
      } catch (err) {
        setStatus({
          kind: 'error',
          message: (err as Error).message || 'Failed to start session',
        });
        cleanupTerminal();
      }
    },
    [canSubmit, cleanupTerminal, form, persistForm, startSession],
  );

  if (authLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-8 w-8 text-portal-accent animate-spin" />
      </div>
    );
  }

  const sessionActive =
    status.kind === 'connecting' || status.kind === 'connected';
  const connectionSummary = `${form.username.trim() || '…'}@${form.host.trim() || '…'}:${form.port || '22'}`;

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 pl-12 sm:pl-0 min-w-0">
            <TerminalIcon className="h-6 w-6 text-portal-accent" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-portal-text">Web Terminal</h1>
              <p className="text-sm text-portal-muted truncate">
                SSH into any Tailscale host
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <StatusDot status={statusColor(status)} />
              <span
                className="text-xs text-portal-muted hidden sm:inline-block max-w-[260px] truncate"
                title={statusLabel(status)}
              >
                {statusLabel(status)}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {sessionActive ? (
            <ConnectedHeader
              summary={connectionSummary}
              status={status}
              onDisconnect={() => disconnect('Closed by user')}
            />
          ) : (
            <div className="overflow-y-auto p-4 sm:p-6">
              <ConnectionPanel
                form={form}
                onChange={setField}
                onSubmit={handleConnect}
                canSubmit={canSubmit}
                status={status}
              />
            </div>
          )}

          {/* Terminal viewport — mounted whenever a session is active so xterm
              has a visible container to attach to. */}
          <div
            className={cn(
              'flex-1 min-h-0 bg-[#0d1117]',
              sessionActive ? 'block' : 'hidden',
            )}
          >
            <div
              ref={termContainerRef}
              className="h-full w-full px-2 py-2"
              aria-label="SSH terminal output"
              role="region"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectedHeader({
  summary,
  status,
  onDisconnect,
}: {
  summary: string;
  status: SessionStatus;
  onDisconnect: () => void;
}) {
  return (
    <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-2 shrink-0 flex items-center gap-3">
      <StatusDot status={statusColor(status)} />
      <p className="text-sm text-portal-text truncate flex-1 min-w-0">
        Connected to <span className="font-mono">{summary}</span>
      </p>
      <button
        type="button"
        onClick={onDisconnect}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/50"
      >
        <Power className="h-3.5 w-3.5" />
        Disconnect
      </button>
    </div>
  );
}

function ConnectionPanel({
  form,
  onChange,
  onSubmit,
  canSubmit,
  status,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSubmit: (e: FormEvent) => void;
  canSubmit: boolean;
  status: SessionStatus;
}) {
  const connecting = status.kind === 'connecting';

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-3xl mx-auto space-y-4"
      aria-label="SSH connection form"
    >
      {/* Warning banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
        <AlertTriangle
          className="h-4 w-4 text-amber-400 mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">Admin-only — </span>
          This terminal has full shell access to any host reachable from the
          portal server. Every session is audit-logged. Use with care: anything
          you type runs on the remote machine. Disable with{' '}
          <code className="font-mono text-amber-300">DISABLE_TERMINAL=true</code>.
        </p>
      </div>

      {/* Connection card */}
      <div className="bg-portal-card border border-portal-border rounded-lg p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-portal-text">
            New SSH session
          </h2>
          <p className="text-xs text-portal-muted mt-0.5">
            Fill in the target host and credentials to open an interactive
            shell.
          </p>
        </div>

        {/* Host + port + username */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-7">
            <label
              htmlFor="terminal-host"
              className="block text-xs font-medium text-portal-text-dim mb-1"
            >
              Host
            </label>
            <input
              id="terminal-host"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              value={form.host}
              onChange={(e) => onChange('host', e.target.value)}
              placeholder="my-server.tail12345.ts.net"
              className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="terminal-port"
              className="block text-xs font-medium text-portal-text-dim mb-1"
            >
              Port
            </label>
            <input
              id="terminal-port"
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => onChange('port', e.target.value)}
              placeholder="22"
              className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200"
            />
          </div>
          <div className="sm:col-span-3">
            <label
              htmlFor="terminal-username"
              className="block text-xs font-medium text-portal-text-dim mb-1"
            >
              Username
            </label>
            <input
              id="terminal-username"
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={form.username}
              onChange={(e) => onChange('username', e.target.value)}
              placeholder="root"
              className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200"
            />
          </div>
        </div>

        {/* Auth toggle */}
        <div>
          <span
            id="terminal-auth-label"
            className="block text-xs font-medium text-portal-text-dim mb-1"
          >
            Authentication
          </span>
          <div
            role="radiogroup"
            aria-labelledby="terminal-auth-label"
            className="inline-flex rounded-lg border border-portal-border bg-portal-bg p-1"
          >
            <AuthPill
              active={form.authMethod === 'key'}
              onClick={() => onChange('authMethod', 'key')}
              icon={<Key className="h-3.5 w-3.5" />}
              label="SSH Private Key"
            />
            <AuthPill
              active={form.authMethod === 'password'}
              onClick={() => onChange('authMethod', 'password')}
              icon={<KeyRound className="h-3.5 w-3.5" />}
              label="Password"
            />
          </div>
        </div>

        {/* Credential field */}
        {form.authMethod === 'key' ? (
          <div>
            <label
              htmlFor="terminal-privatekey"
              className="block text-xs font-medium text-portal-text-dim mb-1"
            >
              Private key (PEM)
            </label>
            <textarea
              id="terminal-privatekey"
              required
              rows={10}
              spellCheck={false}
              autoComplete="off"
              value={form.privateKey}
              onChange={(e) => onChange('privateKey', e.target.value)}
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'}
              className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-xs text-portal-text placeholder:text-portal-muted font-mono leading-relaxed focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200 resize-y"
            />
            <p className="text-[11px] text-portal-muted mt-1.5 leading-relaxed">
              Pasted keys are sent over the WebSocket to the portal server and
              used only for this session — they are never stored.
            </p>
          </div>
        ) : (
          <div>
            <label
              htmlFor="terminal-password"
              className="block text-xs font-medium text-portal-text-dim mb-1"
            >
              Password
            </label>
            <input
              id="terminal-password"
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => onChange('password', e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-md px-3 py-2 text-sm text-portal-text font-mono focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200"
            />
            <p className="text-[11px] text-portal-muted mt-1.5 leading-relaxed">
              The password is sent over the WebSocket to the portal server and
              used only for this session — it is never stored.
            </p>
          </div>
        )}

        {/* Error + actions */}
        {status.kind === 'error' && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2"
          >
            <p className="text-xs text-red-300">{status.message}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-portal-accent/60',
              canSubmit
                ? 'bg-portal-accent text-white hover:bg-portal-accent/90 cursor-pointer'
                : 'bg-portal-accent/40 text-white/70 cursor-not-allowed',
            )}
          >
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <TerminalIcon className="h-4 w-4" />
                Connect
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-xs text-portal-muted">
            <StatusDot status={statusColor(status)} />
            <span>{statusLabel(status)}</span>
          </div>
        </div>
      </div>
    </form>
  );
}

function AuthPill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent/60',
        active
          ? 'bg-portal-accent/15 text-portal-accent'
          : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
