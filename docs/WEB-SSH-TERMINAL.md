# Web SSH Terminal

Admin-only in-portal terminal that opens an interactive SSH shell to any host reachable from the portal server (Tailscale nodes, LAN machines, etc.) through an Xterm.js frontend bridged to `ssh2` over WebSocket.

## How It Works

### Frontend

`/terminal` (rendered by `src/app/terminal/page.tsx`) is gated to `role === 'admin'` both client-side and at the WebSocket upgrade. The page renders an SSH connection form and, once connected, an Xterm.js terminal. Only non-secret fields (`host`, `port`, `username`, `authMethod`) are persisted to `localStorage`; private keys and passwords are never written there.

### WebSocket endpoint

The browser connects to `/api/terminal/ws` over `ws://` or `wss://`. This path is handled by the custom HTTP server (`server.js`), not by Next.js — it intercepts `upgrade` events before Next can process them.

### Authentication and authorisation

All of the following are evaluated before the WebSocket upgrade is accepted:

1. **Feature flag** — if `DISABLE_TERMINAL=true`, the upgrade is rejected with `503 Service Unavailable`.
2. **Origin check** — if the `Origin` request header is present and `BASE_URL` is configured, the origin must match. Mismatches are rejected with `403 Forbidden`.
3. **Session validation** — the `iron-session` cookie is read and decrypted. Missing or invalid sessions are rejected with `401 Unauthorized`.
4. **Admin gate** — non-admin users are rejected with `403 Forbidden`.

### SSH bridge

`src/server/terminal-ws.js` owns everything after the upgrade. It waits for one JSON config frame from the client, validates it with a Zod schema, optionally checks the target host against `TERMINAL_HOST_ALLOWLIST`, then opens an `ssh2.Client.shell` and pipes bytes in both directions:

- **SSH → client**: shell output is forwarded as binary WebSocket frames.
- **Client → SSH**: incoming binary frames and text frames (excluding resize control envelopes) are written to the shell stream.

---

## Wire Protocol

### 1 — Config frame (client → server, first text frame)

Sent immediately after `ws.onopen`. Must be the first message on the connection.

```json
{
  "host": "my-server.tail12345.ts.net",
  "port": 22,
  "username": "root",
  "authMethod": "key",
  "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
  "passphrase": "optional-key-passphrase",
  "cols": 220,
  "rows": 50
}
```

Or with password auth:

```json
{
  "host": "192.168.1.10",
  "port": 22,
  "username": "admin",
  "authMethod": "password",
  "password": "secret",
  "cols": 220,
  "rows": 50
}
```

Field constraints (enforced by Zod):

| Field | Constraint |
|---|---|
| `host` | 1–253 chars, `[a-zA-Z0-9._\-:\[\]]+` only |
| `port` | integer 1–65535; defaults to `22` |
| `username` | 1–64 chars |
| `authMethod` | `"key"` or `"password"` |
| `privateKey` | 1–16 384 chars; required when `authMethod === "key"` |
| `passphrase` | 0–1 024 chars; optional |
| `password` | 1–256 chars; required when `authMethod === "password"` |
| `cols` / `rows` | integer 1–1 000; default 80 × 24 |

Exactly one credential type may be present — the one matching `authMethod`.

### 2 — Resize frame (client → server, subsequent text frames)

```json
{ "type": "resize", "cols": 240, "rows": 55 }
```

Sent by the frontend whenever the Xterm.js container changes size. The server calls `sshStream.setWindow(rows, cols, 0, 0)` without writing to the shell.

### 3 — Status frames (server → client, text)

Connected confirmation:
```json
{ "type": "status", "status": "connected" }
```

Error (connection refused, validation failure, timeout, etc.):
```json
{ "type": "error", "message": "host_not_allowed" }
```

Common error `message` values: `config_timeout`, `invalid_config_json`, `invalid_config`, `host_not_allowed`, `ssh_connect_timeout`, `ssh_connect_failed`, `shell_open_failed`, `ssh_error`, `idle_timeout`, `session_lifetime_exceeded`, `session_limit_exceeded`.

### 4 — Binary frames (server → client)

