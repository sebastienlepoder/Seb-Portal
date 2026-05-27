'use strict';

// Web SSH terminal bridge. Accepts an already-upgraded WebSocket, awaits a
// single JSON config frame from the client, opens an ssh2 shell, and pipes
// bytes both ways. Resize frames are JSON; everything else is raw shell I/O
// carried over binary frames.
//
// IMPORTANT: never log password/privateKey/stream contents. Host/username
// and lifecycle states are fine.

const { Client: SshClient } = require('ssh2');
const { z } = require('zod');

const CONFIG_SCHEMA = z
  .object({
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535).optional().default(22),
    username: z.string().trim().min(1).max(64),
    authMethod: z.enum(['key', 'password']),
    privateKey: z.string().min(1).optional(),
    passphrase: z.string().optional(),
    password: z.string().min(1).optional(),
    cols: z.number().int().min(1).max(1000).optional().default(80),
    rows: z.number().int().min(1).max(1000).optional().default(24),
  })
  .refine(
    (v) =>
      (v.authMethod === 'key' && !!v.privateKey && !v.password) ||
      (v.authMethod === 'password' && !!v.password && !v.privateKey),
    { message: 'exactly one credential matching authMethod must be present' }
  );

const CONFIG_TIMEOUT_MS = 10_000;
const SSH_READY_TIMEOUT_MS = 15_000;

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

/**
 * @param {import('ws').WebSocket} ws
 * @param {{ remoteAddress?: string, sessionUserId?: string }} ctx
 */
function handleSshSession(ws, ctx = {}) {
  const remote = ctx.remoteAddress || 'unknown';
  let configReceived = false;
  let sshConn = null;
  let sshStream = null;

  const configTimer = setTimeout(() => {
    if (configReceived) return;
    sendStatus(ws, { type: 'error', message: 'config_timeout' });
    safeCloseSocket(ws, 1008, 'config_timeout');
  }, CONFIG_TIMEOUT_MS);

  ws.once('message', (raw, isBinary) => {
    clearTimeout(configTimer);
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

    const cfg = result.data;
    // Do NOT include credentials in any log line.
    console.log(
      `[terminal-ws] connect host=${cfg.host} port=${cfg.port} user=${cfg.username} auth=${cfg.authMethod} from=${remote} session=${ctx.sessionUserId ?? 'n/a'}`
    );

    sshConn = new SshClient();
    let readyFired = false;
    const readyTimer = setTimeout(() => {
      if (readyFired) return;
      sendStatus(ws, { type: 'error', message: 'ssh_connect_timeout' });
      try {
        sshConn.end();
      } catch {
        /* ignore */
      }
      safeCloseSocket(ws, 1011, 'ssh_connect_timeout');
    }, SSH_READY_TIMEOUT_MS);

    sshConn.on('ready', () => {
      readyFired = true;
      clearTimeout(readyTimer);
      sshConn.shell(
        { term: 'xterm-256color', cols: cfg.cols, rows: cfg.rows },
        (err, stream) => {
          if (err) {
            sendStatus(ws, { type: 'error', message: 'shell_open_failed' });
            try {
              sshConn.end();
            } catch {
              /* ignore */
            }
            return safeCloseSocket(ws, 1011, 'shell_open_failed');
          }

          sshStream = stream;
          sendStatus(ws, { type: 'status', status: 'connected' });

          stream.on('data', (chunk) => {
            if (ws.readyState !== ws.OPEN) return;
            try {
              ws.send(chunk, { binary: true });
            } catch {
              /* ignore */
            }
          });
          stream.stderr.on('data', (chunk) => {
            if (ws.readyState !== ws.OPEN) return;
            try {
              ws.send(chunk, { binary: true });
            } catch {
              /* ignore */
            }
          });

          stream.on('close', () => {
            console.log(`[terminal-ws] shell closed host=${cfg.host}`);
            sendStatus(ws, { type: 'status', status: 'closed' });
            try {
              if (ws.readyState === ws.OPEN) {
                ws.send('\r\n[connection closed]\r\n');
              }
            } catch {
              /* ignore */
            }
            try {
              sshConn.end();
            } catch {
              /* ignore */
            }
            safeCloseSocket(ws, 1000, 'ssh_closed');
          });

          // Replace the bootstrap one-shot listener with the full pump now
          // that the shell is wired. The one-shot handler above already
          // consumed exactly one message (the config), so newly arriving
          // frames flow into the handler below.
          ws.on('message', (frame, frameIsBinary) => {
            if (!sshStream) return;
            // Text frames *may* be control envelopes ({type:'resize'}).
            // Anything else (including binary frames) is keystrokes.
            if (!frameIsBinary) {
              const asString = frame.toString('utf8');
              if (
                asString.length > 0 &&
                asString.length < 256 &&
                asString[0] === '{'
              ) {
                let ctl;
                try {
                  ctl = JSON.parse(asString);
                } catch {
                  ctl = null;
                }
                if (ctl && ctl.type === 'resize') {
                  const cols = Number(ctl.cols);
                  const rows = Number(ctl.rows);
                  if (
                    Number.isInteger(cols) &&
                    Number.isInteger(rows) &&
                    cols > 0 &&
                    rows > 0 &&
                    cols <= 1000 &&
                    rows <= 1000
                  ) {
                    try {
                      sshStream.setWindow(rows, cols, 0, 0);
                    } catch {
                      /* ignore */
                    }
                  }
                  return;
                }
              }
              try {
                sshStream.write(asString);
              } catch {
                /* ignore */
              }
              return;
            }
            try {
              sshStream.write(frame);
            } catch {
              /* ignore */
            }
          });
        }
      );
    });

    sshConn.on('error', (err) => {
      clearTimeout(readyTimer);
      // err.message from ssh2 is bounded and safe (e.g. auth errors)
      console.warn(
        `[terminal-ws] ssh error host=${cfg.host}: ${err && err.message ? err.message : 'unknown'}`
      );
      sendStatus(ws, { type: 'error', message: 'ssh_error' });
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send('\r\n[connection closed]\r\n');
        }
      } catch {
        /* ignore */
      }
      safeCloseSocket(ws, 1011, 'ssh_error');
    });

    sshConn.on('close', () => {
      console.log(`[terminal-ws] ssh closed host=${cfg.host}`);
      safeCloseSocket(ws, 1000, 'ssh_closed');
    });

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
    } catch (e) {
      clearTimeout(readyTimer);
      sendStatus(ws, { type: 'error', message: 'ssh_connect_failed' });
      safeCloseSocket(ws, 1011, 'ssh_connect_failed');
    }
  });

  ws.on('close', () => {
    clearTimeout(configTimer);
    if (sshConn) {
      try {
        sshConn.end();
      } catch {
        /* ignore */
      }
    }
  });

  ws.on('error', (err) => {
    clearTimeout(configTimer);
    console.warn(
      `[terminal-ws] ws error: ${err && err.message ? err.message : 'unknown'}`
    );
    if (sshConn) {
      try {
        sshConn.end();
      } catch {
        /* ignore */
      }
    }
  });
}

module.exports = { handleSshSession };
