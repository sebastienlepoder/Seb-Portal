'use client';

import '@xterm/xterm/css/xterm.css';
// xterm core is imported statically (not via dynamic import()) for the same
// reason documented in /terminal: it references `process`, and Next 14's
// split-chunks pass dropped the polyfill from a dynamic chunk, breaking the
// terminal the moment it opened. As a static import the polyfill travels with
// the route chunk. The fit/web-links addons stay lazy below.
import { Terminal as XtermTerminalCtor } from '@xterm/xterm';

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
  FolderGit2,
  KeyRound,
  Loader2,
  LogOut,
  Power,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { cn } from '@/lib/utils';
import type { StatusColor } from '@/types';

type XtermTerminal = any;
type XtermFitAddon = any;

interface ClaudeProject {
  id: string;
  slug: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  repo: string | null;
  workingBranch: string;
  allowWrite: boolean;
}

interface AuthStatus {
  effectiveMode: 'max' | 'api_key' | 'none';
  apiKeyAvailable: boolean;
  forceApiKey: boolean;
  max: {
    available: boolean;
    loggedIn: boolean;
    authMethod: string | null;
    subscriptionType: string | null;
    email: string | null;
    orgName: string | null;
  };
}

type SessionMode = 'session' | 'login';

type SessionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'preparing' }
  | { kind: 'connected' }
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'error'; message: string };

const STORAGE_KEY = 'portal.claudeCli.lastProject';

const TERMINAL_FONT_FAMILY =
  "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace";

const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#d2a8ff',
  cursorAccent: '#0d1117',
  selectionBackground: 'rgba(210, 168, 255, 0.3)',
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

const ERROR_COPY: Record<string, string> = {
  session_limit_exceeded: 'Too many active Claude sessions. Close one and retry.',
  config_timeout: 'The server did not receive the session config in time.',
  invalid_config: 'The session config was rejected by the server.',
  project_not_found: 'That project no longer exists.',
  project_no_repo: 'This project has no GitHub repo configured. Add a repo on the Projects page first.',
  clone_failed: 'Cloning the repo failed. Check the repo, branch, and that GITHUB_TOKEN has access.',
  claude_cli_not_installed: 'The Claude CLI binary is not available in this deployment.',
  spawn_failed: 'Failed to start the Claude CLI process on the server.',
  internal_error: 'The server hit an unexpected error starting the session (check portal logs).',
  idle_timeout: 'Session closed after 30 minutes of inactivity.',
  session_lifetime_exceeded: 'Session closed after reaching the 4-hour limit.',
};

function describeError(code: string): string {
  return ERROR_COPY[code] || code;
}

function statusColor(status: SessionStatus): StatusColor {
  switch (status.kind) {
    case 'connected':
      return 'green';
    case 'connecting':
    case 'preparing':
      return 'yellow';
    case 'error':
      return 'red';
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
    case 'preparing':
      return 'Preparing repo…';
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return status.reason ? `Disconnected — ${status.reason}` : 'Disconnected';
    case 'error':
      return `Error: ${status.message}`;
  }
}

/**
 * Claude CLI console (admin-only).
 *
 * Runs the real `claude` CLI as a PTY on the portal server — either inside a
 * cloned project repo, or in `auth login` mode to connect a Claude Max account
 * — and streams it to an Xterm.js terminal over a WebSocket bridge
 * (/api/claude/ws). Mirrors the Web SSH Terminal's protocol and security model.
 */