Raw PTY output bytes from the remote shell.

### 5 — Session-close trailer (server → client, text)

```
\r\n[connection closed]\r\n
```

Sent as a plain text frame immediately before the server closes the WebSocket (on normal shell exit or on SSH error).

---

## Security Model

| What | Where |
|---|---|
| Feature kill switch (`DISABLE_TERMINAL=true`) | `server.js` upgrade handler |
| WebSocket origin check via `BASE_URL` | `server.js` |
| iron-session authentication (pre-upgrade) | `server.js` |
| Admin-role gate (pre-upgrade) | `server.js` |
| Target host allowlist (`TERMINAL_HOST_ALLOWLIST`) | `src/server/terminal-ws.js` |
| Per-user concurrent session cap (max 3) | `src/server/terminal-ws.js` |
| Idle timeout (30 min, resets on any I/O) | `src/server/terminal-ws.js` |
| Hard session lifetime cap (8 h) | `src/server/terminal-ws.js` |
| Zod-validated config frame (host regex, length caps) | `src/server/terminal-ws.js` |
| Audit log for `terminal_open` and `terminal_close` | `server.js` → `AuditLog` table |
| Secrets scrubbed from memory post-handshake | `src/server/terminal-ws.js` (`finally` block) |
| Secrets never written to localStorage | `src/app/terminal/page.tsx` (`PersistedConnection` type) |

Audit rows include `host`, `port`, `username`, `authMethod`, `outcome`, and `durationMs` (on close). They never include `password`, `privateKey`, or `passphrase`.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DISABLE_TERMINAL` | unset (feature enabled) | Set to `true` to reject all `/api/terminal/ws` upgrade requests with `503`. Takes effect on restart. |
| `TERMINAL_HOST_ALLOWLIST` | unset (any host allowed) | Comma-separated list of permitted SSH target hostnames/IPs. Connection attempts to unlisted hosts are rejected with `host_not_allowed`. |
| `BASE_URL` | unset | Full portal URL (e.g. `https://lepoder.com`). When set, the server extracts its origin and rejects WebSocket upgrade requests whose `Origin` header does not match. Unset = origin check is skipped (less strict). |

---

## Operator Runbook

### Disable the terminal entirely

```env
DISABLE_TERMINAL=true
```

Restart the portal. All upgrade requests to `/api/terminal/ws` are rejected with `503 Service Unavailable` before any authentication is attempted. The sidebar nav entry is also hidden when this flag is set.

### Restrict to specific hosts

```env
TERMINAL_HOST_ALLOWLIST=my-server.tail12345.ts.net,10.0.0.5
```

Restart the portal. Connection attempts to any host not in the list are rejected after the config frame is received and the `terminal_open` audit row is written. Existing sessions are not affected until they reconnect.

### Audit session activity

Query the `AuditLog` table:

```sql
SELECT
  createdAt,
  userId,
  ipAddress,
  details
FROM AuditLog
WHERE action IN ('terminal_open', 'terminal_close')
ORDER BY createdAt DESC;
```

The `details` JSON column contains `host`, `port`, `username`, `authMethod`, `outcome`, and (for `terminal_close`) `durationMs`.

### Troubleshoot "WebSocket connection failed"

The browser surfaces WS upgrade failures as close code `1006`. To diagnose, check the raw HTTP response from the upgrade request — the portal server writes a complete HTTP/1.1 response before closing the socket:

| HTTP status | Cause |
|---|---|
| `401 Unauthorized` | No valid session cookie |
| `403 Forbidden` | Non-admin user, or Origin mismatch |
| `503 Service Unavailable` | `DISABLE_TERMINAL=true` |

Use the browser Network tab (filter by "WS") and inspect the failed handshake request to see the status code.

---

## Known Limitations

- **One PTY per connection** — no tab or split-pane support; each WebSocket connection maps to exactly one `ssh2.Client.shell`.
- **No host-key verification UI** — `ssh2` uses its default host-key handling (accepts anything by default). There is no mechanism to display or pin host keys through the portal.
- **No session recording** — terminal I/O is piped in real time and is not stored or replayable. The audit log records metadata only.
