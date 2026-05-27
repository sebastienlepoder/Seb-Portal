# LEPODER Portal — Comprehensive Audit (2026-05-27)

> **Supersedes:** `docs/audits/PORTAL-AUDIT-2026-05-25.md`  
> **Evidence sources:** §9 lists the four sub-audit files. All claims cite those files; nothing here is invented.

---

## 0. Scope & Method

This report consolidates findings from four parallel read-only sub-tasks run against the current working tree:

- **Rex** (`01-code-quality.md`) — code quality, type safety, and security across `src/`, `worker/`, `middleware.ts`, and `prisma/schema.prisma`.
- **Archer × 2** (`02-architecture-core.md`, `03-architecture-projects.md`) — core module structure, integration patterns, service-layer adoption, `admin/` vs `manage/` reconciliation, and a full projects-section deep-dive covering routes, schema-to-UI gaps, the filesystem-notes problem, and a proposed route tree.
- **Pixel** (`04-features-and-ux.md`) — information architecture, sidebar navigation, feature-gap inventory, UX friction points, and mobile audit.

All sub-tasks were read-only; no source files were modified. Every behavioural claim in this document cites a `file:line` traceable to one of the four evidence files. This report supersedes the 2026-05-25 partial consolidated report, which lacked the dedicated architecture and UX sub-tasks.

---

## 1. Executive Summary

- **Security is the immediate deploy blocker (→ §2).** Nine critical findings — hardcoded bearer/session/CSRF fallback secrets, fully-public Amonis mutation endpoints, unauthenticated debug and seed routes — allow admin takeover, Anthropic cost-DoS, and full user enumeration with zero credentials. Do not expose this portal externally until C1–C9 are resolved.

- **The projects section is two half-built features that never unified (→ §3.6).** The user-facing `/projects/[slug]` page is a documentation viewer (GitHub tabs + disk-stored markdown). The Prisma schema defines five rich child models (`Task`, `TaskLog`, `TaskAttachment`, `ProjectSession`, `ProjectSecretMapping`) that are fully absent from the project detail UI. The creation form routes through the weaker, CSRF-free API stack even for admins.

- **IA fragmentation erodes discoverability (→ §5).** The sidebar mixes personal life-org tools with CI/CD tooling under technology-named groups. Six models with backing APIs have no sidebar entry. The `/bookmarks` link points to a missing page. `AI Hub` and `Agents` — dispatch runtime and its config — are in separate top-level positions.

- **High-leverage quick-win cluster available (→ §6).** Twelve items can be completed in under one hour each: dead-code deletion, one-line security hardeners, dead link repair, touch-target fixes, and language normalisation.

- **The `src/lib/` flat structure and three integration-less API routes limit testability and create drift (→ §3.1–§3.4).** `agent-dispatch.ts` is a clean service-layer exemplar already in the codebase; four route files bypass it.

---

## 2. Code Quality & Security Findings

*Full evidence in `docs/audits/01-code-quality.md`. Items below are one-line summaries + citation. Reference that file for code excerpts and fix detail.*

### Critical (C1–C9)

| # | Summary | File:line |
|---|---|---|
| **C1** | `AMONIS_API_TOKEN` falls back to `'amonis-claw-2026'`; any request with that bearer is returned as `{ role: 'admin' }` and bypasses session checks. | `src/lib/auth.ts:6`, `src/middleware.ts:9` |
| **C2** | `AUTH_SECRET` falls back to a known placeholder constant; `CSRF_SECRET` falls back to `'csrf-fallback-secret'` — iron-session cookies and CSRF HMACs are forgeable by anyone who has read the source. | `src/lib/auth.ts:9`, `src/lib/csrf.ts:4` |
| **C3** | `'lepoder-seed-2026'` on `POST /api/todos/seed` lets anyone act as admin; on mismatch it leaks every user's email and role. Route is in `PUBLIC_PATHS`. | `src/app/api/todos/seed/route.ts:23,28-38`, `src/middleware.ts:5` |
| **C4** | `GET /api/todos/debug` has no auth check and returns all users' email, role, and todo counts. Route is in `PUBLIC_PATHS`. | `src/app/api/todos/debug/route.ts:5-19` |
| **C5** | `POST /api/amonis/tasks/update` is in `PUBLIC_PATHS` and spreads the entire request body into `prisma.amonisTask.update` — unauthenticated mass-assignment on any task field. | `src/app/api/amonis/tasks/update/route.ts:8-46`, `src/middleware.ts:5` |
| **C6** | `POST /api/amonis/tasks/trigger` is in `PUBLIC_PATHS`; anyone can launch a streaming Claude call, burning Anthropic credit and writing unbounded `amonisAgentLog` rows. | `src/app/api/amonis/tasks/trigger/route.ts`, `src/middleware.ts:5` |
| **C7** | `/api/amonis/tasks/pending` exposes the full task queue unauthenticated; `/revert` lets anyone mark any task reverted. Both in `PUBLIC_PATHS` with no in-handler auth. | `src/app/api/amonis/tasks/pending/route.ts:10`, `src/app/api/amonis/tasks/revert/route.ts:8` |
| **C8** | `PATCH /api/amonis/agents/[id]` prefix in `PUBLIC_PATHS`; no admin check — any logged-in user (or the C1 bearer) can rewrite `systemPrompt`, `scope`, `enabled` on any agent. | `src/app/api/amonis/agents/[id]/route.ts:32-52` |
| **C9** | `/api/amonis/webhook` skips its token check entirely when `AMONIS_WEBHOOK_SECRET` is unset, then proxies to `OPENCLAW_WEBHOOK_URL` with the portal's own bearer and mutates task status. | `src/app/api/amonis/webhook/route.ts:7-12` |

**Fix pattern for C1–C3:** Throw at module load / startup when any secret env var is missing. Never fall back to a known-public value.  
**Fix pattern for C5–C9:** Apply `requireApiAdmin()` + `verifyCsrf()` + zod allowlist (as used by `/api/admin/projects/*`) to all Amonis routes; remove their `PUBLIC_PATHS` entries.

### Reference implementations (replicate these patterns)

Rex's audit identifies seven patterns already in the codebase that should be the template for all new and refactored handlers. See `01-code-quality.md §Patterns worth replicating` for annotated descriptions. In brief:

