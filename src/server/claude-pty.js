'use strict';

// Claude CLI terminal bridge. Accepts an already-upgraded WebSocket, awaits a
// single JSON config frame naming a portal Project, clones/locates that repo on
// the portal server, spawns the `claude` CLI inside it via a PTY, and pipes
// bytes both ways. Resize frames are JSON; everything else is raw terminal I/O
// carried over binary frames.
//
// This is the sibling of terminal-ws.js (the SSH bridge). The wire protocol and
// security scaffolding (per-user session cap, idle/lifetime timeouts, keepalive
// pings, audit logging) are deliberately identical so the frontend can reuse the
// same xterm plumbing. The difference is the far end: a local PTY running the
// Claude CLI instead of an ssh2 connection.
//
// Auth: the CLI inherits ANTHROPIC_API_KEY (and ANTHROPIC_BASE_URL) from the
// portal process env — the same key the AI Hub already uses. If a Claude Max
// OAuth credentials file is mounted at $HOME/.claude/.credentials.json the CLI
// will prefer it; set CLAUDE_CLI_FORCE_API_KEY=true to always bill per-token.
//
// The admin gate, origin check, and DISABLE_CLAUDE_CLI flag are enforced by the
// HTTP upgrade handler in server.js (before this module is invoked).
//
// IMPORTANT: never log the GitHub token or terminal stream contents.

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { z } = require('zod');
const { resolveClaudeCommand, shouldUseOauth } = require('./claude-cli');

// node-pty is a native module. Load it lazily so a build that hasn't rebuilt it
// (e.g. a dev box that ran `npm ci --ignore-scripts`) fails loudly with a clear
// message only when a Claude session is actually attempted, rather than crashing
// the whole server at boot.
let _pty = null;
function getPty() {
  if (_pty) return _pty;
  // eslint-disable-next-line global-require
  _pty = require('node-pty');
  return _pty;
}

// ── Resource limits ──────────────────────────────────────────────────────────

/** Maximum concurrent Claude CLI sessions per portal user. */
const MAX_CONCURRENT_SESSIONS_PER_USER = 2;

/** Disconnect if no I/O in either direction for this long. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000; // 30 min

/** Hard cap — bounds runaway API spend from a forgotten tab. */
const MAX_SESSION_LIFETIME_MS = 4 * 60 * 60 * 1_000; // 4 h

const CONFIG_TIMEOUT_MS = 10_000; // wait for the initial config frame

// Module-level session counter keyed by portal user id. Intentionally
// module-scoped so it survives across WS connections.
const activeSessionsByUser = new Map();

function incrementSession(userId) {
  if (!userId) return true;
  const count = activeSessionsByUser.get(userId) || 0;
  if (count >= MAX_CONCURRENT_SESSIONS_PER_USER) return false;
  activeSessionsByUser.set(userId, count + 1);
  return true;
}

function decrementSession(userId) {
  if (!userId) return;
  const count = activeSessionsByUser.get(userId) || 0;
  if (count <= 1) activeSessionsByUser.delete(userId);
  else activeSessionsByUser.set(userId, count - 1);
}

// ── Config schema ────────────────────────────────────────────────────────────

const CONFIG_SCHEMA = z
  .object({
    // 'session' opens Claude in a project repo; 'login' runs the Max OAuth flow.
    mode: z.enum(['session', 'login']).optional().default('session'),
    // Project.id is a uuid; accept a bounded id-safe string defensively.
    // Required for 'session' mode (enforced by the refine below).
    projectId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9_-]+$/, 'projectId contains invalid characters')
      .optional(),
    cols: z.number().int().min(1).max(1000).optional().default(80),
    rows: z.number().int().min(1).max(1000).optional().default(24),
  })
  .refine((v) => v.mode === 'login' || (typeof v.projectId === 'string' && v.projectId.length > 0), {
    message: 'projectId is required for a session',
    path: ['projectId'],
  });

// ── Utilities ────────────────────────────────────────────────────────────────

function sendStatus(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* socket already dead */
  }
}

function safeCloseSocket(ws, code = 1000, reason = '') {
  try {
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      ws.close(code, reason);
    }
  } catch {
    /* ignore */
  }
}

function redactToken(text, token) {
  if (!token || !text) return text;
  return text.split(token).join('***');
}

