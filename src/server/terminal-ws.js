'use strict';

// Web SSH terminal bridge. Accepts an already-upgraded WebSocket, awaits a
// single JSON config frame from the client, opens an ssh2 shell, and pipes
// bytes both ways. Resize frames are JSON; everything else is raw shell I/O
// carried over binary frames.
//
// Security hardening applied here:
//   - per-user concurrent session cap
//   - idle timeout (30 min) + max session lifetime (8 h)
//   - host allowlist via TERMINAL_HOST_ALLOWLIST env var
//   - secret scrubbing after ssh2 handshake
//   - audit logging via ctx.auditFn callback (never logs secrets)
//   - zod schema: host regex, credential length caps
//
// The admin gate, origin check, and DISABLE_TERMINAL flag are enforced by
// the HTTP upgrade handler in server.js (before this module is invoked).
//
// IMPORTANT: never log password / privateKey / passphrase / stream contents.
//
// See docs/WEB-SSH-TERMINAL.md for the feature overview, wire protocol, and security model.

const { Client: SshClient } = require('ssh2');
const { z } = require('zod');

// ── Resource limits ──────────────────────────────────────────────────────────

/** Maximum concurrent SSH sessions per portal user. */
const MAX_CONCURRENT_SESSIONS_PER_USER = 3;

/** Disconnect if no I/O in either direction for this long. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1_000; // 30 min

/** Hard cap — prevents forgotten tabs holding shells open indefinitely. */
const MAX_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1_000; // 8 h

const CONFIG_TIMEOUT_MS = 10_000;   // wait for initial config frame
const SSH_READY_TIMEOUT_MS = 15_000; // wait for ssh2 'ready' event

// Module-level session counter keyed by portal user id.
// Intentionally module-scoped so it survives across WS connections.
const activeSessionsByUser = new Map();