| Pattern | Location | Why it matters |
|---|---|---|
| Full admin route lifecycle | `src/app/api/admin/projects/[id]/route.ts` | `requireApiAdmin()` → `verifyCsrf()` → zod `safeParse` → mutation → `auditLog()` → typed `errorResponse` |
| Strict slug validation | `src/app/api/admin/agents/route.ts` | `/^[a-z0-9][a-z0-9-]*$/` regex + `findUnique` 409 before insert |
| Dispatch base64 attachment guard | `src/app/api/ai-hub/dispatch-task/route.ts` | Regex-validated data URI, decoded-size guard before dispatch, attachment cap |
| Single-source task creation | `src/lib/agent-dispatch.ts` | HTTP route and MCP tool funnel through `dispatchTask` — validation cannot drift |
| Atomic task claim (SQLite) | `worker/index.ts` | `updateMany` with `workerId: null` predicate — correct locking without `SKIP LOCKED` |
| Path containment helper | `worker/claude-agent.ts` (`safeJoin`) | `abs === work \|\| abs.startsWith(work + sep)` — file routes in `src/app/api/projects/` should adopt this |
| AES-256-GCM secret storage | `src/lib/crypto.ts` | IV per encryption, auth tag stored separately; extend to MS tokens + TOTP (H1) |

### High (H1–H7)

| # | Summary | File:line |
|---|---|---|
| **H1** | `MicrosoftAccount.accessToken`/`refreshToken` and `User.totpSecret` stored in plaintext; `encryptSecret`/`decryptSecret` from `src/lib/crypto.ts` already exist but are unused here. | `prisma/schema.prisma` (`MicrosoftAccount`, `User`) |
| **H2** | `cloneUrl()` embeds GitHub PAT inline in the remote URL; `.git/config` retains it between tasks; any agent `read_file` call can extract the token. | `worker/git-handler.ts:99-103`, `:138-145` |
| **H3** | `run_bash` spawns `/bin/sh -c <model-cmd>` with 1Password-resolved secrets in `process.env`; the agent can exfiltrate them with `env > leak.txt && git add -A && git push`. | `worker/claude-agent.ts:140-160`, `worker/task-executor.ts:73-80` |
| **H4** | `complete()` always writes `status: 'needs_review'` even when `mergedAt` is populated — successfully merged tasks stay on the review queue. | `worker/task-executor.ts:323-340` |
| **H5** | `PATCH /api/webhook/urgent` accepts `{ id, done }` with no ownership check, CSRF, or zod — any authenticated user can flip any `UrgentItem`. | `src/app/api/webhook/urgent/route.ts:79-95` |
| **H6** | `ai/chat`, `admin/update`, `admin/sync-config`, `projects` POST, `projects/[slug]/files/[filename]` PUT, all `/api/amonis/**` routes skip `verifyCsrf` while accepting mutating operations via cookie auth. | (multiple routes — see `01-code-quality.md §High §H6`) |
| **H7** | `POST /api/admin/update` triggers a host-side update via webhook or trigger file with no CSRF, no rate limit, and swallowed webhook errors. | `src/app/api/admin/update/route.ts:108-180` |

### Medium (M1–M10)

| # | Summary | File:line |
|---|---|---|
| M1 | Middleware session check only tests cookie presence, not iron-session signature validity — any `Cookie: lepoder_session=garbage` passes middleware. | `src/middleware.ts:36-46` |
| M2 | `POST /api/admin/sync-config`: no CSRF; returns raw `String(error)` to client. | `src/app/api/admin/sync-config/route.ts:31-50` |
| M3 | `PATCH/DELETE /api/amonis/tasks/[id]`: no admin check, no CSRF; any logged-in user (or C1 bearer) can mutate or delete any task. | `src/app/api/amonis/tasks/[id]/route.ts:30-77` |
| M4 | `POST /api/amonis/tasks/`: `title`/`description`/`priority` forwarded to Prisma without zod; missing `title` returns a 500 instead of a 400. | `src/app/api/amonis/tasks/route.ts:30-67` |
| M5 | `triggerAgent` in `src/app/api/amonis/tasks/route.ts` is dead code — never called; contains a latent `Authorization: Bearer` (no value) bug. | `src/app/api/amonis/tasks/route.ts:69-79` |
| M6 | `slug` interpolated into `path.join(PROJECTS_DIR, slug, ...)` without re-validation at use sites — fragile against future non-conforming slug insertion. | `src/app/api/projects/[slug]/files/[filename]/route.ts:42-49`, `docs/[...filepath]/route.ts:51-58` |
| M7 | In-memory rate limiter registers a `setInterval` at module load that is never `unref`'d (HMR leak); per-process store gives N× budget under multiple workers. | `src/lib/rate-limit.ts:84-94` |
| M8 | `getClientIp` trusts `X-Forwarded-For` without a proxy allowlist — IP spoofing bypasses rate-limit keys and poisons audit logs. | `src/lib/audit.ts:43-49` |
| M9 | `POST /api/webhook/urgent`: non-constant-time bearer compare; body cast `as UrgentItemPayload` without zod — missing fields silently coerce. | `src/app/api/webhook/urgent/route.ts:25-57` |
| M10 | `src/app/api/microsoft/callback/route.ts` and `src/app/api/auth/microsoft/callback/route.ts` both exist — only one should be reachable; state/nonce CSRF on the active route needs verification. | `src/app/api/microsoft/callback/route.ts`, `src/app/api/auth/microsoft/callback/route.ts` |

### Type safety note

Overall type safety is acceptable: Rex found only 12 `any` occurrences in `src/`. The main gap is that webhook and Amonis routes parse JSON with bare `as` casts rather than zod schemas — the same files that also skip CSRF (H6, M4, M9). Fixing both in the same pass is the efficient path. (`01-code-quality.md §Summary`)

### Security verdict

**Do not deploy externally until C1–C9 are addressed.** The pattern for secure handlers already exists (`/api/admin/projects/*` is the reference); the gap is that the Amonis sub-app, the worker bearer flow, and the seed/debug endpoints predate that pattern and have not been brought in line. (`01-code-quality.md §Verdict`)

### Low (L1–L6)