// ── Git clone / locate ─────────────────────────────────────────────────────────

function gitRun(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      env: opts.env || process.env,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    // `onData(text)` lets the caller stream progress to the client — important
    // for `git clone`, whose output keeps the WebSocket non-idle through an
    // otherwise silent multi-second clone (some reverse proxies drop a quiet
    // upgrade). git writes transfer progress to stderr.
    child.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      if (opts.onData) opts.onData(opts.redact ? opts.redact(s) : s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      if (opts.onData) opts.onData(opts.redact ? opts.redact(s) : s);
    });
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: stderr + '\n' + e.message }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * Ensure a writable checkout of the project's repo exists and return its path.
 * Mirrors the worker's clone strategy but does NOT reset/overwrite an existing
 * checkout — an interactive CLI session may have uncommitted work the user
 * expects to find again on reconnect.
 *
 * @param {(text: string) => void} [onProgress] receives human-readable progress
 *   (clone output) to stream to the client terminal.
 * @returns {Promise<string>} absolute workdir path
 * @throws  {Error} with a short, secret-free message code on failure
 */
async function prepareWorkspace(project, token, onProgress) {
  const say = (text) => { if (onProgress) onProgress(text); };

  // A project may pin an explicit clone path (shared with the worker).
  if (project.clonePath) {
    try {
      const st = fs.statSync(project.clonePath);
      if (st.isDirectory()) return project.clonePath;
    } catch {
      /* fall through to clone */
    }
  }

  const owner = project.repoOwner;
  const name = project.repoName;
  if (!owner || !name) throw new Error('project_no_repo');

  const baseDir = process.env.CLAUDE_CLI_CLONES_DIR || '/app/claude-cli-clones';
  let workdir;
  try {
    fs.mkdirSync(baseDir, { recursive: true });
    fs.accessSync(baseDir, fs.constants.W_OK);
    workdir = path.join(baseDir, `${owner}__${name}`);
  } catch {
    // Fall back to a tmp dir in environments without the persistent volume.
    workdir = path.join(require('os').tmpdir(), `claude-cli-${owner}__${name}`);
  }

  // Reuse a valid existing checkout as-is (preserve the user's working tree).
  let hasGit = false;
  try {
    hasGit = fs.statSync(path.join(workdir, '.git')).isDirectory();
  } catch {
    hasGit = false;
  }
  if (hasGit) {
    say(`Using existing checkout of ${owner}/${name}\r\n`);
    return workdir;
  }
  // A prior interrupted attempt can leave a partial dir with no .git; remove it
  // so `git clone` below doesn't fail on a non-empty destination.
  try {
    if (fs.existsSync(workdir)) {
      say('Cleaning up an incomplete previous checkout…\r\n');
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(`[claude-pty] failed to clean partial workdir: ${e && e.message}`);
  }

  const remoteUrl = token
    ? `https://${token}@github.com/${owner}/${name}.git`
    : `https://github.com/${owner}/${name}.git`;
  const branch = project.workingBranch || 'main';
  const redact = (s) => redactToken(s, token);

  say(`Cloning ${owner}/${name} (branch ${branch})…\r\n`);
  // Shallow + single-branch keeps the first clone fast; --progress forces git
  // to emit transfer progress even though stderr isn't a TTY, so bytes keep
  // flowing to the client and the proxy never sees an idle upgrade. The user
  // can `git fetch --unshallow` inside the session if full history is needed.
  const res = await gitRun(
    ['clone', '--progress', '--depth', '1', '--single-branch', '--branch', branch, remoteUrl, workdir],
    { onData: say, redact },
  );
  if (res.code !== 0) {
    // Distinguish a bad branch from other failures so the UI can hint usefully.
    const err = redactToken(res.stderr || '', token);
    console.warn(`[claude-pty] git clone failed for ${owner}/${name}: ${err.slice(0, 300)}`);
    throw new Error('clone_failed');
  }
  say('Clone complete.\r\n');
  return workdir;
}

// ── Child environment ──────────────────────────────────────────────────────────

function buildChildEnv(forLogin) {
  const env = { ...process.env };
  // node-pty wants a sane TERM; the CLI renders an xterm-256color UI.
  env.TERM = 'xterm-256color';
  // The login flow always targets Max OAuth; a normal session prefers OAuth
  // whenever Max creds are present (unless CLAUDE_CLI_FORCE_API_KEY=true).
  // The CLI treats ANTHROPIC_API_KEY as an override that bills per-token, so
  // strip it (and a custom base URL) whenever we want OAuth — otherwise Max
  // would silently be ignored.
  if (forLogin || shouldUseOauth()) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_BASE_URL;
  }
  return env;
}

