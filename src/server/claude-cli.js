'use strict';

// Shared Claude CLI helpers used by BOTH the WS PTY bridge (claude-pty.js, run
// by the plain-node custom server) and the Next.js API routes. It must stay
// free of native modules (no node-pty) so Next can bundle it into a route
// without choking on .node bindings.
//
// Responsibilities:
//   - locate the `claude` binary (postinstall-placed native binary, with a
//     cli-wrapper.cjs fallback for --ignore-scripts builds)
//   - detect whether Max OAuth credentials are present
//   - decide whether a session should use OAuth (Max) or the API key
//   - run `claude auth status` / `claude auth logout` headlessly

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ── Binary resolution ──────────────────────────────────────────────────────────
//
// Resolved against process.cwd() and this file's location rather than
// require.resolve() so it works identically whether invoked from the custom
// server (cwd /app, plain require) or a webpack-bundled Next route (where
// require.resolve of a dep would be rewritten). CLAUDE_CLI_PATH overrides all.

const REL_NATIVE = 'node_modules/@anthropic-ai/claude-code/bin/claude.exe';
const REL_WRAPPER = 'node_modules/@anthropic-ai/claude-code/cli-wrapper.cjs';

let _cmd = null;

function candidateRoots() {
  // app root from process.cwd() (both runtimes start in /app) and from this
  // file (src/server/claude-cli.js → ../../).
  return [process.cwd(), path.join(__dirname, '..', '..')];
}

/**
 * @returns {{ file: string, baseArgs: string[] }}
 * @throws  {Error} 'claude_cli_not_installed' when nothing resolves.
 */
function resolveClaudeCommand() {
  if (_cmd) return _cmd;

  if (process.env.CLAUDE_CLI_PATH) {
    _cmd = { file: process.env.CLAUDE_CLI_PATH, baseArgs: [] };
    return _cmd;
  }

  for (const root of candidateRoots()) {
    const nativeBin = path.join(root, REL_NATIVE);
    try {
      const st = fs.statSync(nativeBin);
      // The placeholder stub is < 4KB; a placed native binary is tens of MB.
      if (st.isFile() && st.size > 100_000) {
        _cmd = { file: nativeBin, baseArgs: [] };
        return _cmd;
      }
    } catch {
      /* try next */
    }
  }

  for (const root of candidateRoots()) {
    const wrapper = path.join(root, REL_WRAPPER);
    if (fs.existsSync(wrapper)) {
      _cmd = { file: process.execPath, baseArgs: [wrapper] };
      return _cmd;
    }
  }

  throw new Error('claude_cli_not_installed');
}

// ── OAuth / Max detection ──────────────────────────────────────────────────────

function claudeHome() {
  return process.env.HOME || '/home/nextjs';
}

/**
 * True when a Max OAuth credentials file is present. On Linux (the deploy
 * target) the CLI stores creds at $HOME/.claude/.credentials.json; on macOS it
 * uses the Keychain, so this returns false locally even when logged in — use
 * getAuthStatus() for an authoritative, cross-platform check.
 */
function hasOauthCreds() {
  try {
    return fs.existsSync(path.join(claudeHome(), '.claude', '.credentials.json'));
  } catch {
    return false;
  }
}

/**
 * Whether a new CLI session should authenticate via Max OAuth (vs the API key).
 * Prefer Max whenever creds are present, unless explicitly forced to the key.
 */
function shouldUseOauth() {
  if (process.env.CLAUDE_CLI_FORCE_API_KEY === 'true') return false;
  return hasOauthCreds();
}

// ── Headless auth commands ─────────────────────────────────────────────────────

// `auth status` / `login` / `logout` reflect the STORED account auth, which is
// the OAuth/Max login. ANTHROPIC_API_KEY in the env would mask that (the CLI
// would report/prefer the key), so strip it for these probes.
function authEnv() {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_BASE_URL;
  return env;
}

/**
 * Run `claude auth status --json` and return the parsed object plus an
 * `available` flag. Never throws.
 *
 * @returns {Promise<{available:boolean, loggedIn?:boolean, authMethod?:string,
 *   subscriptionType?:string, email?:string, orgName?:string, error?:string}>}
 */
function getAuthStatus(timeoutMs = 8_000) {
  return new Promise((resolve) => {
    let cmd;
    try {
      cmd = resolveClaudeCommand();
    } catch {
      return resolve({ available: false, loggedIn: false, error: 'claude_cli_not_installed' });
    }

    let child;
    try {
      child = spawn(cmd.file, [...cmd.baseArgs, 'auth', 'status', '--json'], {
        env: authEnv(),
        shell: false,
      });
    } catch {
      return resolve({ available: false, loggedIn: false, error: 'spawn_failed' });
    }

    let out = '';
    let errOut = '';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish({ available: true, loggedIn: false, error: 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { errOut += d.toString(); });
    child.on('error', () => finish({ available: false, loggedIn: false, error: 'spawn_failed' }));
    child.on('close', () => {
      const text = (out.trim() || errOut.trim());
      try {
        const j = JSON.parse(text);
        finish({ available: true, ...j });
      } catch {
        finish({ available: true, loggedIn: false });
      }
    });
  });
}

/**
 * Run `claude auth logout`. Never throws.
 * @returns {Promise<{ok:boolean, code?:number, error?:string}>}
 */
function runAuthLogout(timeoutMs = 15_000) {
  return new Promise((resolve) => {
    let cmd;
    try {
      cmd = resolveClaudeCommand();
    } catch {
      return resolve({ ok: false, error: 'claude_cli_not_installed' });
    }

    let child;
    try {
      child = spawn(cmd.file, [...cmd.baseArgs, 'auth', 'logout'], {
        env: authEnv(),
        shell: false,
      });
    } catch {
      return resolve({ ok: false, error: 'spawn_failed' });
    }

    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish({ ok: false, error: 'timeout' });
    }, timeoutMs);

    child.on('error', () => finish({ ok: false, error: 'spawn_failed' }));
    child.on('close', (code) => finish({ ok: code === 0, code: code ?? -1 }));
  });
}

module.exports = {
  resolveClaudeCommand,
  hasOauthCreds,
  shouldUseOauth,
  getAuthStatus,
  runAuthLogout,
};