| # | Summary | File:line |
|---|---|---|
| L1 | `findFirst` in worker task-lock loop is redundant — the subsequent `findMany` covers it. | `worker/index.ts:36-55` |
| L2 | `?? active.sort(...)[0] ?? null` tail in `pickAgentByExpertise` is unreachable dead code. | `src/lib/agents.ts:165-167` |
| L3 | `max_tokens: 8096` is likely a transposition of `8192`. | `src/app/api/amonis/tasks/trigger/route.ts:31` |
| L4 | `run_bash` 60 s timeout via `Promise.race` does not kill the child process; pass `{ timeoutMs: 60_000 }` to `run()` instead. | `worker/claude-agent.ts:148-160` |
| L5 | `task.agentId!` non-null assertion crashes when a task has no assigned agent. | `src/app/api/amonis/webhook/route.ts:47` |
| L6 | Auth helper inconsistency across routes: `getSessionUser()`, `getApiUser()`, and `requireApiAuth` used interchangeably without documented rules. | (multiple — see `01-code-quality.md §Low §L6`) |

---

## 3. Architecture Findings

*Full evidence in `docs/audits/02-architecture-core.md` and `docs/audits/03-architecture-projects.md`.*

### 3.1 Core module structure

`src/lib/` is a flat 30-file directory mixing four distinct categories with no naming convention: (a) pure utilities (`utils.ts`, `crypto.ts`, `rate-limit.ts`), (b) auth primitives (`auth.ts`, `csrf.ts`), (c) DB-touching business logic (`agents.ts`, `audit.ts`, `agent-dispatch.ts`, `bootstrap.ts`, `schedule/*`, `skills/*`, `mcp/*`), and (d) integration HTTP clients (`anthropic.ts`, `microsoft.ts`, `github.ts`, etc.). Nothing in the names signals "safe to import anywhere" vs "touches the database" vs "makes external calls." (`02-architecture-core.md §2.1`)

`src/server/` coexists without a documented boundary rule. `src/lib/mcp/` and `src/server/mcp/` both contain MCP-related code serving different layers; `src/server/vpnChecker.ts` has no Next.js dependencies and belongs in `src/lib/`. (`02-architecture-core.md §3`)

Concrete moves implied by the boundary rule (`02-architecture-core.md §3.3`):

| File | Direction | Reason |
|---|---|---|
| `src/server/vpnChecker.ts` | → `src/lib/` | No Next.js deps; pure logic + in-memory cache |
| `src/server/statusChecker/index.ts` | stays in `src/server/` | Request-scoped cache; multi-lib orchestration |
| `src/server/mcp/` | stays in `src/server/` | Runtime dispatch layer for request handling |
| `src/lib/mcp/trust.ts`, `src/lib/mcp/audit.ts` | stays in `src/lib/` | Pure DB helpers consumed by `src/server/mcp/` |

### 3.2 src/lib reorganization

Archer's proposed structure introduces four new sub-directories (`utils/`, `auth/`, `domain/`, `integrations/`) alongside the already-present `schedule/`, `skills/`, `security/`, and `mcp/` sub-dirs — the four existing sub-dirs prove the pattern is already established in the codebase, just not applied uniformly. Migration is backward-compatible: barrel `index.ts` files in each new sub-dir re-export existing import paths, so no consumer changes are required on day one. `utils.ts` in particular can be split lazily — only when a new call-site is added — to avoid churn across ~20 consumers (`02-architecture-core.md §2.2` migration note). Full proposed layout: `02-architecture-core.md §2.2`.

**Recommended boundary rule** (`02-architecture-core.md §3.3`):
- `src/lib/` — framework-agnostic: pure functions, Prisma queries, HTTP clients, DTO mappers. No `next/server` or `react` imports.
- `src/server/` — Next.js server-runtime orchestration, in-memory caches, provider strategies. May import from `src/lib/`; never the reverse.

### 3.3 Third-party integrations

Current state across all nine integrations (`02-architecture-core.md §4.1`):

| Integration | Lib file(s) | Route prefix(es) | Gap |
|---|---|---|---|
| Microsoft | `microsoft.ts` + `microsoft-auth.ts` | `/api/microsoft/*`, `/api/auth/microsoft/*` | Split; no shared `types.ts`; auth concerns and Prisma mixed in `microsoft-auth.ts:8` |
| GitHub | `github.ts` | `/api/github/*` | Worker-side git ops in `worker/git-handler.ts` sever the logical unit |
| Anthropic | `anthropic.ts` | Used inline across `ai/`, `ai-hub/`, `amonis/` | No client-side type file; instantiated in 3 route trees |
| Tailscale | `tailscale.ts` | `/api/tailscale/` | Reasonable; multi-mode logic self-contained |
| Coolify | `coolify.ts` | `/api/coolify/` | Clean; types co-located |
| 1Password | `onepassword.ts` | Consumed by project secrets flow | Prisma config-fetch coupled with HTTP client (`onepassword.ts:1-2`) |
| Synology | *(none)* | `/api/synology/` | All HTTP calls inline in route (`synology/route.ts:38-80`) |
| Shopify | *(none)* | `/api/shopify/` | All HTTP calls inline in route (`shopify/route.ts:37-90`) |
| Reddit | *(none)* | `/api/reddit/` | All HTTP calls inline in route (`reddit/route.ts:1-120`) |

Proposed normalised 4-file structure per integration under `src/lib/integrations/<name>/`: `types.ts`, `client.ts`, `auth.ts`, `index.ts`. Migration priority: Microsoft first (rename only), then Synology/Shopify/Reddit (extract inline logic), then 1Password (split Prisma from HTTP). (`02-architecture-core.md §4.2`)

### 3.4 Service-layer adoption

`src/lib/agent-dispatch.ts` is the gold-standard pattern: typed `DispatchInput`/`DispatchResult`, domain `DispatchError`, no HTTP primitives. Four route files currently bypass it with inline Prisma + SDK calls:

