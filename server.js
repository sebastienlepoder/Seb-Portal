'use strict';

// Custom Next.js server. Boots Next normally and additionally hosts a
// WebSocket endpoint at /api/terminal/ws used by the in-portal SSH terminal.
// Other upgrade requests are forwarded to Next's own upgrade handler so
// HMR keeps working in dev.

const http = require('http');
const { parse: parseUrl } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { getIronSession } = require('iron-session');

const { handleSshSession } = require('./src/server/terminal-ws.js');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

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

// iron-session accepts any { getAll(): {name,value}[] } shape; we use it to
// read the session cookie without instantiating Next's full request lifecycle.
async function readSession(req) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const cookieStore = { getAll: () => cookies };
  return getIronSession(cookieStore, SESSION_OPTIONS);
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

    // Validate session BEFORE upgrading so we never expose the SSH bridge
    // to anonymous clients.
    let session;
    try {
      session = await readSession(req);
    } catch (err) {
      console.warn('[server] terminal-ws session read failed:', err && err.message);
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    if (!session || !session.user) {
      return rejectUpgrade(socket, 401, 'Unauthorized');
    }

    const sessionUserId = session.user.id;
    const remoteAddress =
      (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown';

    wss.handleUpgrade(req, socket, head, (ws) => {
      try {
        handleSshSession(ws, { remoteAddress, sessionUserId });
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
