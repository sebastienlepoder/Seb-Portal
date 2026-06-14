'use strict';

// Custom Next.js server. Boots Next normally and additionally hosts a
// WebSocket endpoint at /api/terminal/ws used by the in-portal SSH terminal.
// Other upgrade requests are forwarded to Next's own upgrade handler so
// HMR keeps working in dev.
// See docs/WEB-SSH-TERMINAL.md for the feature overview, wire protocol, and security model.

const http = require('http');
const { parse: parseUrl } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { getIronSession } = require('iron-session');

const { handleSshSession } = require('./src/server/terminal-ws.js');
const { handleClaudeSession } = require('./src/server/claude-pty.js');

// Marker so API routes (which run in THIS same Node process) can confirm the
// custom WS-hosting server is the one actually serving — not the standalone
// Next server, which has no /api/terminal/ws upgrade handler and would let
// the SSH bridge silently fail. /api/terminal/auth-check surfaces this.
globalThis.__PORTAL_TERMINAL_WS__ = true;

// Declare these early so the helper functions below can close over them.
const dev = process.env.NODE_ENV !== 'production';
// Always bind all interfaces. Docker/Coolify set HOSTNAME to the container id,
// so `process.env.HOSTNAME` would bind the server to a single interface — that
// broke the loopback healthcheck (`wget 127.0.0.1` → ECONNREFUSED, health
// "unknown") and left the upstream connection brittle behind the proxy. Bind
// 0.0.0.0 explicitly and never feed the container-id hostname to Next.
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// ── Prisma (lazy singleton for audit logging) ────────────────────────────────
let _prisma = null;
function getPrismaClient() {
  if (!_prisma) {
    try {
      const { PrismaClient } = require('@prisma/client');
      _prisma = new PrismaClient();
    } catch (e) {
      console.warn('[server] Prisma unavailable — terminal audit logging disabled:', e && e.message);
    }
  }
  return _prisma;
}

/**
 * Persist a terminal audit log row. Never called with secret values.
 * Failures are swallowed so they never block or crash the SSH session.
 */
// eslint-disable-next-line no-shadow -- `port` here is the SSH target port, distinct from the module-level HTTP server port.
async function auditTerminalEvent({ userId, action, host, port: sshPort, username, authMethod, outcome, durationMs, ipAddress }) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const details = { host, port: sshPort, username, authMethod, outcome };
  if (durationMs != null) details.durationMs = durationMs;
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        details: JSON.stringify(details),
        ipAddress: ipAddress || null,
      },
    });
  } catch (e) {
    console.error('[server] terminal audit log error:', e && e.message);
  }
}

/**
 * Persist a Claude CLI audit log row. Never called with secret values.
 * Failures are swallowed so they never block or crash the CLI session.
 */
async function auditClaudeEvent({ userId, action, projectId, projectName, outcome, durationMs, ipAddress }) {
  const prisma = getPrismaClient();
  if (!prisma) return;
  const details = { projectId, projectName, outcome };
  if (durationMs != null) details.durationMs = durationMs;
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        details: JSON.stringify(details),
        ipAddress: ipAddress || null,
      },
    });
  } catch (e) {
    console.error('[server] claude-cli audit log error:', e && e.message);
  }
}

/** Look up a project by id for the Claude CLI bridge. Returns null on any error. */
async function getProjectById(id) {
  const prisma = getPrismaClient();
  if (!prisma) return null;
  try {
    return await prisma.project.findUnique({ where: { id } });
  } catch (e) {
    console.warn('[server] claude-cli project lookup error:', e && e.message);
    return null;
  }
}

// ── Origin allowlist (defence-in-depth against CSRF-style WS hijacks) ────────
// Browsers always include an Origin header on cross-origin WS upgrades.
// If Origin is present AND we have a configured BASE_URL, it must match.
// Same-process non-browser tools that omit Origin are allowed (dev/test).
let _allowedOrigins = null;
function getAllowedOrigins() {
  if (_allowedOrigins) return _allowedOrigins;
  _allowedOrigins = new Set();
  if (process.env.BASE_URL) {
    try {
      _allowedOrigins.add(new URL(process.env.BASE_URL).origin);
    } catch {
      console.warn('[server] BASE_URL is not a valid URL — Origin check will be lenient');
    }
  }
  if (dev) {
    _allowedOrigins.add(`http://localhost:${port}`);
    _allowedOrigins.add(`http://127.0.0.1:${port}`);
  }
  return _allowedOrigins;
}

// Keep this aligned with src/lib/auth.ts SESSION_OPTIONS.
const SESSION_OPTIONS = {
  password: process.env.AUTH_SECRET || '',
  cookieName: 'lepoder_session',
  cookieOptions: {
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  },
};

const TERMINAL_WS_PATH = '/api/terminal/ws';
const CLAUDE_WS_PATH = '/api/claude/ws';

function parseCookieHeader(header) {
  if (!header) return [];
  return header.split(';').map((pair) => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name || '', value: rest.join('=') || '' };
  });
}