| Route | Problem |
|---|---|
| `amonis/tasks/trigger/route.ts:7-162` | `runClaudeAgent` (100+ lines of Anthropic streaming + Prisma) lives inside the HTTP handler |
| `ai/chat/route.ts:300-500+` | `executeTool()` calls `prisma.project.findMany` and `prisma.agentProfile.findMany` inline |
| `projects/route.ts:1-89` | GET/POST call Prisma directly; role check duplicated across multiple admin routes |
| `server/mcp/registry.ts:9+` | Duplicates the same `project.findMany`/`agentProfile.findMany` queries as `ai/chat/route.ts` |

Fix: extract each to a `src/lib/services/<domain>.ts` module following the shape in `02-architecture-core.md §5.6`. The `amonis/tasks/trigger` extraction alone removes ~100 lines of Anthropic streaming and Prisma code from an HTTP handler and makes the logic independently testable. The `ai/chat` and `mcp/registry` extractions eliminate a pair of identical `prisma.project.findMany` + `prisma.agentProfile.findMany` calls that currently drift independently.

Note on the worker: the existing `worker/index.ts` atomic claim pattern (using `updateMany` with `workerId: null` as the lock predicate) and the `SIGTERM`-drain loop are both correct and should be preserved during any service-layer refactor. (`01-code-quality.md §Patterns #5`)

### 3.5 admin/ vs manage/

`src/app/admin/` has 7 substantive admin pages; `src/app/manage/` contains exactly one orphaned page (`help`). (`02-architecture-core.md §6.1`)

**`src/app/admin/` contents:**

| Route | Page |
|---|---|
| `/admin/agents` | Agent profile management |
| `/admin/services` | Service CRUD |
| `/admin/mcp` | MCP tool dashboard |
| `/admin/reports` | Reports viewer |
| `/admin/projects` | Project management (agent-dispatch config) |
| `/admin/recurring` | Recurring task schedules |
| `/admin/skills` | Skills browser |

**`src/app/manage/` contents:** sole file is `manage/help/page.tsx`. No other `/manage/*` routes exist or are referenced anywhere in the codebase.

The split serves no architectural purpose and confuses navigation. **Fix:** Move `src/app/manage/help/page.tsx` → `src/app/admin/help/page.tsx`; delete `src/app/manage/`; add a redirect from `/manage/help` → `/admin/help`. **Canonical rule:** all staff/operator UI lives under `/admin/`. (`02-architecture-core.md §6.3`)

### 3.6 Projects section deep-dive

**The core problem:** the projects section is two half-built features sharing one `Project` table but with inconsistent security, separate API stacks, and no unified UX. (`03-architecture-projects.md §1`)

**Current page inventory:**

| Route | File | What it actually does |
|---|---|---|
| `/projects` | `src/app/projects/page.tsx` | Card grid with status-filter chips, session count, task count badges |
| `/projects/new` | `src/app/projects/new/page.tsx` | Create form: name, slug, description, repoUrl, icon — missing `kind`, `color`, `repoOwner`, `repoName`, `workingBranch` |
| `/projects/[slug]` | `src/app/projects/[slug]/page.tsx` | 291-line monolith with 7 embedded components (GitHubTab, DocsTab, DocsTree, FileTab, SettingsModal, MarkdownRenderer, ProjectDetailPage) |
| `/admin/projects` | `src/app/admin/projects/page.tsx` | Full CRUD table for agent-dispatch config: slug, repoOwner, repoName, workingBranch, clonePath, allowWrite, sortOrder |

The `[slug]/page.tsx` monolith alone is a prerequisite extraction target: all 7 embedded components must move to `src/components/projects/` before sub-routes can be created without duplication. (`03-architecture-projects.md §2.3`)

**Schema-to-UI gap matrix** (full table in `03-architecture-projects.md §3`):

| Model | Gap |
|---|---|
| `Project.kind` | Persisted in DB (`schema.prisma:367`), accepted by both write APIs, but **never shown or set** in any UI form or detail view |
| `ProjectSession` | `GET /api/projects/[slug]` fetches last 10 sessions (`[slug]/route.ts:18-24`) but the client `Project` interface (`[slug]/page.tsx:17-21`) has no `sessions` field — data silently discarded |
| `Task` | Count shown on list cards (`projects/page.tsx:203`) but no tasks tab on the detail page |
| `TaskLog`, `TaskAttachment` | No log viewer or attachment gallery anywhere in the portal |
| `ProjectSecretMapping` | Managed via API with CSRF + audit (`[id]/secrets/route.ts`) but never rendered in any UI |

**Dual-creation security gap:** `/projects/new/page.tsx:43` calls the weaker `POST /api/projects` instead of `POST /api/admin/projects`. Side-by-side comparison (`03-architecture-projects.md §4`):

| Concern | `/api/projects` (user-facing) | `/api/admin/projects` (admin) |
|---|---|---|
| Auth check | Manual string compare: `user.role?.toLowerCase() !== 'admin'` (`projects/route.ts:39`) | `requireApiAdmin()` helper (`admin/projects/route.ts:58`) |
| CSRF | **None** | `verifyCsrf(request)` (`admin/projects/route.ts:59`) |
| Audit log | **None** | `auditLog({ resource: 'project', op: 'create' })` (`admin/projects/route.ts:97`) |
| Input validation | Bare destructure; only `name` and `slug` required (`projects/route.ts:44`) | Full Zod schema with 12 fields, length limits, regex |
| Slug uniqueness | Caught via Prisma `P2002` error (`projects/route.ts:77`) | Explicit `findUnique` before insert (`admin/projects/route.ts:73`) |

An admin creating a project through the normal UI bypasses CSRF and leaves no audit record. Fix: point `/projects/new/page.tsx:43` at `POST /api/admin/projects`; return `405` from `POST /api/projects` to retire the weaker path.

**Filesystem-notes problem:** Three API routes (`files/[filename]/route.ts:7`, `docs/route.ts:7`, `docs/[...filepath]/route.ts:7`) perform direct disk I/O against `$PROJECTS_DIR/{slug}/`. The allowed files are hard-coded: `['README.md', 'CLAW-NOTES.md', 'CHANGELOG.md', 'SESSIONS.md']` (`files/[filename]/route.ts:10`). Problems: no audit trail on PUT (the admin routes all call `auditLog()` — the file-write route never does), no backup guarantee in Docker without an explicit volume, no full-text search via SQLite FTS5, no version history (PUT is a destructive `fs.writeFile` — `files/[filename]/route.ts:140`), and no write lock (concurrent PUTs silently corrupt content). `SESSIONS.md` duplicates the `ProjectSession` Prisma model (`schema.prisma:379-390`) that already has `title`, `summary`, `date`, `tags`. (`03-architecture-projects.md §5`)