export default function ClaudeCliPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [status, setStatus] = useState<SessionStatus>({ kind: 'idle' });
  const [sessionMode, setSessionMode] = useState<SessionMode>('session');

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authStatusLoading, setAuthStatusLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<XtermFitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const userInitiatedCloseRef = useRef(false);
  // The active ws's mode, read inside ws callbacks (avoids stale state closures).
  const activeModeRef = useRef<SessionMode>('session');

  // Auth gate.
  useEffect(() => {
    if (!authLoading && !user) window.location.href = '/login';
  }, [authLoading, user]);

  // Admin gate — the CLI runs shell commands on the portal server.
  useEffect(() => {
    if (!authLoading && user && user.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  }, [authLoading, user]);

  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/claude/auth-status', { credentials: 'include' });
      const body = (await res.json().catch(() => null)) as (AuthStatus & { ok?: boolean }) | null;
      if (res.ok && body?.ok) setAuthStatus(body);
    } catch {
      /* non-fatal — the card just shows unknown */
    } finally {
      setAuthStatusLoading(false);
    }
  }, []);

  // Load projects + auth status once admin is confirmed.
  useEffect(() => {
    if (authLoading || !user || user.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/claude/projects', { credentials: 'include' });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: ClaudeProject[]; error?: string }
          | null;
        if (cancelled) return;
        if (!res.ok || !body?.ok) {
          setProjectsError(body?.error || `Failed to load projects (${res.status})`);
          return;
        }
        const list = body.data || [];
        setProjects(list);
        const last = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (last && list.some((p) => p.id === last)) setSelectedId(last);
        else if (list.length > 0) setSelectedId(list[0].id);
      } catch (err) {
        if (!cancelled) setProjectsError((err as Error).message);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    fetchAuthStatus();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, fetchAuthStatus]);

  const cleanupTerminal = useCallback(() => {
    if (resizeObserverRef.current) {
      try { resizeObserverRef.current.disconnect(); } catch { /* ignore */ }
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
      } catch { /* ignore */ }
      wsRef.current = null;
    }
    if (termRef.current) {
      try { termRef.current.dispose(); } catch { /* ignore */ }
      termRef.current = null;
    }
    fitRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      userInitiatedCloseRef.current = true;
      cleanupTerminal();
    };
  }, [cleanupTerminal]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId],
  );

  const busy =
    status.kind === 'connecting' || status.kind === 'preparing' || status.kind === 'connected';

  const disconnect = useCallback(
    (reason?: string) => {
      userInitiatedCloseRef.current = true;
      cleanupTerminal();
      setStatus({ kind: 'disconnected', reason });
    },
    [cleanupTerminal],
  );

  // Open a WS bridge. `mode` decides whether we run a project session or the
  // Max login flow.
  const startSession = useCallback(
    async (mode: SessionMode, project: ClaudeProject | null) => {
      if (typeof window === 'undefined') return;

      // Pre-flight auth check — WS upgrade rejection codes aren't visible to
      // browser JS (all failures look like 1006), so surface the real reason.
      try {
        const check = await fetch('/api/claude/auth-check', { credentials: 'include' });
        const body = (await check.json().catch(() => null)) as
          | { ok?: boolean; error?: string; wsServer?: boolean }
          | null;
        if (!check.ok) {
          setStatus({
            kind: 'error',
            message: body?.error || `Auth check failed (${check.status}). Reload and sign in again.`,
          });
          return;
        }
        if (body && body.wsServer === false) {
          setStatus({
            kind: 'error',
            message:
              'The portal is running the standalone Next server, which cannot host the CLI bridge. The custom server.js is not active — check the deploy (Dockerfile CMD must run `node server.js`).',
          });
          return;
        }
      } catch (err) {
        setStatus({ kind: 'error', message: `Auth check network error: ${(err as Error).message}` });
        return;
      }

      const Terminal = XtermTerminalCtor;
      const [{ FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);

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
        scrollback: 10000,
        allowProposedApi: true,
        theme: TERMINAL_THEME,
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(container);
      try { fit.fit(); } catch { /* retry on first resize */ }

      termRef.current = term;
      fitRef.current = fit;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/claude/ws`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      userInitiatedCloseRef.current = false;
      activeModeRef.current = mode;

      let gotConnectedFrame = false;

      const sendResize = () => {
        if (!termRef.current || !fitRef.current) return;
        try { fitRef.current.fit(); } catch { return; }
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'resize', cols, rows })); } catch { /* ignore */ }
        }
      };

      ws.onopen = () => {
        const config =
          mode === 'login'
            ? { mode: 'login', cols: term.cols, rows: term.rows }
            : { mode: 'session', projectId: project?.id, cols: term.cols, rows: term.rows };
        try {
          ws.send(JSON.stringify(config));
        } catch (err) {
          setStatus({ kind: 'error', message: `Failed to send config: ${(err as Error).message}` });
        }
      };

      ws.onmessage = (event) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          try { term.write(new Uint8Array(data)); } catch { /* ignore */ }
          return;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
          data.arrayBuffer().then((buf) => {
            try { term.write(new Uint8Array(buf)); } catch { /* ignore */ }
          });
          return;
        }
        if (typeof data === 'string') {
          const trimmed = data.trimStart();
          if (trimmed.startsWith('{')) {
            try {
              const env = JSON.parse(data) as { type?: string; status?: string; message?: string };
              if (env.type === 'status') {
                if (env.status === 'preparing') {
                  setStatus({ kind: 'preparing' });
                  return;
                }
                if (env.status === 'connected') {
                  gotConnectedFrame = true;
                  setStatus({ kind: 'connected' });
                  sendResize();
                  return;
                }
                return;
              }
              if (env.type === 'error') {
                setStatus({ kind: 'error', message: describeError(env.message || 'unknown') });
                return;
              }
            } catch {
              /* fall through and write as raw */
            }
          }
          try { term.write(data); } catch { /* ignore */ }
        }
      };

      ws.onerror = () => {
        // onclose fires next with the authoritative reason.
      };

      ws.onclose = (event) => {
        const wasLogin = activeModeRef.current === 'login';

        // After a login session ends, refresh the auth card and return to the
        // panel regardless of how it closed (the user may have completed login).
        if (wasLogin && !userInitiatedCloseRef.current) {
          fetchAuthStatus();
          setStatus({ kind: 'idle' });
          cleanupTerminal();
          return;
        }

        if (userInitiatedCloseRef.current) return; // disconnect() set status

        const codeInfo = `code ${event.code}${event.reason ? ` — ${event.reason}` : ''}`;
        if (event.code === 1006 && !gotConnectedFrame) {
          setStatus((prev) =>
            prev.kind === 'error'
              ? prev
              : {
                  kind: 'error',
                  message:
                    'WebSocket dropped before the CLI started (code 1006). Auth is fine — the reverse proxy likely is not forwarding/holding the /api/claude/ws upgrade. Check Coolify/Traefik WebSocket routing.',
                },
          );
          return;
        }
        setStatus((prev) => {
          if (prev.kind === 'error') return prev;
          const reason = event.reason && event.reason.length > 0
            ? `${event.reason} (${codeInfo})`
            : codeInfo;
          return { kind: 'disconnected', reason };
        });
      };

      term.onData((s: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(s); } catch { /* ignore */ }
        }
      });

      const onWindowResize = () => sendResize();
      const ro = new ResizeObserver(() => sendResize());
      ro.observe(container);
      window.addEventListener('resize', onWindowResize);
      const originalDisconnect = ro.disconnect.bind(ro);
      ro.disconnect = () => {
        window.removeEventListener('resize', onWindowResize);
        originalDisconnect();
      };
      resizeObserverRef.current = ro;

      term.focus();
    },
    [cleanupTerminal, fetchAuthStatus],
  );

  const handleConnect = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (busy || !selectedProject) return;
      try { window.localStorage.setItem(STORAGE_KEY, selectedProject.id); } catch { /* ignore */ }
      setSessionMode('session');
      setStatus({ kind: 'connecting' });
      try {
        await startSession('session', selectedProject);
      } catch (err) {
        setStatus({ kind: 'error', message: (err as Error).message || 'Failed to start session' });
        cleanupTerminal();
      }
    },
    [busy, cleanupTerminal, selectedProject, startSession],
  );

  const handleConnectMax = useCallback(async () => {
    if (busy) return;
    setSessionMode('login');
    setStatus({ kind: 'connecting' });
    try {
      await startSession('login', null);
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message || 'Failed to start login' });
      cleanupTerminal();
    }
  }, [busy, cleanupTerminal, startSession]);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/claude/auth-logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore — refresh below reflects the real state */
    } finally {
      await fetchAuthStatus();
      setLoggingOut(false);
    }
  }, [loggingOut, fetchAuthStatus]);

  if (authLoading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-8 w-8 text-portal-accent animate-spin" />
      </div>
    );
  }

  const sessionActive = busy;
  const isLoginActive = sessionMode === 'login' && sessionActive;

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-3 pl-12 sm:pl-0 min-w-0">
            <Sparkles className="h-6 w-6 text-portal-accent" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-portal-text">Claude CLI</h1>
              <p className="text-sm text-portal-muted truncate">
                Run the Claude CLI inside a project repo
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
            <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-2 shrink-0 flex items-center gap-3">
              <StatusDot status={statusColor(status)} />
              <p className="text-sm text-portal-text truncate flex-1 min-w-0">
                {isLoginActive ? (
                  <>
                    Connecting your <span className="font-mono">Claude Max</span> account — open the
                    URL below, approve, then paste the code here.
                  </>
                ) : (
                  <>
                    {status.kind === 'preparing' ? 'Preparing ' : 'Claude in '}
                    <span className="font-mono">{selectedProject?.name}</span>
                    {selectedProject?.repo ? (
                      <span className="text-portal-muted"> · {selectedProject.repo}</span>
                    ) : null}
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => disconnect('Closed by user')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/50"
              >
                <Power className="h-3.5 w-3.5" />
                {isLoginActive ? 'Cancel' : 'End session'}
              </button>
            </div>
          ) : (
            <div className="overflow-y-auto p-4 sm:p-6 space-y-4">
              <AuthCard
                authStatus={authStatus}
                loading={authStatusLoading}
                loggingOut={loggingOut}
                onConnectMax={handleConnectMax}
                onLogout={handleLogout}
              />
              <ConnectionPanel
                projects={projects}
                projectsLoading={projectsLoading}
                projectsError={projectsError}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onSubmit={handleConnect}
                canSubmit={!busy && !!selectedProject}
                status={status}
                selectedProject={selectedProject}
              />
            </div>
          )}

          {/* Terminal viewport */}
          <div className={cn('flex-1 min-h-0 bg-[#0d1117]', sessionActive ? 'block' : 'hidden')}>
            <div
              ref={termContainerRef}
              className="h-full w-full px-2 py-2"
              aria-label="Claude CLI terminal output"
              role="region"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthCard({
  authStatus,
  loading,
  loggingOut,
  onConnectMax,
  onLogout,
}: {
  authStatus: AuthStatus | null;
  loading: boolean;
  loggingOut: boolean;
  onConnectMax: () => void;
  onLogout: () => void;
}) {
  const mode = authStatus?.effectiveMode ?? 'none';
  const max = authStatus?.max;
  const isMax = mode === 'max';

  const badge =
    mode === 'max'
      ? { dot: 'green' as StatusColor, label: 'Using Claude Max' }
      : mode === 'api_key'
        ? { dot: 'yellow' as StatusColor, label: 'Using API key (per-token)' }
        : { dot: 'red' as StatusColor, label: 'No authentication configured' };

  return (
    <div className="bg-portal-card border border-portal-border rounded-lg p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="h-4 w-4 text-portal-accent mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-portal-text">Authentication</h2>
            {!loading && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-portal-muted">
                <StatusDot status={badge.dot} />
                {badge.label}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-portal-muted mt-1.5 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </p>
          ) : (
            <>
              {isMax && max?.loggedIn ? (
                <p className="text-xs text-portal-muted mt-1.5 leading-relaxed">
                  Connected as <span className="text-portal-text">{max.email || 'your account'}</span>
                  {max.subscriptionType ? ` · ${max.subscriptionType} plan` : ''}. New sessions use
                  your subscription (no per-token billing).
                </p>
              ) : mode === 'api_key' ? (
                <p className="text-xs text-portal-muted mt-1.5 leading-relaxed">
                  Sessions bill your <span className="font-mono">ANTHROPIC_API_KEY</span> per token.
                  Connect a Claude Max account to use your subscription instead.
                </p>
              ) : (
                <p className="text-xs text-amber-300/90 mt-1.5 leading-relaxed">
                  Neither a Max account nor an API key is available. Connect Max below, or set
                  <span className="font-mono"> ANTHROPIC_API_KEY</span>.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={onConnectMax}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-portal-accent text-white hover:bg-portal-accent/90 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent/60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isMax && max?.loggedIn ? 'Reconnect Max' : 'Connect to Max'}
                </button>
                {isMax && max?.loggedIn ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loggingOut}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-portal-text-dim hover:text-portal-text border border-portal-border hover:bg-portal-card-hover transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent/40 disabled:opacity-60"
                  >
                    {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                    Disconnect
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionPanel({
  projects,
  projectsLoading,
  projectsError,
  selectedId,
  onSelect,
  onSubmit,
  canSubmit,
  status,
  selectedProject,
}: {
  projects: ClaudeProject[];
  projectsLoading: boolean;
  projectsError: string | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onSubmit: (e: FormEvent) => void;
  canSubmit: boolean;
  status: SessionStatus;
  selectedProject: ClaudeProject | null;
}) {
  const connecting = status.kind === 'connecting' || status.kind === 'preparing';

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4" aria-label="Claude CLI session form">
      {/* Warning banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          <span className="font-semibold text-amber-300">Admin-only — </span>
          The Claude CLI runs with shell access inside a clone of the selected repo on the
          portal server. Sessions are audit-logged and auto-close after 30 min idle / 4 h max.
          Disable with <code className="font-mono text-amber-300">DISABLE_CLAUDE_CLI=true</code>.
        </p>
      </div>

      {/* Session card */}
      <div className="bg-portal-card border border-portal-border rounded-lg p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-portal-text">New Claude session</h2>
          <p className="text-xs text-portal-muted mt-0.5">
            Pick a project. Its repo is cloned (or reused) on the server and the Claude CLI
            opens there.
          </p>
        </div>

        {projectsError ? (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
            <p className="text-xs text-red-300">{projectsError}</p>
          </div>
        ) : projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-portal-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-portal-bg border border-portal-border rounded-md px-3 py-3">
            <p className="text-xs text-portal-muted">
              No projects with a GitHub repo configured. Add a repo to a project on the{' '}
              <a href="/projects" className="text-portal-accent hover:underline">Projects</a> page first.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="claude-project" className="block text-xs font-medium text-portal-text-dim mb-1">
                Project
              </label>
              <div className="relative">
                <FolderGit2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted pointer-events-none" />
                <select
                  id="claude-project"
                  value={selectedId}
                  onChange={(e) => onSelect(e.target.value)}
                  className="w-full bg-portal-bg border border-portal-border rounded-md pl-9 pr-3 py-2 text-sm text-portal-text focus:border-portal-accent focus:outline-none focus:ring-2 focus:ring-portal-accent/30 transition-colors duration-200 appearance-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon ? `${p.icon} ` : ''}{p.name}{p.repo ? ` — ${p.repo}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {selectedProject ? (
                <p className="text-[11px] text-portal-muted mt-1.5 leading-relaxed">
                  Branch <span className="font-mono">{selectedProject.workingBranch}</span>
                  {selectedProject.allowWrite
                    ? ' · writes/pushes allowed for this repo'
                    : ' · read-only repo (no push token use)'}
                </p>
              ) : null}
            </div>

            {status.kind === 'error' && (
              <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
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
                    {status.kind === 'preparing' ? 'Preparing…' : 'Connecting…'}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Start Claude
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 text-xs text-portal-muted">
                <StatusDot status={statusColor(status)} />
                <span>{statusLabel(status)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