// iron-session calls `cookieStore.get(name)` (not `.getAll()`) to read the
// session cookie — see iron-session/dist/index.js:34. A getAll-only store
// returns undefined and every WS upgrade is rejected with 401 even for
// properly authenticated users. Implement the Next.js cookies() shape:
// get(name), getAll(), and no-op set/delete so iron-session can write its
// rotated cookie (we have no response object here, so the rotation is
// silently dropped — acceptable for a read-only auth check during upgrade).
function buildCookieStore(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  return {
    get(name) {
      const found = cookies.find((c) => c.name === name);
      return found ? { name: found.name, value: found.value } : undefined;
    },
    getAll() {
      return cookies;
    },
    set() {
      /* no-op: WS upgrade is read-only */
    },
    delete() {
      /* no-op: WS upgrade is read-only */
    },
  };
}

async function readSession(req) {
  return getIronSession(buildCookieStore(req), SESSION_OPTIONS);
}

function rejectUpgrade(socket, statusCode, statusText) {
  const reason = `${statusCode} ${statusText}`;
  try {
    socket.write(
      `HTTP/1.1 ${reason}\r\n` +
        'Connection: close\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n'
    );
  } catch {
    /* ignore */
  }
  try {
    socket.destroy();
  } catch {
    /* ignore */
  }
}