The proposed fix is a `ProjectNote` DB model (proposed schema diff in `03-architecture-projects.md §8.2`) with `@@unique([projectId, noteType])` — mirroring the one-file-per-type pattern but with Prisma-enforced integrity and `editedById` audit trail.

Naming note: the notes tab in the detail page displays as `'🦀 Notes'` (`[slug]/page.tsx:45`) but the backend filename is `CLAW-NOTES.md` — an internal agent-artifact name leaking into the user-visible tab label. The migration to `ProjectNote` (noteType: `"notes"`) is the right moment to rename this surface. (`03-architecture-projects.md §5` item 7)

**Six named gaps in the project detail surface** (`03-architecture-projects.md §6`):

| Gap | Evidence |
|---|---|
| `Project.kind` enum is schema-only | `kind String @default("digital")` in `schema.prisma:367`; accepted by both write APIs but detail page uses `!project.repoUrl` (`[slug]/page.tsx:171`) as a proxy instead |
| No tasks tab | Task count on list cards (`projects/page.tsx:203`); no task table, no dispatch form, no link to AI Hub filtered by project on the detail page |
| Sessions silently discarded | `GET /api/projects/[slug]` fetches `sessions: { take: 10 }` (`[slug]/route.ts:18-24`); client `Project` interface (`[slug]/page.tsx:17-21`) has no `sessions` field — network payload dropped |
| No activity feed | `Activity` model (`schema.prisma:147-158`) records task events but no project-scoped feed surface; dispatch route writes `auditLog` but not a `writeActivity` with `entityId = project.id` |
| Secrets not visible | `ProjectSecretMapping` API is fully CSRF + audit-logged (`[id]/secrets/route.ts`); zero UI renders these mappings — an admin cannot verify secret bindings without hitting the API directly |
| No agent dispatch from project detail | Only `/ai-hub` can dispatch a task; project detail has a Settings button but no "Run agent" action; dispatch endpoint accepts `project_name` string (`dispatch-task/route.ts:16`), not a `project_id` |

**Proposed sub-route tree** (10 routes under a shared `layout.tsx`): overview, tasks, tasks/[id], sessions, notes, github, docs, activity, secrets, settings. Default redirect: `/projects/[slug]` → `/projects/[slug]/overview`. Full route table and 10-step migration sequence: `03-architecture-projects.md §7` and `§9`.

---

## 4. Feature Gap Inventory

*Source: `docs/audits/04-features-and-ux.md §2`.*

| Feature | Status | Evidence | Verdict |
|---|---|---|---|
| Unified inbox / command-centre | **PARTIAL** | `UrgentInboxWidget` on dashboard only; no standalone `/inbox` route; no "see all", snooze, or bulk-done | Must-have |
| Notes & ideas management | **PARTIAL** | `AiNote` model + API exist; buried under `/ai` → Notes tab; no sidebar entry | Must-have |
| Personal todos | **PRESENT** | `/todos` page, full CRUD (`src/app/todos/page.tsx:31-407`) | Solid |
| Ideas backlog distinct from todos | **MISSING** | No `Idea` model; "Ideas" is only a hard-coded category string in the todo form (`todos/page.tsx:257`) | Nice-to-have |
| Physical vs digital project distinction | **PARTIAL** | `Project.kind` exists in schema (`schema.prisma:368`) but no UI reads or sets it | Must-have |
| Calendar / scheduling | **MISSING** | No `/calendar` route; no Microsoft Graph calendar wrapper | Nice-to-have |
| Quick-capture global shortcut (⌘N) | **MISSING** | No `QuickCapture` component; only `⌘K` is wired (`CommandPalette.tsx:78`) | Must-have |
| Global search across entities | **MISSING** | No `/api/search` route; `CommandPalette` only fetches `/api/services` (`CommandPalette.tsx:38-42`) | Must-have |
| Dashboard status-at-a-glance | **PARTIAL** | 7 widgets present; missing project KPIs, task queue depth, agent worker status | Needs expansion |
| Notifications / alert centre | **MISSING** | No Bell icon in sidebar (`MainSidebar.tsx:6-34`); no unread-count badge anywhere | Must-have |
| Cross-project task queue (`/tasks`) | **MISSING** | `Task` model has 60+ fields (`schema.prisma:527-586`), full API at `/api/ai-hub/tasks/`, but no `/tasks` page | Must-have |
| Bookmarks | **MISSING (dead link)** | Sidebar link at `MainSidebar.tsx:69` → `/bookmarks`; no `src/app/bookmarks/` page exists; API present | Dead link |
| Mobile capture | **PARTIAL** | Sidebar collapses; dashboard bottom-sheet exists; no global FAB outside admin-only one | Needs work |

---

## 5. Information Architecture & UX

*Source: `docs/audits/04-features-and-ux.md §3–§6`.*

### 5.1 Current navigation audit

The sidebar (`src/components/layout/MainSidebar.tsx`) has two top-pinned items (Dashboard, AI Hub), four accordion groups (Productivity, Infrastructure, Development, Manage), and bottom-pinned Settings/Sign Out. Accordion state persists in `localStorage[sidebar.openGroup]` (`MainSidebar.tsx:153`); the group containing the current page wins on navigation (`:179-198`).

```
┌─────────────────────────────────────┐
│ LEPODER brand + collapse toggle     │  L233-273
├─────────────────────────────────────┤
│ TOP-PINNED (always visible)         │
│   • Dashboard                        │  L277-283
│   • AI Hub                           │  L284-290
├─────────────────────────────────────┤
│ ▼ Productivity   (one open at time) │  L62-71
│     Mail · Todo List · OneNote ·     │
│     Bookmarks (DEAD LINK)            │
│ ▶ Infrastructure                     │  L72-81
│     Tailscale · Local · VPS · Remote │
│ ▶ Development                        │  L82-105
│     Projects · Amonis Finance ·      │
│     Insights · Agents                │
│ ▶ Manage (admin only)                │  L106-143
│     Services · Agents · Recurring ·  │
│     MCP audit · Skills · Reports     │
├─────────────────────────────────────┤
│ BOTTOM-PINNED                        │  L347-378
│   • Help (admin-only) · Settings ·  │
│     Sign Out                         │
└─────────────────────────────────────┘
```