function incrementSession(userId) {
  if (!userId) return true; // no limit if no userId (shouldn't happen after auth gate)
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

// Allowlist of characters in a hostname/IP. Excludes whitespace, NUL, shell
// metacharacters (;&|`$<>!), newlines, and slashes that could abuse ssh2's
// config parsing or underlying OS calls.
const HOST_REGEX = /^[a-zA-Z0-9._\-:[\]]+$/;

const CONFIG_SCHEMA = z
  .object({
    host: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .regex(HOST_REGEX, 'host contains invalid characters'),
    port: z.number().int().min(1).max(65535).optional().default(22),
    username: z.string().trim().min(1).max(64),
    authMethod: z.enum(['key', 'password']),
    // 16 KiB covers any realistic SSH private key; prevents memory-pressure attacks.
    privateKey: z.string().min(1).max(16_384).optional(),
    // 1 KiB passphrase cap.
    passphrase: z.string().max(1_024).optional(),
    // 256-char password cap.
    password: z.string().min(1).max(256).optional(),
    cols: z.number().int().min(1).max(1000).optional().default(80),
    rows: z.number().int().min(1).max(1000).optional().default(24),
  })
  .refine(
    (v) =>
      (v.authMethod === 'key' && !!v.privateKey && !v.password) ||
      (v.authMethod === 'password' && !!v.password && !v.privateKey),
    { message: 'exactly one credential matching authMethod must be present' }
  );

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

// ── Main session handler ─────────────────────────────────────────────────────

/**
 * Wire an already-upgraded WebSocket to an SSH shell.
 *
 * @param {import('ws').WebSocket} ws
 * @param {{
 *   remoteAddress?: string,
 *   sessionUserId?: string,
 *   auditFn?: (params: object) => Promise<void>
 * }} ctx  Context injected by the upgrade handler in server.js. auditFn is an
 *          async callback that persists an audit log row — it must never receive
 *          secrets.
 */
function handleSshSession(ws, ctx = {}) {
  const { remoteAddress = 'unknown', sessionUserId, auditFn } = ctx;

  // ── Per-user concurrent session cap ──────────────────────────────────────
  if (!incrementSession(sessionUserId)) {
    sendStatus(ws, { type: 'error', message: 'session_limit_exceeded' });
    return safeCloseSocket(ws, 1013, 'session_limit_exceeded');
  }

  // Guard against double-decrement (ws 'close' and 'error' can both fire).
  let sessionDecremented = false;
  function endSession() {
    if (sessionDecremented) return;
    sessionDecremented = true;
    decrementSession(sessionUserId);
  }

  // Hoisted so audit/cleanup helpers in any closure can reference them.
  let cfg = null;        // populated from the first WS frame
  let sshConn = null;
  let sshStream = null;
  let configReceived = false;

  // ── Audit state ───────────────────────────────────────────────────────────
  let sessionStartedAt = null;
  let sessionOutcome = 'unknown';
  let auditOpenFired = false;
  let auditCloseFired = false;

  // ── Timer handles ─────────────────────────────────────────────────────────
  let configTimer = null;
  let readyTimer = null;
  let idleTimer = null;
  let lifetimeTimer = null;
  let keepaliveTimer = null;

  function clearAllTimers() {
    if (configTimer)  { clearTimeout(configTimer);  configTimer  = null; }
    if (readyTimer)   { clearTimeout(readyTimer);   readyTimer   = null; }
    if (idleTimer)    { clearTimeout(idleTimer);    idleTimer    = null; }
    if (lifetimeTimer){ clearTimeout(lifetimeTimer);lifetimeTimer = null; }
    if (keepaliveTimer){ clearInterval(keepaliveTimer); keepaliveTimer = null; }
  }

  // ── WebSocket keepalive ────────────────────────────────────────────────────
  // Reverse proxies (Traefik in some Coolify setups) drop a WebSocket that
  // carries no traffic shortly after the upgrade — and the only window with
  // no traffic is precisely between the client's config frame and the first
  // byte of SSH output, while the SSH handshake to the target runs (1–2s+).
  // Pinging on a sub-second cadence from t=0 keeps the connection non-idle
  // through that window. ws auto-answers with pong; browsers handle the
  // reverse direction. 750ms beats the aggressive ~1s idle drop we observed.
  const pingNow = () => {
    if (ws.readyState === ws.OPEN) {
      try { ws.ping(); } catch { /* socket dying */ }
    }
  };
  pingNow(); // fire immediately so the tunnel has traffic from t=0
  keepaliveTimer = setInterval(pingNow, 750);

  // ── Idle timer (resets on every I/O event) ────────────────────────────────
  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      console.log(
        `[terminal-ws] idle timeout host=${cfg ? cfg.host : '?'} session=${sessionUserId ?? 'n/a'}`
      );
      sessionOutcome = 'idle_timeout';
      sendStatus(ws, { type: 'error', message: 'idle_timeout' });
      if (sshStream) { try { sshStream.end(); } catch {} }
      safeCloseSocket(ws, 4008, 'idle_timeout');
    }, IDLE_TIMEOUT_MS);
  }

  // ── Audit helpers (fire-and-forget; never called with secrets) ────────────
  function fireAuditOpen() {
    if (auditOpenFired || !cfg || !auditFn) return;
    auditOpenFired = true;
    auditFn({
      action: 'terminal_open',
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      authMethod: cfg.authMethod,
      outcome: 'attempting',
    }).catch(() => {});
  }

  function fireAuditClose() {
    if (auditCloseFired || !cfg || !auditFn) return;
    auditCloseFired = true;
    auditFn({
      action: 'terminal_close',
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      authMethod: cfg.authMethod,
      outcome: sessionOutcome,
      durationMs: sessionStartedAt ? Date.now() - sessionStartedAt : 0,
    }).catch(() => {});
  }

  // ── Config receive timeout ────────────────────────────────────────────────
  configTimer = setTimeout(() => {
    if (configReceived) return;
    sendStatus(ws, { type: 'error', message: 'config_timeout' });
    safeCloseSocket(ws, 1008, 'config_timeout');
  }, CONFIG_TIMEOUT_MS);

  // ── Config frame (first WS message) ──────────────────────────────────────
  ws.once('message', (raw, isBinary) => {
    clearTimeout(configTimer);
    configTimer = null;
    configReceived = true;

    // Parse JSON
    let parsed;
    try {
      const text = isBinary ? raw.toString('utf8') : String(raw);
      parsed = JSON.parse(text);
    } catch {
      sendStatus(ws, { type: 'error', message: 'invalid_config_json' });
      return safeCloseSocket(ws, 1008, 'invalid_config_json');
    }

    // Validate with zod
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

    // Immediately push a server→client frame so the connection has traffic
    // in both directions before the (potentially multi-second) SSH handshake
    // begins — combined with the keepalive ping above, this prevents the
    // proxy from treating the upgrade as idle and dropping it.
    sendStatus(ws, { type: 'status', status: 'connecting' });

    // Do NOT include credentials in any log line.
    console.log(
      `[terminal-ws] connect host=${cfg.host} port=${cfg.port} user=${cfg.username} auth=${cfg.authMethod} from=${remoteAddress} session=${sessionUserId ?? 'n/a'}`
    );

    // ── Host allowlist ────────────────────────────────────────────────────
    const hostAllowlistEnv = process.env.TERMINAL_HOST_ALLOWLIST;
    if (hostAllowlistEnv) {
      const allowed = hostAllowlistEnv.split(',').map((h) => h.trim()).filter(Boolean);
      if (!allowed.includes(cfg.host)) {
        console.warn(
          `[terminal-ws] host "${cfg.host}" not in TERMINAL_HOST_ALLOWLIST — rejected session=${sessionUserId ?? 'n/a'}`
        );
        sessionOutcome = 'host_not_allowed';
        sendStatus(ws, { type: 'error', message: 'host_not_allowed' });
        return safeCloseSocket(ws, 1008, 'host_not_allowed');
      }
    }

    // Audit the attempt (before SSH so even failed auth attempts are recorded).
    fireAuditOpen();

    // ── SSH client setup ──────────────────────────────────────────────────
    sshConn = new SshClient();
    let readyFired = false;

    readyTimer = setTimeout(() => {
      if (readyFired) return;
      sessionOutcome = 'ssh_connect_timeout';
      sendStatus(ws, { type: 'error', message: 'ssh_connect_timeout' });
      try { sshConn.end(); } catch {}
      safeCloseSocket(ws, 1011, 'ssh_connect_timeout');
    }, SSH_READY_TIMEOUT_MS);

    sshConn.on('ready', () => {
      readyFired = true;
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }

      sshConn.shell(
        { term: 'xterm-256color', cols: cfg.cols, rows: cfg.rows },
        (err, stream) => {
          if (err) {
            sessionOutcome = 'shell_open_failed';
            sendStatus(ws, { type: 'error', message: 'shell_open_failed' });
            try { sshConn.end(); } catch {}
            return safeCloseSocket(ws, 1011, 'shell_open_failed');
          }

          sshStream = stream;
          sessionOutcome = 'connected';
          sendStatus(ws, { type: 'status', status: 'connected' });

          // Start the idle timer now that the shell is live.
          resetIdleTimer();

          // Hard cap: terminate session after MAX_SESSION_LIFETIME_MS.
          lifetimeTimer = setTimeout(() => {
            lifetimeTimer = null;
            console.log(
              `[terminal-ws] lifetime cap reached host=${cfg.host} session=${sessionUserId ?? 'n/a'}`
            );
            sessionOutcome = 'lifetime_exceeded';
            sendStatus(ws, { type: 'error', message: 'session_lifetime_exceeded' });
            if (sshStream) { try { sshStream.end(); } catch {} }
            safeCloseSocket(ws, 4008, 'session_lifetime_exceeded');
          }, MAX_SESSION_LIFETIME_MS);

          // SSH → client
          stream.on('data', (chunk) => {
            resetIdleTimer(); // SSH output resets the idle clock
            if (ws.readyState !== ws.OPEN) return;
            try { ws.send(chunk, { binary: true }); } catch {}
          });
          stream.stderr.on('data', (chunk) => {
            resetIdleTimer();
            if (ws.readyState !== ws.OPEN) return;
            try { ws.send(chunk, { binary: true }); } catch {}
          });

          stream.on('close', () => {
            console.log(`[terminal-ws] shell closed host=${cfg.host}`);
            if (sessionOutcome === 'connected') sessionOutcome = 'ssh_closed';
            sendStatus(ws, { type: 'status', status: 'closed' });
            try {
              if (ws.readyState === ws.OPEN) ws.send('\r\n[connection closed]\r\n');
            } catch {}
            try { sshConn.end(); } catch {}
            safeCloseSocket(ws, 1000, 'ssh_closed');
          });

          // Client → SSH: keystrokes and resize frames.
          // Replaces the bootstrap once-listener (config frame already consumed).
          ws.on('message', (frame, frameIsBinary) => {
            resetIdleTimer(); // client keystrokes reset the idle clock
            if (!sshStream) return;
            if (!frameIsBinary) {
              const asString = frame.toString('utf8');
              // Peek for a resize control envelope (text, short, starts with '{').
              if (
                asString.length > 0 &&
                asString.length < 256 &&
                asString[0] === '{'
              ) {
                let ctl;
                try { ctl = JSON.parse(asString); } catch { ctl = null; }
                if (ctl && ctl.type === 'resize') {
                  const cols = Number(ctl.cols);
                  const rows = Number(ctl.rows);
                  if (
                    Number.isInteger(cols) && Number.isInteger(rows) &&
                    cols > 0 && rows > 0 && cols <= 1000 && rows <= 1000
                  ) {
                    try { sshStream.setWindow(rows, cols, 0, 0); } catch {}
                  }
                  return;
                }
              }
              try { sshStream.write(asString); } catch {}
              return;
            }
            try { sshStream.write(frame); } catch {}
          });
        }
      );
    });

    sshConn.on('error', (err) => {
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
      // Only update outcome if we haven't already logged a more specific one.
      if (sessionOutcome === 'attempting' || sessionOutcome === 'unknown') {
        sessionOutcome = 'ssh_error';
      }
      // err.message from ssh2 is bounded and safe (auth errors, host-key
      // mismatch, etc.). We intentionally omit the stack trace.
      console.warn(
        `[terminal-ws] ssh error host=${cfg.host}: ${err && err.message ? err.message : 'unknown'}`
      );
      sendStatus(ws, { type: 'error', message: 'ssh_error' });
      try {
        if (ws.readyState === ws.OPEN) ws.send('\r\n[connection closed]\r\n');
      } catch {}
      safeCloseSocket(ws, 1011, 'ssh_error');
    });

    sshConn.on('close', () => {
      console.log(`[terminal-ws] ssh closed host=${cfg.host}`);
      if (sessionOutcome === 'connected') sessionOutcome = 'ssh_closed';
      safeCloseSocket(ws, 1000, 'ssh_closed');
    });

    // Build connect options — secrets are passed here and immediately scrubbed
    // after the call so they don't linger in memory beyond the handshake.
    const connectOpts = {
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      readyTimeout: SSH_READY_TIMEOUT_MS,
      keepaliveInterval: 30_000,
    };
    if (cfg.authMethod === 'key') {
      connectOpts.privateKey = cfg.privateKey;
      if (cfg.passphrase) connectOpts.passphrase = cfg.passphrase;
    } else {
      connectOpts.password = cfg.password;
    }

    try {
      sshConn.connect(connectOpts);
    } catch {
      if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
      sessionOutcome = 'ssh_connect_failed';
      sendStatus(ws, { type: 'error', message: 'ssh_connect_failed' });
      safeCloseSocket(ws, 1011, 'ssh_connect_failed');
    } finally {
      // Scrub secrets from connectOpts and cfg as soon as ssh2 has consumed
      // them. cfg stays in scope (closures use cfg.host for logging) but the
      // credential fields are cleared to limit their in-memory lifetime.
      connectOpts.privateKey = undefined;
      connectOpts.passphrase = undefined;
      connectOpts.password   = undefined;
      if (cfg) {
        cfg.privateKey = undefined;
        cfg.passphrase = undefined;
        cfg.password   = undefined;
      }
    }
  }); // end ws.once('message') config handler

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  ws.on('close', () => {
    clearAllTimers();
    endSession();
    if (sshConn) { try { sshConn.end(); } catch {} }
    fireAuditClose();
  });

  ws.on('error', (err) => {
    console.warn(
      `[terminal-ws] ws error: ${err && err.message ? err.message : 'unknown'}`
    );
    if (sessionOutcome === 'connected') sessionOutcome = 'ws_error';
    clearAllTimers();
    endSession();
    if (sshConn) { try { sshConn.end(); } catch {} }
    fireAuditClose();
  });
}

module.exports = { handleSshSession };