async function bootstrap() {
  const app = next({ dev, hostname, dir: __dirname });
  const nextHandler = app.getRequestHandler();

  await app.prepare();

  const httpServer = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parseUrl(req.url, true);
      await nextHandler(req, res, parsedUrl);
    } catch (err) {
      console.error('[server] request handler error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  // perMessageDeflate is DISABLED deliberately. With it on, `ws` negotiates
  // permessage-deflate when the browser offers it and then sends compressed
  // frames (RSV1 bit set). Coolify's Traefik strips the
  // `Sec-WebSocket-Extensions` header from the 101 response, so the browser
  // never enables decompression on its side — it then receives an RSV1 frame
  // it didn't negotiate and aborts with "RSV1 must be clear" → close 1006,
  // before any app data flows. This silently broke BOTH the SSH terminal and
  // the Claude CLI (same server). Disabling compression makes every frame
  // uncompressed (RSV1 always clear), which the client always accepts.
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  httpServer.on('upgrade', async (req, socket, head) => {
    let pathname = '';
    try {
      pathname = parseUrl(req.url || '').pathname || '';
    } catch {
      pathname = '';
    }

    // Tolerate an optional trailing slash so a proxy that normalises the path
    // can't accidentally divert the upgrade to the catch-all branch.
    const isTerminalPath =
      pathname === TERMINAL_WS_PATH || pathname === `${TERMINAL_WS_PATH}/`;
    const isClaudePath =
      pathname === CLAUDE_WS_PATH || pathname === `${CLAUDE_WS_PATH}/`;
    const isBridgePath = isTerminalPath || isClaudePath;

    if (!isBridgePath) {
      // Never hand a non-bridge upgrade to Next. In standalone, Next's upgrade
      // handler invokes handleRequestImpl with the raw socket as the response
      // and throws "Cannot read properties of undefined (reading 'bind')" (the
      // socket has no setHeader), which surfaces to the client as a corrupt
      // frame / "Internal Server Error". `dev` was also unreliable in the
      // deployed container, so don't condition on it — there are no legitimate
      // non-bridge upgrades in this deployment; close them unconditionally.
      socket.destroy();
      return;
    }

    // Feature flags — disable either bridge independently.
    if (isTerminalPath && process.env.DISABLE_TERMINAL === 'true') {
      return rejectUpgrade(socket, 503, 'Service Unavailable');
    }
    if (isClaudePath && process.env.DISABLE_CLAUDE_CLI === 'true') {
      return rejectUpgrade(socket, 503, 'Service Unavailable');
    }

    // Origin check — defence-in-depth against CSRF-style WS hijacks.
    // Browsers always send Origin on cross-origin upgrades; if it's present
    // and doesn't match the portal host we reject immediately (before the
    // handshake). This stays synchronous — see the handshake note below.
    const reqOrigin = (req.headers['origin'] || '').trim();
    if (reqOrigin) {
      const allowed = getAllowedOrigins();
      if (allowed.size > 0 && !allowed.has(reqOrigin)) {
        console.warn(`[server] terminal-ws: rejected upgrade from origin="${reqOrigin}"`);
        return rejectUpgrade(socket, 403, 'Forbidden');
      }
    }

    const cookieNames = parseCookieHeader(req.headers.cookie || '').map((c) => c.name);
    console.log('[server] terminal-ws: upgrade attempt', {
      origin: reqOrigin || '(none)',
      cookieHeaderPresent: !!req.headers.cookie,
      cookieNames,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      authSecretLen: (process.env.AUTH_SECRET || '').length,
      upgradeHeader: req.headers['upgrade'] || '(none)',
      connectionHeader: req.headers['connection'] || '(none)',
      hasWsKey: !!req.headers['sec-websocket-key'],
      wsVersion: req.headers['sec-websocket-version'] || '(none)',
      httpVersion: req.httpVersion,
    });

    const remoteAddress =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

    // Surface a silent handshake abort (e.g. a proxy stripping headers).
    socket.on('error', (err) => {
      console.warn('[server] terminal-ws: upgrade socket error:', err && err.message);
    });

    // Complete the WebSocket handshake SYNCHRONOUSLY, then authenticate on the
    // open connection.
    //
    // Previously we did the async `readSession()` BEFORE handleUpgrade. Behind
    // a reverse proxy that left a window in which the proxy half-closed the
    // upstream socket; by the time handleUpgrade ran, the socket was no longer
    // readable/writable, so ws.completeUpgrade() hit its "client sent FIN"
    // guard and SILENTLY destroyed the socket — no 101, no callback, no error.
    // The browser saw a bare 1006 and the session never started. Running the
    // handshake in the same tick as the 'upgrade' event keeps the socket live,
    // so the 101 goes out immediately. Auth still gates the SSH bridge: an
    // unauthenticated socket is opened only to be closed before any shell runs.
    wss.handleUpgrade(req, socket, head, async (ws) => {
      console.log('[server] terminal-ws: handshake complete (101 sent) — authenticating');

      // Pause incoming frames until the session handler has wired its message
      // listeners. The client sends its config frame the instant it sees the
      // 101, which is during the async auth below — without pausing, that frame
      // would be emitted with no listener attached and silently dropped, so the
      // SSH session would hang waiting for a config that already arrived.
      ws.pause();

      // Long-lived session: drop socket idle timeout, enable TCP keepalive.
      try {
        socket.setTimeout(0);
        socket.setKeepAlive(true, 30_000);
      } catch {
        /* best-effort */
      }

      const denyAndClose = (message, code) => {
        ws.resume(); // undo the pause() above so the close can flush
        try {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message }));
          }
        } catch { /* ignore */ }
        try { ws.close(code, message); } catch { /* ignore */ }
      };

      let session;
      try {
        session = await readSession(req);
      } catch (err) {
        console.warn('[server] terminal-ws: session read failed:', err && err.message);
        return denyAndClose('unauthorized', 4401);
      }

      console.log('[server] terminal-ws: session read result', {
        hasSession: !!session,
        hasUser: !!(session && session.user),
        userId: session && session.user && session.user.id,
        role: session && session.user && session.user.role,
      });

      if (!session || !session.user) {
        console.warn('[server] terminal-ws: no session.user — closing 4401');
        return denyAndClose('unauthorized', 4401);
      }

      // Admin-only gate — this feature grants shell access to every host
      // reachable from the portal server. Restrict to admin role.
      if (session.user.role !== 'admin') {
        console.warn(`[server] terminal-ws: non-admin user "${session.user.id}" closed 4403`);
        return denyAndClose('forbidden', 4403);
      }

      const sessionUserId = session.user.id;

      // Push a frame to the client the instant the upgrade is authorized, BEFORE
      // the handler waits for the client's first frame. Coolify's Traefik tears
      // down a freshly-upgraded WebSocket whose backend stays silent after the
      // 101 and injects its own "Internal Server Error" upstream page (which the
      // browser then reads as a malformed frame → close 1006). The reject path
      // only ever worked because it writes immediately; this mirrors that for
      // authenticated sessions so the tunnel survives into the handler. Sending
      // while the socket is paused is fine — pause() only gates the read side.
      try { ws.send(JSON.stringify({ type: 'status', status: 'connecting' })); } catch { /* ignore */ }

      try {
        if (isClaudePath) {
          // Audit callback scoped to this session; never receives secret values.
          const auditFn = (params) =>
            auditClaudeEvent({ ipAddress: remoteAddress, userId: sessionUserId, ...params });
          handleClaudeSession(ws, {
            remoteAddress,
            sessionUserId,
            githubToken: process.env.GITHUB_TOKEN || undefined,
            getProjectById,
            auditFn,
          });
        } else {
          const auditFn = (params) =>
            auditTerminalEvent({ ipAddress: remoteAddress, userId: sessionUserId, ...params });
          handleSshSession(ws, { remoteAddress, sessionUserId, auditFn });
        }
        // Listeners are wired now — let the buffered config frame through.
        ws.resume();
      } catch (err) {
        console.error('[server] ws bridge handler crashed:', err);
        try { ws.resume(); } catch { /* ignore */ }
        try { ws.close(1011, 'internal_error'); } catch { /* ignore */ }
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`[server] ready on http://${hostname}:${port} (dev=${dev})`);
  });

  function shutdown(signal) {
    console.log(`[server] received ${signal}, shutting down`);
    try {
      wss.close();
    } catch {
      /* ignore */
    }
    httpServer.close(() => process.exit(0));
    // Hard exit safety net.
    setTimeout(() => process.exit(0), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[server] fatal bootstrap error:', err);
  process.exit(1);
});
