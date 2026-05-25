# Portal Code Quality, Type Safety & Security Audit — Area 1

**Auditor:** Rex (read-only code review)
**Date:** 2026-05-25
**Branch:** `agent/7a567e26-2026-05-25T18-57-59`
**Scope:** `src/`, `worker/`, `middleware.ts`, `prisma/schema.prisma`

---

## Summary

- **Several critical authentication holes are still present:** hardcoded fallback bearer tokens (`amonis-claw-2026`, `lepoder-seed-2026`), an `AUTH_SECRET` fallback, and a CSRF fallback all act as production back-doors if the corresponding env vars are unset.
- **The Amonis sub-app is largely unauthenticated:** `middleware.ts` whitelists `/api/amonis/tasks/{pending,update,trigger,revert}` and `/api/amonis/agents/` as public paths, so anyone on the network can list/mutate/revert tasks, force-trigger Claude calls (cost DoS), and overwrite agent system prompts. `/api/amonis/tasks/update` additionally performs **mass-assignment** by spreading the request body into `prisma.amonisTask.update`.
- **Secret storage gaps:** Microsoft `accessToken`/`refreshToken` and `User.totpSecret` are stored in plaintext (Prisma schema). The worker embeds GitHub tokens directly in the persistent `.git/config` of reused clone dirs.
- **CSRF coverage is inconsistent:** the new admin/dispatch routes are excellent (zod + `verifyCsrf` + audit), but several mutating routes (`/api/admin/update`, `/api/admin/sync-config`, `/api/projects` POST, `/api/ai/chat`, `/api/webhook/urgent` PATCH, `/api/projects/[slug]/files/[filename]` PUT, all `/api/amonis/*` routes) skip CSRF entirely.
- **Type-safety is overall decent** (only 12 `any` occurrences in `src/`), but webhook/Amonis routes parse JSON with bare `as` casts rather than zod. The worker has a real correctness bug: a successful auto-merged task is still recorded with `status: 'needs_review'`.

---

## Findings

### Critical

#### C1. Hardcoded production bearer token grants admin
**Files:** `src/lib/auth.ts:6`, `src/middleware.ts:9`

`AMONIS_API_TOKEN` falls back to the literal string `'amonis-claw-2026'`. In `getApiUser` (`src/lib/auth.ts:75-83`) any request with `Authorization: Bearer amonis-claw-2026` is returned as `{ role: 'admin' }`, and the middleware (`src/middleware.ts:31-33`) lets that token bypass session checks entirely. If `AMONIS_API_TOKEN` is ever unset (default in `.env.example`, fresh installs, mis-configured deploys), this string acts as a master admin key that anyone reading the public repo can use.

**Risk:** Full admin access to the portal, including secret mappings, agent profiles, dispatch endpoints.
**Fix:** Fail closed — throw at startup if `AMONIS_API_TOKEN` is missing instead of silently falling back. Same treatment for `AUTH_SECRET` and `CSRF_SECRET`.

#### C2. Hardcoded `AUTH_SECRET` and `CSRF_SECRET` fallbacks
**Files:** `src/lib/auth.ts:9`, `src/lib/csrf.ts:4`

`AUTH_SECRET` falls back to a known constant (the placeholder `CHANGE_ME_GENERATE_A_RANDOM_64_CHAR_HEX_STRING_AT_LEAST_32`), and `CSRF_SECRET` falls back to `'csrf-fallback-secret'`. Either fallback in production means iron-session cookies and CSRF HMACs are forgeable by anyone who has read the source.

**Risk:** Complete session forgery / CSRF bypass.
**Fix:** Throw at module load when the env var is missing — never serve traffic with a known-public secret.

#### C3. `/api/todos/seed` has a hardcoded bypass secret and is in the public path list
**Files:** `src/app/api/todos/seed/route.ts:23,28-38`, `src/middleware.ts:5`