Key issues:

| Problem | Evidence |
|---|---|
| AI Hub top-pinned; Agents buried in "Development" — same feature, split positions | `MainSidebar.tsx:284-290` vs `:99-103` |
| Amonis Finance (personal finance sub-app) grouped under "Development" with CI/CD tooling | `MainSidebar.tsx:92-96` |
| "Productivity" mixes todos, cloud notebook, cloud mail, and a broken bookmarks link | `MainSidebar.tsx:62-71` |
| `/bookmarks` link is dead — page does not exist | `MainSidebar.tsx:69`; `src/app/bookmarks/` absent |
| Help link is admin-only (inside `adminOnly: true` Manage group) | `MainSidebar.tsx:106-143` |
| 6 models with backing APIs have no sidebar entry | Notes, Tasks, Urgent items, Activity, Bookmarks (missing page), Memories |

**Models present in the schema with no sidebar surface** (`04-features-and-ux.md §3.3`):

| Entity | Prisma model | API | Sidebar? |
|---|---|---|---|
| Bookmarks | `Bookmark` (`schema.prisma:304`) | `/api/bookmarks` | Link present, page **missing** |
| Notes | `AiNote` (`schema.prisma:257`) | `/api/ai/notes` | None — buried in `/ai` tab |
| Urgent items | `UrgentItem` (`schema.prisma:319`) | `/api/webhook/urgent` | None — only a 4-item widget |
| Cross-project tasks | `Task` (`schema.prisma:527`) | `/api/ai-hub/tasks` | None |
| Activity feed | `Activity` (`schema.prisma:147`) | `/api/activity` | None — only a widget |
| AI memories | `AiMemory` (`schema.prisma:287`) | via MCP | None |

### 5.2 Proposed IA

A top-pinned action strip replaces scattered entry points:

```
[ ⌘K Search ]  [ ⌘N Capture ]  [ 🔔 N ]   ← always visible
```

Five accordion groups replace the current four:

| Group | Items |
|---|---|
| **Mission Control** | Dashboard · Inbox (new) · Activity (new) · Tasks (new) |
| **Life Org** | Todos · Notes (new `/notes`) · Bookmarks (fix) · Calendar (new) |
| **Work** | Projects · AI Hub · Agents · Amonis Finance |
| **Comms & Cloud** | Mail · OneNote · Market Research (rename from "Insights") |
| **Services & Infra** | Tailscale · Local Services · VPS Servers · Remote Desktop |

`Admin` group stays admin-only. Bottom-pinned: Help (move out of admin) · Settings · Sign Out.

The top-pinned action strip replaces the current "scroll through groups and remember what is in each" UX. `⌘K` keeps its existing binding (`CommandPalette.tsx:78`); `⌘N` is new; the 🔔 badge counts `UrgentItem.where(done=false)` plus `Task.where(status='failed')`. Each group has a single coherent verb: *manage today*, *organise life*, *do project work*, *check comms*, *check machines* — cognitive load stays flat as more routes are added. (`04-features-and-ux.md §4.3`)

### 5.3 UX friction points

1. **Project detail is a doc viewer, not a workspace** — task badge on list card raises expectation; clicking lands on GitHub/Notes tabs with no task surface. (`04-features-and-ux.md §5.1`, `03-architecture-projects.md §1`)
2. **Tasks have zero UI surface** — `Task` is the richest model (60+ fields), fully absent from all page routes. (`04-features-and-ux.md §5.2`)
3. **No quick-capture** — adding a todo requires navigation + 5 clicks/keystrokes; no keyboard shortcut from other pages. (`04-features-and-ux.md §5.3`)
4. **Accordion sidebar hides context** — only one group open at a time on a desktop with 900 px vertical real estate. (`04-features-and-ux.md §5.4`)
5. **Mixed French/English UI** — projects page and dashboard use French strings (`"Actif"`, `"Aucun service trouvé"`, `toLocaleDateString('fr-FR')`); sidebar and todos are English-only. (`04-features-and-ux.md §3.4`)
6. **No notification badge** — failed tasks, unresolved urgent items, and unread mail are all invisible from the nav. (`04-features-and-ux.md §5.6`)
7. **Command palette is service-only** — empty state copies "No results found" but the search is only across `/api/services`; cannot find a todo, note, or project. (`04-features-and-ux.md §5.7`)
8. **Dashboard mixes "today" with "everything"** — 7 widgets (Weather, Markets, UrgentInbox, ActivityFeed, Outlook, OneNote, Tailscale) stacked above the full service catalogue (`dashboard/page.tsx:243-251`, `:282-317`) creates ~3500 px scroll on a fresh login. The "what is happening right now" mission-control role and the "launch any service" launcher role are vertically stacked with no visual break. A section divider or a separate `/services` catalogue page would halve the perceived complexity. (`04-features-and-ux.md §5.9`)
9. **`[slug]/page.tsx` has no shared layout** — `src/app/projects/new/page.tsx` renders without `MainSidebar` (`03-architecture-projects.md §2.1`), breaking the authenticated-layout expectation mid-flow. The dashboard uses custom data hooks (`useAuth`, `useServices`, `useFavorites` — `dashboard/page.tsx`) as a reference; the projects pages use five separate `useEffect` chains managing their own loading and error state with no equivalent abstraction.

### 5.4 Mobile

Positives: sidebar collapses to an off-canvas overlay (`MainSidebar.tsx:226-232`); dashboard has a `MobileActionsMenu` bottom-sheet (`dashboard/page.tsx:441-566`); admin FAB is 56×56 px (meets 44 px guideline).

Gaps (`04-features-and-ux.md §6`):