// ── Main session handler ─────────────────────────────────────────────────────

/**
 * Wire an already-upgraded WebSocket to a Claude CLI PTY.
 *
 * @param {import('ws').WebSocket} ws
 * @param {{
 *   remoteAddress?: string,
 *   sessionUserId?: string,
 *   githubToken?: string,
 *   getProjectById?: (id: string) => Promise<object|null>,
 *   auditFn?: (params: object) => Promise<void>
 * }} ctx  Context injected by the upgrade handler in server.js.
 */
function handleClaudeSession(ws, ctx = {}) {
  const {
    remoteAddress = 'unknown',
    sessionUserId,
    githubToken,
    getProjectById,
    auditFn,
  } = ctx;

  if (!incrementSession(sessionUserId)) {
    sendStatus(ws, { type: 'error', message: 'session_limit_exceeded' });
    return safeCloseSocket(ws, 1013, 'session_limit_exceeded');
  }

  let sessionDecremented = false;
  function endSession() {
    if (sessionDecremented) return;
    sessionDecremented = true;
    decrementSession(sessionUserId);
  }

  let cfg = null;
  let ptyProc = null;
  let configReceived = false;
  let projectName = null;
  let auditKind = 'claude_cli'; // becomes 'claude_cli_login' in login mode

  let sessionStartedAt = null;
  let sessionOutcome = 'unknown';
  let auditOpenFired = false;
  let auditCloseFired = false;

  let configTimer = null;
  let idleTimer = null;
  let lifetimeTimer = null;
  let keepaliveTimer = null;

  function clearAllTimers() {
    if (configTimer)   { clearTimeout(configTimer);   configTimer   = null; }
    if (idleTimer)     { clearTimeout(idleTimer);     idleTimer     = null; }
    if (lifetimeTimer) { clearTimeout(lifetimeTimer); lifetimeTimer = null; }
    if (keepaliveTimer){ clearInterval(keepaliveTimer); keepaliveTimer = null; }
  }

  // Keepalive — see the rationale in terminal-ws.js: reverse proxies drop a
  // WebSocket that carries no traffic shortly after the upgrade, and there's a
  // quiet window between the config frame and the first byte of CLI output
  // while the repo clone runs.
  const pingNow = () => {
    if (ws.readyState === ws.OPEN) {
      try { ws.ping(); } catch { /* socket dying */ }
    }
  };
  pingNow(); // fire immediately so the tunnel has traffic from t=0
  keepaliveTimer = setInterval(pingNow, 750);

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      console.log(`[claude-pty] idle timeout session=${sessionUserId ?? 'n/a'}`);
      sessionOutcome = 'idle_timeout';
      sendStatus(ws, { type: 'error', message: 'idle_timeout' });
      if (ptyProc) { try { ptyProc.kill(); } catch {} }
      safeCloseSocket(ws, 4008, 'idle_timeout');
    }, IDLE_TIMEOUT_MS);
  }

  function fireAuditOpen() {
    if (auditOpenFired || !auditFn) return;
    auditOpenFired = true;
    auditFn({
      action: `${auditKind}_open`,
      projectId: cfg ? cfg.projectId : null,
      projectName,
      outcome: 'attempting',
    }).catch(() => {});
  }

  function fireAuditClose() {
    if (auditCloseFired || !auditFn) return;
    auditCloseFired = true;
    auditFn({
      action: `${auditKind}_close`,
      projectId: cfg ? cfg.projectId : null,
      projectName,
      outcome: sessionOutcome,
      durationMs: sessionStartedAt ? Date.now() - sessionStartedAt : 0,
    }).catch(() => {});
  }

  configTimer = setTimeout(() => {
    if (configReceived) return;
    sendStatus(ws, { type: 'error', message: 'config_timeout' });
    safeCloseSocket(ws, 1008, 'config_timeout');
  }, CONFIG_TIMEOUT_MS);

  async function handleConfigFrame(raw, isBinary) {
    clearTimeout(configTimer);
    configTimer = null;
    configReceived = true;

    let parsed;
    try {
      const text = isBinary ? raw.toString('utf8') : String(raw);
      parsed = JSON.parse(text);
    } catch {
      sendStatus(ws, { type: 'error', message: 'invalid_config_json' });
      return safeCloseSocket(ws, 1008, 'invalid_config_json');
    }

    const result = CONFIG_SCHEMA.safeParse(parsed);
    if (!result.success) {
      sendStatus(ws, {
        type: 'error',
        message: 'invalid_config',
        details: result.error.flatten(),
      });
      return safeCloseSocket(ws, 1008, 'invalid_config');
    }

    cfg = result.data;
    sessionStartedAt = Date.now();

    // Push a frame immediately so the connection has bidirectional traffic
    // before the (potentially multi-second) clone — keeps the proxy from
    // treating the upgrade as idle. See keepalive note above.
    sendStatus(ws, { type: 'status', status: 'connecting' });

    const isLogin = cfg.mode === 'login';

    // ── Resolve the CLI binary (both modes need it) ───────────────────────
    let claudeCmd;
    try {
      claudeCmd = resolveClaudeCommand();
    } catch {
      sessionOutcome = 'claude_cli_not_installed';
      sendStatus(ws, { type: 'error', message: 'claude_cli_not_installed' });
      return safeCloseSocket(ws, 1011, 'claude_cli_not_installed');
    }

    let cwd;
    let spawnArgs;

    if (isLogin) {
      // ── Max OAuth sign-in flow ──────────────────────────────────────────
      // `claude auth login --claudeai` prints an authorization URL (rendered
      // clickable by the xterm web-links addon) and waits for the user to
      // paste the code back. On success it writes $HOME/.claude/.credentials.json.
      auditKind = 'claude_cli_login';
      projectName = 'Max sign-in';
      console.log(`[claude-pty] start login from=${remoteAddress} session=${sessionUserId ?? 'n/a'}`);
      fireAuditOpen();
      cwd = process.env.HOME || process.cwd();
      spawnArgs = ['auth', 'login', '--claudeai'];
    } else {
      // ── Project session ─────────────────────────────────────────────────
      let project = null;
      try {
        project = getProjectById ? await getProjectById(cfg.projectId) : null;
      } catch (e) {
        console.warn(`[claude-pty] project lookup failed: ${e && e.message}`);
      }
      if (!project) {
        sessionOutcome = 'project_not_found';
        sendStatus(ws, { type: 'error', message: 'project_not_found' });
        return safeCloseSocket(ws, 1008, 'project_not_found');
      }
      projectName = project.name || project.slug || cfg.projectId;
      console.log(
        `[claude-pty] start project="${projectName}" from=${remoteAddress} session=${sessionUserId ?? 'n/a'}`,
      );
      fireAuditOpen();

      // Clone / locate the repo. Stream git progress to the terminal as binary
      // frames so the connection keeps producing traffic during the clone
      // (prevents the reverse proxy dropping an otherwise-idle upgrade) and the
      // user sees what's happening.
      sendStatus(ws, { type: 'status', status: 'preparing' });
      const streamToTerm = (text) => {
        if (ws.readyState !== ws.OPEN) return;
        try { ws.send(Buffer.from(text, 'utf8'), { binary: true }); } catch {}
      };
      try {
        cwd = await prepareWorkspace(project, githubToken, streamToTerm);
      } catch (e) {
        const code = (e && e.message) || 'workspace_failed';
        sessionOutcome = code;
        sendStatus(ws, { type: 'error', message: code });
        return safeCloseSocket(ws, 1011, code);
      }
      if (ws.readyState !== ws.OPEN) return; // client gave up during clone

      spawnArgs = [];
      if (process.env.CLAUDE_CLI_MODEL) {
        spawnArgs.push('--model', process.env.CLAUDE_CLI_MODEL);
      }
    }

    // ── Spawn the CLI in a PTY ────────────────────────────────────────────
    try {
      ptyProc = getPty().spawn(claudeCmd.file, [...claudeCmd.baseArgs, ...spawnArgs], {
        name: 'xterm-256color',
        cols: cfg.cols,
        rows: cfg.rows,
        cwd,
        env: buildChildEnv(isLogin),
      });
    } catch (e) {
      console.error(`[claude-pty] pty spawn failed: ${e && e.message}`);
      sessionOutcome = 'spawn_failed';
      sendStatus(ws, { type: 'error', message: 'spawn_failed' });
      return safeCloseSocket(ws, 1011, 'spawn_failed');
    }

    sessionOutcome = 'connected';
    sendStatus(ws, { type: 'status', status: 'connected' });
    resetIdleTimer();

    lifetimeTimer = setTimeout(() => {
      lifetimeTimer = null;
      console.log(`[claude-pty] lifetime cap reached session=${sessionUserId ?? 'n/a'}`);
      sessionOutcome = 'lifetime_exceeded';
      sendStatus(ws, { type: 'error', message: 'session_lifetime_exceeded' });
      if (ptyProc) { try { ptyProc.kill(); } catch {} }
      safeCloseSocket(ws, 4008, 'session_lifetime_exceeded');
    }, MAX_SESSION_LIFETIME_MS);

    // PTY → client. node-pty emits strings; ship them as UTF-8 binary frames
    // so multibyte sequences are never split across a text-frame boundary.
    ptyProc.onData((data) => {
      resetIdleTimer();
      if (ws.readyState !== ws.OPEN) return;
      try { ws.send(Buffer.from(data, 'utf8'), { binary: true }); } catch {}
    });

    ptyProc.onExit(({ exitCode }) => {
      console.log(`[claude-pty] cli exited code=${exitCode} project="${projectName}"`);
      if (sessionOutcome === 'connected') sessionOutcome = 'cli_exited';
      sendStatus(ws, { type: 'status', status: 'closed' });
      try {
        if (ws.readyState === ws.OPEN) ws.send('\r\n[claude session ended]\r\n');
      } catch {}
      safeCloseSocket(ws, 1000, 'cli_exited');
    });

    // Client → PTY: keystrokes and resize frames.
    ws.on('message', (frame, frameIsBinary) => {
      resetIdleTimer();
      if (!ptyProc) return;
      if (!frameIsBinary) {
        const asString = frame.toString('utf8');
        if (asString.length > 0 && asString.length < 256 && asString[0] === '{') {
          let ctl;
          try { ctl = JSON.parse(asString); } catch { ctl = null; }
          if (ctl && ctl.type === 'resize') {
            const cols = Number(ctl.cols);
            const rows = Number(ctl.rows);
            if (
              Number.isInteger(cols) && Number.isInteger(rows) &&
              cols > 0 && rows > 0 && cols <= 1000 && rows <= 1000
            ) {
              try { ptyProc.resize(cols, rows); } catch {}
            }
            return;
          }
        }
        try { ptyProc.write(asString); } catch {}
        return;
      }
      try { ptyProc.write(frame.toString('utf8')); } catch {}
    });
  } // end handleConfigFrame

  // Run the config handler and guarantee any unexpected throw still surfaces a
  // reason to the client (otherwise the socket would die as a bare 1006).
  ws.once('message', (raw, isBinary) => {
    handleConfigFrame(raw, isBinary).catch((e) => {
      console.error('[claude-pty] config handler crashed:', e && e.message);
      if (sessionOutcome === 'unknown' || sessionOutcome === 'attempting') {
        sessionOutcome = 'handler_error';
      }
      try { sendStatus(ws, { type: 'error', message: 'internal_error' }); } catch {}
      safeCloseSocket(ws, 1011, 'internal_error');
    });
  });

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  ws.on('close', () => {
    clearAllTimers();
    endSession();
    if (ptyProc) { try { ptyProc.kill(); } catch {} }
    fireAuditClose();
  });

  ws.on('error', (err) => {
    console.warn(`[claude-pty] ws error: ${err && err.message ? err.message : 'unknown'}`);
    if (sessionOutcome === 'connected') sessionOutcome = 'ws_error';
    clearAllTimers();
    endSession();
    if (ptyProc) { try { ptyProc.kill(); } catch {} }
    fireAuditClose();
  });
}

module.exports = { handleClaudeSession };