`SEED_SECRET = 'lepoder-seed-2026'` allows `POST /api/todos/seed?secret=lepoder-seed-2026` to act as **any** admin user (it picks the first admin row). The route is also in `PUBLIC_PATHS`, so the middleware does not gate it. When the secret does not match, the error response leaks every user's `email` and `role`.

**Risk:** Anyone who reads the repo can write data as admin and enumerate users.
**Fix:** Delete the secret-string path entirely; either keep the route admin-session-only or move it to a one-shot CLI/script.

#### C4. `/api/todos/debug` is unauthenticated and dumps all users
**File:** `src/app/api/todos/debug/route.ts:5-19`

No auth check; returns every `user.email` + `role` + per-user todo counts. Listed in `PUBLIC_PATHS`.

**Risk:** Full user enumeration via a single unauthenticated GET.
**Fix:** Remove the route, or restrict to admin and remove from `PUBLIC_PATHS`.

#### C5. `/api/amonis/tasks/update` — public mass-assignment
**Files:** `src/app/api/amonis/tasks/update/route.ts:8-46`, `src/middleware.ts:5`

The route is in `PUBLIC_PATHS` and contains:
```ts
const { taskId, ...updateData } = body;
...
await prisma.amonisTask.update({ where: { id: taskId }, data: updateData });
```
Any field in the request body is written verbatim to Prisma. Combined with the public path, an unauthenticated caller can change `status`, `agentId`, `workSummary`, `buildNumber`, etc. on any task.

**Risk:** Tampering with the entire Amonis task pipeline; potential SQL/Prisma input shape abuse.
**Fix:** Require auth (worker bearer token or admin session); validate `updateData` against a zod allowlist exactly like `/api/amonis/tasks/[id]` PATCH already does (`route.ts:38-50`).

#### C6. `/api/amonis/tasks/trigger` — unauthenticated Anthropic budget burn
**Files:** `src/app/api/amonis/tasks/trigger/route.ts`, `src/middleware.ts:5`

Public path. Anyone can POST `{ taskId }` for any existing task to launch a streaming Claude call (`runClaudeAgent`). Each call burns Anthropic credit, writes streaming logs to the DB (`amonisAgentLog.create` in a `for await` loop, one row per ~400 chars), and is fire-and-forget (`void runClaudeAgent(...)`).

**Risk:** Cost-DoS via repeated unauthenticated triggers; unbounded log table growth.
**Fix:** Require an auth check (admin or worker bearer); rate-limit per IP regardless.

#### C7. `/api/amonis/tasks/pending` and `/revert` are public
**Files:** `src/app/api/amonis/tasks/pending/route.ts:10`, `src/app/api/amonis/tasks/revert/route.ts:8`, `src/middleware.ts:5`

`pending` returns the full task queue (titles, descriptions, agent assignments) to any unauthenticated caller. `revert` lets anyone mark any task `reverted` and mutate its description. Both are in `PUBLIC_PATHS` and have no in-handler auth.

**Risk:** Information disclosure (pending) + workflow tampering (revert).
**Fix:** Require a worker bearer token or session auth; drop them from `PUBLIC_PATHS`.

#### C8. `/api/amonis/agents/[id]` PATCH allows any logged-in user to rewrite agent system prompts
**Files:** `src/app/api/amonis/agents/[id]/route.ts:32-52`, `src/middleware.ts:5`

The path prefix `/api/amonis/agents/` is in `PUBLIC_PATHS`, so middleware does not gate it. The handler calls `getApiUser()` (any session user OR the bearer token) — **no admin check** — and lets the caller rewrite `systemPrompt`, `scope`, `enabled`, etc. for any agent.

**Risk:** A regular `role: 'user'` account can repurpose every Amonis agent (prompt-injection vector into all subsequent dispatches). Combined with C1, the public bearer also reaches here.
**Fix:** Use `requireApiAdmin()` and a zod schema; remove the prefix from `PUBLIC_PATHS`.