| Gap | Evidence | Quick fix available? |
|---|---|---|
| No global capture FAB on mobile | Admin-only FAB at `dashboard/page.tsx:336-350`; no equivalent for regular users or on other pages | Yes — extract FAB, remove `adminOnly` guard, mount in layout |
| Sidebar touch targets ~32 px | `MainSidebar.tsx:66-69` (`py-2`, `h-3.5 w-3.5` icons) | Yes — bump to `py-2.5` + `h-4 w-4` (see §6 #13) |
| Todo edit/delete buttons 28 px | `todos/page.tsx:329-401` (`p-1.5`) | Yes — bump padding |
| Bottom-sheet capture pattern is a one-off | Exists only at `dashboard/page.tsx:441-566` | Medium — extract as reusable `<BottomSheet>` component |
| No swipe-to-complete on todos | `todos/page.tsx:329-401` | Medium — requires a gesture library |
| No haptics or pull-to-refresh | — | Low priority |

---

## 6. Quick Wins (< 1 hour each)

Ranked by impact. Each traced to a sub-audit file.

| # | Description | Source | Effort |
|---|---|---|---|
| 1 | **Delete `/api/todos/debug`** — eliminates C4 (unauthenticated user dump) in one file deletion | `01-code-quality.md C4` | 1 min |
| 2 | **Delete dead `triggerAgent` function** — removes dead code with latent bug | `01-code-quality.md M5` | 1 min |
| 3 | **Fix `max_tokens: 8096` → `8192`** | `01-code-quality.md L3` | 1 min |
| 4 | **`interval.unref()` in `rate-limit.ts:84`** — prevents HMR interval leak | `01-code-quality.md M7` | 1 min |
| 5 | **Fix `task.agentId!` → `task.agentId ?? null`** — prevents runtime crash | `01-code-quality.md L5` | 1 min |
| 6 | **Fix `run_bash` zombie processes** — pass `{ timeoutMs: 60_000 }` to `run()` instead of `Promise.race` | `01-code-quality.md L4` | 15 min |
| 7 | **Add slug re-validation guard at use sites** — `if (!/^[a-z0-9-]+$/.test(slug)) return 400` in files route and docs route | `01-code-quality.md M6` | 15 min |
| 8 | **Fix `/bookmarks` dead link** — stub a page that renders `Bookmark` rows from the existing API, or at minimum remove the broken nav entry | `04-features-and-ux.md §7 #1` | 30 min |
| 9 | **Move `/manage/help` → `/admin/help`** — delete the orphaned `src/app/manage/` directory | `02-architecture-core.md §6.3` | 15 min |
| 10 | **Rename "Insights" → "Market Research"** in sidebar — label is honest about Reddit scraping | `04-features-and-ux.md §7 #2`, `MainSidebar.tsx:97` | 1 min |
| 11 | **Move Help out of the admin-only group** — extract `Help` from `Manage` (`adminOnly: true`) and pin it at the bottom | `04-features-and-ux.md §7 #3` | 10 min |
| 12 | **Add a "View all" link inside `UrgentInboxWidget`** pointing to future `/inbox` | `04-features-and-ux.md §7 #7` | 10 min |
| 13 | **Bump sidebar touch targets** — `py-2` → `py-2.5`, icons `h-3.5 w-3.5` → `h-4 w-4` | `04-features-and-ux.md §7 #6` | 15 min |
| 14 | **Unify language** — translate French strings in projects page and dashboard to English (or establish consistent locale and remove hard-coded `'fr-FR'`) | `04-features-and-ux.md §7 #5` | 30 min |

---

## 7. Bigger Bets (need planning)

### Security hardening

| Item | Theme | Effort |
|---|---|---|
| Fail-closed secrets: throw at startup when `AMONIS_API_TOKEN`, `AUTH_SECRET`, or `CSRF_SECRET` is unset; delete seed/debug routes (C1–C4) | Security | S |
| Worker hardening: fix GitHub token in `.git/config`, strip secrets from `run_bash` env, fix zombie timeout (H2, H3, L4) | Security | S |
| Amonis sub-app hardening: apply `requireApiAdmin` + `verifyCsrf` + zod to all `/api/amonis/**`; remove `PUBLIC_PATHS` entries; coordinate worker bearer update (C5–C9, M3–M5) | Security | M |
| CSRF + auth consistency sweep: horizontal pass applying `verifyCsrf` + correct auth helper to all remaining mutating routes (H5–H7, M1–M2, L6) | Security | M |
| Microsoft token + TOTP encryption: Prisma migration adding `iv`/`tag` columns; wrap reads/writes in existing `encryptSecret`/`decryptSecret`; resolve callback route duplication (H1, M10) | Security | S |

### Architecture cleanup

| Item | Theme | Effort |
|---|---|---|
| Create `src/lib/integrations/` and migrate Synology/Shopify/Reddit clients out of route files; normalize Microsoft split | Architecture | M |
| Extract service layer for Amonis trigger and AI chat inline Prisma calls into `src/lib/services/` | Architecture | M |
| Split `src/lib/utils.ts` and reorganize `src/lib/` per proposed sub-directory layout | Architecture | S |
| Define `src/server/` vs `src/lib/` boundary in a CONTRIBUTING.md or ADR | Architecture | S (docs only) |

### Projects restructure

| Item | Theme | Effort |
|---|---|---|
| Route `/projects/new` to `POST /api/admin/projects` (the secure path) — closes dual-creation gap | Projects | S |
| Add `Project.kind` to all UI forms; create `src/types/projects.ts` type guard | Projects | S |
| Migrate filesystem notes to `ProjectNote` DB model; one-time migration script; update worker tooling in same PR | Projects | M |
| Build the 10-sub-route layout under `projects/[slug]/layout.tsx`; surface tasks, sessions, secrets, activity, settings tabs | Projects | L |

### Features

| Item | Theme | Effort |
|---|---|---|
| Global quick-capture (⌘N): entity-picker modal mounted in `ClientProviders.tsx` alongside `CommandPalette` | Features | 1–2 days |
| Cross-entity global search: `GET /api/search?q=` fanning out across Todo/AiNote/Bookmark/Project/Task/UrgentItem; wire into `CommandPalette` | Features | 2–3 days |
| Dedicated `/inbox` page: full `UrgentItem` list with snooze, bulk-done, source/priority filter | Features | 2 days |
| Dedicated `/tasks` page: cross-project task queue grouped by project, filtered by status | Features | 2 days |
| Persistent notification system: `<NavBadge>` slot on `SidebarLink`; `useNotifications()` hook aggregating urgent items + failed tasks | Features | 2 days |
| Microsoft Graph calendar surface at `/calendar`; expose on dashboard alongside UrgentInbox | Features | 3 days |
| Notes/Ideas split: promote `AiNote` to `/notes`; add `Idea` model + `/ideas` triage page | Features | 3–4 days |
| Mission Control sidebar restructure (§5.2 proposal) | Features | 1 day |

---

## 8. Recommended Refactor Sequence

Ordered to avoid dependency conflicts and keep the portal stable at each step. Each step is independently deployable.

1. **Fail-closed secrets** (C1, C2, C3, C4) — Throw at startup for missing secret env vars; delete `/api/todos/debug` and the `seed` secret-string path. No downstream code affected. Confirms the deployment environment before any structural changes.

2. **Worker security hardening** (H2, H3, L4, L5) — Fix GitHub PAT persistence in `.git/config`; strip 1Password secret env keys before `run_bash`; fix `run_bash` zombie processes; null-guard `task.agentId`. Self-contained in `worker/`; no Next.js changes.

3. **Amonis sub-app hardening** (C5–C9, M3–M5) — Apply `requireApiAdmin` + `verifyCsrf` + zod to all `/api/amonis/**` routes; remove their `PUBLIC_PATHS` entries; update the worker bearer token on the same PR to avoid a broken-window period.

4. **CSRF + auth consistency sweep** (H5, H6, H7, M1, M2, L6) — One atomic PR applying `verifyCsrf` + the correct auth helper to all remaining mutating routes. Completes the full security hardening before structural changes begin.

5. **Encryption + callback dedup** (H1, M10) — Prisma migration for `MicrosoftAccount.iv`/`tag` and `User.totpSecret` encryption; resolve the duplicated Microsoft callback route. Coordinate migration and code change in one PR.

6. **Integrations normalisation** (`02-architecture-core.md §4`) — Create `src/lib/integrations/<name>/` for all nine integrations; consolidate Microsoft split files; move Synology/Shopify/Reddit logic out of route files. Purely mechanical; no behaviour changes.

7. **Service layer + `src/lib/` split** (`02-architecture-core.md §2`, `§5`) — Introduce `src/lib/services/` (projects, amonis, portal); reorganise `src/lib/` sub-directories. Prerequisite for the layout and UI work that follows.

8. **Layout consolidation** — Move `MainSidebar` into a shared authenticated layout; fix the `src/app/manage/` orphan (`02-architecture-core.md §6`). Must happen before sidebar IA changes take effect everywhere.

9. **Filesystem notes → `ProjectNote` DB model** (`03-architecture-projects.md §5, §8.2`) — Add `ProjectNote` model; one-time migration script for existing `.md` files; swap file routes to read/write Prisma; update worker `read_file`/`write_file` in the same PR. New sub-routes must be built on the correct storage model.

10. **`Project.kind` + dual-creation fix** (`03-architecture-projects.md §9 Steps 1–2`) — Route `/projects/new` to `POST /api/admin/projects`; add `kind` selector to create form and settings modal; add `ProjectKind` type guard.

11. **Projects sub-route restructure** (`03-architecture-projects.md §7, §9 Steps 3–10`) — Extract components to `src/components/projects/`; introduce `projects/[slug]/layout.tsx`; build tasks, sessions, secrets, activity, settings sub-routes. Largest single UI change; run alongside old `[slug]/page.tsx` on a feature branch until cut-over.

12. **Global search + quick-capture + inbox** (`04-features-and-ux.md §8`) — `GET /api/search`; `⌘N` capture modal in `ClientProviders.tsx`; `/inbox` page for `UrgentItem`. Implement after the information architecture is stable and entity routes from step 11 exist.

13. **Sidebar IA update** (`04-features-and-ux.md §4.2`) — Apply the proposed 5-group structure and top-pinned action strip to `MainSidebar.tsx` as the last step, once all new routes from steps 11–12 are live.

---

## 9. Cross-references

All claims in this report are traceable to one of four evidence files. Do not raise GitHub issues based solely on this consolidated report — always cite the originating sub-audit file and line number so reviewers can verify context. If a sub-audit file contains detail that appears to contradict this summary, the sub-audit file is authoritative (this report synthesizes; it does not replace).

- **`docs/audits/01-code-quality.md`** — Rex's code quality, type safety, and security audit (9 critical, 7 high, 10 medium, 6 low findings). Contains full code excerpts, risk descriptions, and fix guidance. Authoritative source for §2.
- **`docs/audits/02-architecture-core.md`** — Archer's core architecture audit: `src/lib/` categorization and proposed sub-directory layout, `src/server/` vs `src/lib/` boundary rule, integration normalization, service-layer gaps, and `admin/` vs `manage/` reconciliation. Authoritative source for §3.1–§3.5.
- **`docs/audits/03-architecture-projects.md`** — Archer's projects-section deep-dive: full route and component inventory, schema-to-UI gap matrix, dual-API-stack security gap, filesystem-notes analysis, proposed sub-route tree, proposed schema changes, and a 10-step migration sequence. Authoritative source for §3.6.
- **`docs/audits/04-features-and-ux.md`** — Pixel's IA, UX, and feature-gap audit: feature-gap matrix, sidebar anatomy, split-concern analysis, proposed IA with 5-group structure, 9 UX friction points, and mobile audit. Authoritative source for §4, §5, and the UX items in §6–§8.

### Out of scope for this audit cycle

The following areas were flagged but not fully reviewed in any of the four sub-tasks:

- **Microsoft OAuth callback flow** — two route files appear to coexist (M10); which is active and whether state/nonce CSRF is correctly enforced requires a dedicated follow-up read of both callback handlers.
- **MCP server internals** — `src/server/mcp/` tool dispatch was reviewed at the architecture level (§3.4) but individual tool handler security (injection guard coverage, return-value sanitization) was not audited.
- **Redis / production rate-limiting** — M7 flags the in-process store as insufficient for multi-worker deploys. The right Redis solution depends on the production infrastructure setup.
- **`worker/` dependency surface** — the worker process imports from `src/lib/` indirectly (via shared Prisma client). A full dependency graph audit was not performed.

These items should be added to a follow-up audit backlog rather than treated as non-issues.
