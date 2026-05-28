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

// Marker so API routes (which run in THIS same Node process) can confirm the
// custom WS-hosting server is the one actually serving — not the standalone
// Next server, which has no /api/terminal/ws upgrade handler and would let
// the SSH bridge silently fail. /api/terminal/auth-check surfaces this.
globalThis.__PORTAL_TERMINAL_WS__ = true;

// Declare these early so the helper functions below can close over them.
const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
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
  const nextUpgrade = app.getUpgradeHandler ? app.getUpgradeHandler() : null;

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

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    let pathname = '';
    try {
      pathname = parseUrl(req.url || '').pathname || '';
    } catch {
      pathname = '';
    }

    if (pathname !== TERMINAL_WS_PATH) {
      if (nextUpgrade) {
        try {
          nextUpgrade(req, socket, head);
        } catch (err) {
          console.error('[server] next upgrade error:', err);
          socket.destroy();
        }
      } else {
        // Production standalone has no HMR — close any stray upgrades.
        socket.destroy();
      }
      return;
    }

    // Feature flag — disables the entire Web SSH Terminal if set.
    if (process.env.DISABLE_TERMINAL === 'true') {
      return rejectUpgrade(socket, 503, 'Service Unavailable');
    }

    // Origin check — defence-in-depth against CSRF-style WS hijacks.
    // Browsers always send Origin on cross-origin upgrades; if it's present
    // and doesn't match the portal host we reject immediately (before reading
    // the session cookie).
    const reqOrigin = (req.headers['origin'] || '').trim();
    if (reqOrigin) {
      const allowed = getAllowedOrigins();
      if (allowed.size > 0 && !allowed.has(reqOrigin)) {
        console.warn(`[server] terminal-ws: rejected upgrade from origin="${reqOrigin}"`);
        return rejectUpgrade(socket, 403, 'Forbidden');
      }
    }

    // Validate session BEFORE upgrading so we never expose the SSH bridge
    // to anonymous clients.
    const cookieNames = parseCookieHeader(req.headers.cookie || '').map((c) => c.name);
    console.log('[server] terminal-ws: upgrade attempt', {
      origin: reqOrigin || '(none)',
      cookieHeaderPresent: !!req.headers.cookie,
      cookieNames,
      hasAuthSecret: !!process.env.AUTH_SECRET,
      authSecretLen: (process.env.AUTH_SECRET || '').length,
    });
    let session;
    try {
      session = await readSession(req);
    } catch (err) {
      console.warn('[server] terminal-ws: session read failed:', err && err.message);
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    console.log('[server] terminal-ws: session read result', {
      hasSession: !!session,
      hasUser: !!(session && session.user),
      userId: session && session.user && session.user.id,
      role: session && session.user && session.user.role,
    });

    if (!session || !session.user) {
      console.warn('[server] terminal-ws: no session.user — rejecting 401');
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    // Admin-only gate — this feature grants shell access to every host
    // reachable from the portal server. Restrict to admin role.
    if (session.user.role !== 'admin') {
      console.warn(
        `[server] terminal-ws: non-admin user "${session.user.id}" rejected`
      );
      return rejectUpgrade(socket, 403, 'Forbidden');
    }

    const sessionUserId = session.user.id;
    const remoteAddress =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

    // Build a scoped audit callback that never has access to secret values.
    const auditFn = (params) =>
      auditTerminalEvent({ ipAddress: remoteAddress, userId: sessionUserId, ...params });

    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        handleSshSession(ws, { remoteAddress, sessionUserId, auditFn });
      } catch (err) {
        console.error('[server] terminal-ws handler crashed:', err);
        try {
          ws.close(1011, 'internal_error');
        } catch {
          /* ignore */
        }
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
