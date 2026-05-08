# LEPODER Portal — Agent Dispatch Worker

The worker is a long-running Node.js process that polls the portal database
for pending agent tasks, runs a headless Claude agent against a clone of the
target GitHub repo, and reports the result back to the portal.

## Architecture

```
Portal (Next.js)            Worker (Node.js)
┌─────────────────┐          ┌──────────────────────────────┐
│ AI Hub          │          │ index.ts                     │
│  ↓ dispatch     │          │  ↳ poll Task(status=pending) │
│ Task table      │ ─────►   │  ↳ lock by workerId          │
│                 │          │  ↳ task-executor.ts          │
│ /agents page    │          │     ↳ git clone repo         │
│  ↑ poll updates │ ◄─────   │     ↳ claude-agent.ts        │
│ TaskLog table   │          │       (Anthropic SDK loop)   │
└─────────────────┘          │     ↳ commit + push + PR     │
                             │  ↳ update Task status        │
                             └──────────────────────────────┘
```

Both processes connect to the same database (`DATABASE_URL`). No HTTP
calls between them — Prisma writes are the integration point.

## Running locally

```bash
# 1. Make sure the schema and seeds are applied
DATABASE_URL="file:./dev.db" npm run db:push
DATABASE_URL="file:./dev.db" npm run db:seed:agents

# 2. Set env
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...           # optional, but required for private repos / PRs

# 3. Run
DATABASE_URL="file:./dev.db" npm run worker
```

## Files

- `index.ts` — main poll loop, task locking, stale-task reaping, graceful shutdown
- `task-executor.ts` — per-task orchestration (clone → agent → commit/PR → record)
- `claude-agent.ts` — Anthropic SDK tool-use loop with `read_file`, `write_file`, `list_directory`, `run_bash`, `finish` tools
- `git-handler.ts` — `git clone`, `git commit`, `git push`, GitHub REST PR creation
- `logger.ts` — structured logging to both stdout and the `TaskLog` table

## Notes on the headless agent

The user spec mentions the Claude Code SDK in headless mode. The Claude Code
CLI is heavyweight to ship inside a Node container (it carries its own auth
and runtime). This worker takes the pragmatic alternative the spec flagged:
the Anthropic SDK (`@anthropic-ai/sdk`) with a tool-use loop. The agent is
given file tools constrained to the per-task workdir plus a `run_bash` tool
for tests / linters / greps. To swap in the Claude Code CLI later, replace
`runAgent` in `claude-agent.ts` — the rest of the pipeline is unchanged.

## Safety

- The `safeJoin` helper rejects any tool path that would escape the workdir.
- The worker container is the security boundary: no host filesystem mounts
  beyond `/data` (the SQLite db) and a tmp dir for clones.
- Projects default to `allowWrite=false`. With write disabled, the agent
  produces a summary only — no commits, no pushes, no PRs.
- A `GITHUB_TOKEN` is required for PR creation. Without it, the worker still
  pushes the branch and records a commit URL.

## Failure modes & recovery

- **Stale task**: if a worker dies mid-task, the row is left as
  `in_progress` with the dead worker's id. On startup and every tick, the
  worker reaps any `in_progress` task older than `2 × WORKER_TIMEOUT_MS`,
  marking it `failed`.
- **Agent timeout**: enforced inside `runAgent`. The outer worker also wraps
  each task in a `Promise.race` against `WORKER_TIMEOUT_MS` as a hard cap.
- **Git/network errors**: caught in `executeTask`, recorded as `failed` with
  the error message visible on the dashboard.