#### C9. `/api/amonis/webhook` auth check fails open
**File:** `src/app/api/amonis/webhook/route.ts:7-12`

```ts
if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) { ... 401 }
```
If `AMONIS_WEBHOOK_SECRET` is unset, the check is skipped entirely and the endpoint is public — it then proxies to `OPENCLAW_WEBHOOK_URL` with the portal's own token and mutates task status.

**Risk:** SSRF-adjacent (proxy with portal's bearer to a configured webhook URL) + unauthenticated task transitions.
**Fix:** Reject when the secret is unset instead of skipping; `task.agentId!` on line 47 also crashes when the task has no assigned agent.

---

### High

#### H1. Microsoft OAuth tokens and TOTP secrets stored in plaintext
**File:** `prisma/schema.prisma` (`MicrosoftAccount.accessToken`/`refreshToken`, `User.totpSecret`)

`encryptSecret` / `decryptSecret` exist in `src/lib/crypto.ts` and are already used for the 1Password Connect token, but Microsoft Graph tokens and TOTP shared secrets are stored as plain `String`. A SQLite/Postgres dump (or a Prisma read via any unauthenticated debug-style endpoint such as those in C3/C4) leaks long-lived Graph access and TOTP factors.

**Fix:** Wrap with the existing AES-GCM helper; add migration columns `iv`/`tag`.

#### H2. GitHub token persisted in `.git/config` of reused clone dirs
**Files:** `worker/git-handler.ts:99-103` (`cloneUrl`), `worker/git-handler.ts:138-145` (`git remote set-url origin <url-with-token>`)

`cloneUrl()` embeds the token inline (`https://x-access-token:${token}@github.com/...`). When `WORKER_CLONES_DIR` is used (the default `/app/worker-clones/<owner>__<name>`), the resulting `.git/config` keeps that URL **including the token** between tasks. Any subsequent task (or any code that reads the workdir, e.g., the agent's `read_file`) can extract it.

**Risk:** GitHub PAT exposure to the agent process and to any later task on the same worker.
**Fix:** Use the token via `-c http.extraheader=...` or a credential helper instead of embedding it in the URL; or rewrite the remote URL back to the unauthenticated form after each `fetch`/`push`.

#### H3. Worker agent has shell access while project secrets are in `env`
**Files:** `worker/claude-agent.ts:140-160` (`run_bash` tool), `worker/task-executor.ts:73-80` (`loadProjectSecrets`)

`run_bash` spawns `/bin/sh -c <model-supplied command>` with `env = { ...process.env, ...extraEnv }`, where `extraEnv` holds 1Password-resolved project secrets. The comment claims "secrets are never logged", but the agent can trivially run `env > leak.txt && git add -A` (the worker then commits and pushes). The "container is the security boundary" assumption breaks because the boundary is downstream of the secret.

**Fix:** Don't expose `extraEnv` to `run_bash` (only to declared build/test commands that need them), or strip known secret env keys before spawning the shell, or pass secrets via a file the agent can't read.

#### H4. Successful auto-merge still recorded as `needs_review`
**File:** `worker/task-executor.ts:323-340` (`complete()`)

`complete()` always sets `status: 'needs_review'`, even when called after a successful `mergePullRequest()` with `mergedAt` populated. The dashboard / UI then shows merged tasks as still needing review.

**Fix:** When `mergedAt` is set, write `status: 'completed'` (or `'merged'` if the schema has it); audit the calling sites in `executeTask`.

#### H5. PATCH `/api/webhook/urgent` allows any authenticated user to mark *any* item done
**File:** `src/app/api/webhook/urgent/route.ts:79-95`

The PATCH handler accepts `{ id, done }` from the body and updates by id without any ownership check, CSRF, or zod validation (`as { id: string; done: boolean }` cast only). Any logged-in user can flip any urgent item's `done` flag.

**Fix:** Look up `UrgentItem.userId` and require ownership/admin; add CSRF + zod.

#### H6. `/api/ai/chat` and other mutating routes skip CSRF
**Files:** `src/app/api/ai/chat/route.ts`, `src/app/api/admin/update/route.ts`, `src/app/api/admin/sync-config/route.ts`, `src/app/api/projects/route.ts` (POST), `src/app/api/projects/[slug]/files/[filename]/route.ts` (PUT), all `/api/amonis/**`

The mature routes under `/api/admin/projects/*`, `/api/admin/agents/*`, and `/api/ai-hub/dispatch-task` correctly call `verifyCsrf(request)`. The above routes do not. Combined with cookie-based auth, any of them is reachable from a CSRF on a logged-in admin's browser. (`SameSite=Lax` on the session cookie reduces the surface but does not eliminate POST/PUT/DELETE CSRF.)

**Fix:** Apply the existing `verifyCsrf` pattern uniformly to all mutating routes.

#### H7. `/api/admin/update` triggers shell + webhook with no CSRF and leaks errors
**File:** `src/app/api/admin/update/route.ts:108-180`

POST executes a host-side update via webhook or by writing a trigger file. No `verifyCsrf` and no rate limit. `currentVersion !== latestVersion` (line 70) compares a `.version` file string against a 7-char SHA prefix, so the comparison is fragile (e.g., if `.version` contains a full SHA it always reports "update available"). Inner `webhookError` and `fileError` are swallowed and the next "method" runs anyway.

**Fix:** Add CSRF; normalize version comparison; surface webhook failures instead of falling through silently.

---

### Medium

#### M1. Middleware "session cookie present" check is essentially a no-op
**File:** `src/middleware.ts:36-46`

The middleware only checks that some `lepoder_session` cookie exists — it does not validate the iron-session signature. Any caller can send `Cookie: lepoder_session=garbage` and reach every non-public API route; the route handler must then re-verify. Most do (via `requireApiAuth`/`requireApiAdmin`), but the middleware gives a false sense of protection — see e.g. `/api/admin/sync-config` which uses `getSessionUser()` (correct) but other handlers might forget.

**Fix:** Verify the session inside middleware (or document explicitly that route handlers are the auth boundary and remove the misleading cookie check).

#### M2. `/api/admin/sync-config` POST: no CSRF, raw error to client
**File:** `src/app/api/admin/sync-config/route.ts:31-50`

`String(error)` is returned in the response body when sync fails. Combined with the lack of CSRF, an admin browsing a malicious page can trigger DB writes and the attacker can read the resulting error.

**Fix:** Add CSRF; sanitize the error message; log details server-side only.

#### M3. `/api/amonis/tasks/[id]` PATCH/DELETE: no admin or ownership check, no CSRF
**File:** `src/app/api/amonis/tasks/[id]/route.ts:30-77`

Any logged-in user can mutate or delete any task. Combined with C1, the public bearer token also reaches here.

**Fix:** Require admin; add CSRF.

#### M4. `/api/amonis/tasks/route.ts` POST has no input validation
**File:** `src/app/api/amonis/tasks/route.ts:30-67`

`body.title`, `body.description`, `body.priority` are forwarded to Prisma without zod validation. Missing `title` causes a 500 (Prisma required-field error) instead of a 400. `body.priority` is `1` by default but the field accepts arbitrary numbers.

**Fix:** Add a zod schema; reject malformed input with 400.

#### M5. `triggerAgent` is dead code
**File:** `src/app/api/amonis/tasks/route.ts:69-79`

The helper function is defined but never called (the surrounding comment explicitly says "Don't auto-trigger"). It also has a bug — when `AMONIS_WEBHOOK_SECRET` is unset it sends `Authorization: Bearer` (no value), but again it's never called.

**Fix:** Delete.

#### M6. `slug` is not validated against path traversal in file routes
**Files:** `src/app/api/projects/[slug]/files/[filename]/route.ts:42-49`, `src/app/api/projects/[slug]/docs/[...filepath]/route.ts:51-58`

The `filepath` segments are normalized and the filename allowlist is enforced, but `slug` is interpolated into `path.join(PROJECTS_DIR, slug, ...)` without any local validation. Slug-creation today enforces the safe `[a-z0-9-]+` pattern (`src/app/api/projects/route.ts:48`), but if a future code path ever inserts a Project row with a non-conforming slug, this becomes a path traversal.

**Fix:** Re-validate `slug` at use, e.g. `if (!/^[a-z0-9-]+$/.test(slug)) return 400`.

#### M7. In-memory rate limiter with module-level `setInterval`
**File:** `src/lib/rate-limit.ts:84-94`

The cleanup interval is registered at module load and never `unref`'d. In Next.js dev/test the module can be re-evaluated, leaking intervals across HMR cycles. The store is also per-process, so behind multiple workers/containers an attacker has N× the budget. The file's own comment acknowledges Redis is needed for production.

**Fix:** Either `interval.unref()` and only register once, or switch to Redis. At minimum guard with `if (process.env.NODE_ENV !== 'test')`.

#### M8. `getClientIp` trusts `X-Forwarded-For` without proxy allowlist
**File:** `src/lib/audit.ts:43-49`

`request.headers.get('x-forwarded-for')` is used as-is for both audit logging and rate-limit keys. If the portal is exposed directly (no trusted reverse proxy), a client can spoof a different IP per request and bypass `loginIpLimiter`/`webhookLimiter`.

**Fix:** Only honor XFF when a `TRUSTED_PROXY` env or known socket IP is set; otherwise use the connection IP. Document the deployment assumption.

#### M9. `/api/webhook/urgent` POST: timing-leaky bearer compare + no zod
**File:** `src/app/api/webhook/urgent/route.ts:25-39, 42-57`

`authHeader !== \`Bearer ${authToken}\`` is non-constant-time (minor). More importantly, the JSON body is cast `as UrgentItemPayload | UrgentItemPayload[]` without runtime validation — missing/wrong types silently coerce to `null` because of `item.source || 'n8n'`, etc., and `item.title` is the only field checked.

**Fix:** `crypto.timingSafeEqual` for the token; add a zod schema.

#### M10. Microsoft callback / OAuth handling not reviewed in depth here

Flagged for follow-up: `src/app/api/microsoft/callback/route.ts` and `/api/auth/microsoft/callback/route.ts` both exist (apparent route duplication). Worth confirming only one is reachable and that state/nonce CSRF protections are in place.

---

### Low

#### L1. `worker/index.ts` lockNextTask does a redundant `findFirst`
**File:** `worker/index.ts:36-55`

The initial `findFirst` result (`candidate`) is only used as a fast "nothing to do" check; the actual claim comes from `top[0]` after the second query. The second call covers the first, so the first is wasted work.

**Fix:** Drop `findFirst`; let the empty `findMany` indicate "nothing to do".

#### L2. `pickAgentByExpertise` has an unreachable fallback
**File:** `src/lib/agents.ts:165-167`

`best` is always assigned on the first iteration when `active.length > 0` (the early-return covers the empty case). The `?? active.sort(...)[0] ?? null` tail can never be reached.

**Fix:** Drop the tail or assert `best!.agent`.

#### L3. Typo: `max_tokens: 8096`
**File:** `src/app/api/amonis/tasks/trigger/route.ts:31`

Likely intended `8192`. Behaviorally harmless but obviously a transposition.

#### L4. `run_bash` in `claude-agent.ts` does not pass `timeoutMs` to `run()`
**File:** `worker/claude-agent.ts:148-160`

The 60s timeout is implemented as `Promise.race`, so when it fires the agent moves on but the underlying child process is **not killed** — it keeps running until natural exit. `run()` itself supports `timeoutMs` and SIGTERM/SIGKILL escalation; use it.

**Fix:** Pass `{ ..., timeoutMs: 60_000 }` to `run()` instead of racing.

#### L5. `task.agentId!` non-null assertion can crash
**File:** `src/app/api/amonis/webhook/route.ts:47`

If the task has no assigned agent, the `amonisAgentLog.create({ data: { agentId: task.agentId!, ... } })` call coerces `null` to a non-null type and Prisma will throw at runtime.

**Fix:** Skip the log create (or use `task.agentId ?? null` and let it be optional in the schema).

#### L6. Inconsistent auth helpers across routes

Some routes use `getSessionUser()` (no bearer support — `src/app/api/admin/update`, `/api/admin/sync-config`, `/api/projects/*`), others use `getApiUser()` (bearer + session), and the well-factored ones use `requireApiAuth`/`requireApiAdmin`. Pick one pattern per use-case and apply it uniformly to avoid drift.

(Stopping at 3 INFO-style nits per the audit ruleset, even though more exist.)

---

## Patterns worth replicating

These are already in the codebase and should be the template the consolidator points contributors to:

1. **`src/app/api/admin/projects/[id]/route.ts`** — Reference implementation: `requireApiAdmin()` → `verifyCsrf()` → zod `safeParse` → mutation → `auditLog` → typed `errorResponse(e)` helper that maps `UNAUTHORIZED`/`FORBIDDEN`/`P2025` to the right status codes. Every other mutating admin route should look like this.
2. **`src/app/api/admin/agents/route.ts`** — Same pattern, including a strict slug regex (`/^[a-z0-9][a-z0-9-]*$/`) and a duplicate-slug pre-check that returns 409 instead of letting Prisma throw.
3. **`src/app/api/ai-hub/dispatch-task/route.ts`** — Good handling of base64 image attachments: regex-validated data URI, decoded-size guard *before* dispatch, attachment cap. `DispatchError` is mapped to specific status codes via `code` rather than string-matching.
4. **`src/lib/agent-dispatch.ts`** — Single source of truth for task creation. Both the HTTP route and the MCP tool funnel through `dispatchTask`, so validation, audit, and parent-task checks can't drift. `DispatchError` codes are an idiomatic way to do this in TS without exceptions-as-control-flow getting messy.
5. **`worker/index.ts` atomic claim** — Using `updateMany` with the `workerId: null` predicate as the guard is the right way to implement task locking on SQLite (no `SKIP LOCKED`). The "drain in-flight tasks on SIGTERM" loop is also nicely done.
6. **`worker/claude-agent.ts` `safeJoin`** — Resolves and confirms the result lives under `workdir` (`abs === work || abs.startsWith(work + sep)`). This is the correct shape for path containment; the file routes in `src/app/api/projects/[slug]/*` should adopt the same helper.
7. **`src/lib/crypto.ts`** — AES-256-GCM with scrypt-derived key, IV per encryption, auth tag stored separately. Already used for the 1Password Connect token; extend it to MS tokens + TOTP secrets (see H1).

---

## Verdict

**Needs work — do not deploy externally until C1–C9 are addressed.** The new admin routes show the team knows how to build secure handlers; the gap is that the Amonis sub-app, the worker bearer token, and the seed/debug endpoints predate that pattern and have not been brought in line. Top three priorities:

1. **C1/C2/C3** — eliminate every hardcoded secret fallback and fail closed at startup.
2. **C5/C6/C7/C8** — bring `/api/amonis/**` under the same `requireApiAdmin` + `verifyCsrf` + zod pattern used by `/api/admin/**`, and remove the matching `PUBLIC_PATHS` entries.
3. **H2/H3** — stop persisting GitHub tokens in `.git/config` and stop passing 1Password-resolved env into the agent's interactive shell.
