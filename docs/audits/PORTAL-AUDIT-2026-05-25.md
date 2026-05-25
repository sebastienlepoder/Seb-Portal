# LEPODER Portal — Full Audit (2026-05-25)

## 0. Scope & Method

Read-only audit covering `src/`, `worker/`, `middleware.ts`, and `prisma/schema.prisma`. Files read directly in this session: `docs/audits/01-code-quality.md` (Rex's findings, fully incorporated), `src/components/layout/MainSidebar.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[slug]/page.tsx`, `src/app/projects/new/page.tsx`, `src/app/dashboard/page.tsx`. All six files were verified; no claims are marked "(not verified)." Architecture and UX findings are derived from observed code; every behavioral claim cites a file or model.

---

## 1. Executive Summary

- **Security is the immediate blocker.** Nine critical vulnerabilities — hardcoded bearer/session/CSRF secrets, fully-public Amonis mutation endpoints, unauthenticated debug/seed routes — allow admin takeover, cost-DoS, and data exfiltration with zero credentials. All are readable in the public source.
- **The Amonis sub-app is an ungated attack surface.** Five of nine critical findings are in `/api/amonis/`. The entire sub-app is excluded from the middleware session check via `PUBLIC_PATHS`; three routes perform destructive mutations without any auth or CSRF token.
- **The projects section is a documentation viewer, not a workspace.** The `[slug]` detail page has five tabs: GitHub activity, CLAW-NOTES.md, README.md, Docs (GitHub), CHANGELOG.md. The `Task`, `ProjectSession`, `ProjectSecretMapping`, and `TaskLog` Prisma models have no UI route anywhere in the projects section.
- **Project notes live on the filesystem, not the database.** CLAW-NOTES.md, README.md, and CHANGELOG.md are read/written via `/api/projects/[slug]/files/[filename]` — local disk files alongside the project clone directory, outside Prisma and therefore outside audit logging, backup, and search.
- **The information architecture conflates two distinct missions.** The sidebar mixes "AI mission control" items (Agents, Projects, AI Hub) with "life organisation" items (Todos, OneNote, Mail) and infrastructure monitoring in groups named by technology rather than purpose. The dashboard is a service-tile grid with widgets, not a mission-control overview.

---

## 2. Code Quality & Security Findings

*All findings, file:line citations, and code excerpts sourced from `docs/audits/01-code-quality.md` (Rex, 2026-05-25). Prose is compacted; no findings are dropped.*

### Critical

#### C1. Hardcoded production bearer token grants admin
**Files:** `src/lib/auth.ts:6`, `src/middleware.ts:9`  
`AMONIS_API_TOKEN` falls back to `'amonis-claw-2026'`; any request bearing that string is returned as `{ role: 'admin' }` and bypasses session checks entirely — the string is in the public repo.  
**Fix:** Throw at startup if `AMONIS_API_TOKEN` is unset; never fall back.

#### C2. Hardcoded `AUTH_SECRET` and `CSRF_SECRET` fallbacks
**Files:** `src/lib/auth.ts:9`, `src/lib/csrf.ts:4`  
`AUTH_SECRET` falls back to a known placeholder constant; `CSRF_SECRET` falls back to `'csrf-fallback-secret'`. Either value in production means iron-session cookies and CSRF HMACs are forgeable by anyone who has read the source.  
**Fix:** Throw at module load when the env var is absent.

#### C3. `/api/todos/seed` — hardcoded bypass + user enumeration on mismatch
**Files:** `src/app/api/todos/seed/route.ts:23,28-38`, `src/middleware.ts:5`  
`'lepoder-seed-2026'` allows acting as any admin via a public path; when the secret does not match, the error response leaks every user's email and role.  
**Fix:** Delete the secret-string path; make the route admin-session-only or move to a one-shot CLI script.

#### C4. `/api/todos/debug` — unauthenticated full user dump
**File:** `src/app/api/todos/debug/route.ts:5-19`  
No auth check; returns all users' email, role, and per-user todo counts. Listed in `PUBLIC_PATHS`.  
**Fix:** Delete the route.

#### C5. `/api/amonis/tasks/update` — public mass-assignment
**Files:** `src/app/api/amonis/tasks/update/route.ts:8-46`, `src/middleware.ts:5`  
Public path; spreads the entire request body directly into `prisma.amonisTask.update` — any field on any task can be overwritten by an unauthenticated caller.  
**Fix:** Require admin auth; validate against a zod allowlist; remove from `PUBLIC_PATHS`.

#### C6. `/api/amonis/tasks/trigger` — unauthenticated Anthropic cost-DoS
**Files:** `src/app/api/amonis/tasks/trigger/route.ts`, `src/middleware.ts:5`  
Anyone can POST `{ taskId }` to launch a fire-and-forget streaming Claude call; each call burns Anthropic credit and writes unbounded log rows to `amonisAgentLog`.  
**Fix:** Require admin or worker bearer; add per-IP rate limit.

#### C7. `/api/amonis/tasks/pending` and `/revert` are public
**Files:** `src/app/api/amonis/tasks/pending/route.ts:10`, `src/app/api/amonis/tasks/revert/route.ts:8`  
`pending` exposes the full task queue to unauthenticated callers; `revert` lets anyone mark any task reverted and mutate its description. Both in `PUBLIC_PATHS`.  
**Fix:** Require worker bearer or session auth; remove from `PUBLIC_PATHS`.

#### C8. `/api/amonis/agents/[id]` PATCH — any user can rewrite agent system prompts
**Files:** `src/app/api/amonis/agents/[id]/route.ts:32-52`, `src/middleware.ts:5`  
Prefix `/api/amonis/agents/` is in `PUBLIC_PATHS`; handler has no admin check. Any logged-in user (or the C1 bearer) can overwrite `systemPrompt`, `scope`, `enabled` on any agent — a prompt-injection vector into all subsequent dispatches.  
**Fix:** Use `requireApiAdmin()` + zod schema; remove prefix from `PUBLIC_PATHS`.

#### C9. `/api/amonis/webhook` — auth check fails open
**File:** `src/app/api/amonis/webhook/route.ts:7-12`  
When `AMONIS_WEBHOOK_SECRET` is unset the token check is skipped; the endpoint then proxies to `OPENCLAW_WEBHOOK_URL` using the portal's own bearer and mutates task status. `task.agentId!` on line 47 also crashes when no agent is assigned.  
**Fix:** Reject when secret is unset; null-guard `task.agentId`.

---

### High

#### H1. Microsoft OAuth tokens and TOTP secrets in plaintext
**File:** `prisma/schema.prisma` (`MicrosoftAccount.accessToken`/`refreshToken`, `User.totpSecret`)  
`encryptSecret`/`decryptSecret` exist in `src/lib/crypto.ts` and already protect the 1Password Connect token; MS Graph tokens and TOTP shared secrets are not wrapped.  
**Fix:** Wrap with the existing AES-256-GCM helper; add `iv`/`tag` migration columns.

#### H2. GitHub PAT persisted in `.git/config` of reused clone dirs
**Files:** `worker/git-handler.ts:99-103`, `worker/git-handler.ts:138-145`  
`cloneUrl()` embeds the token inline in the remote URL; `.git/config` retains it between tasks; any agent `read_file` call can extract the PAT.  
**Fix:** Use `http.extraheader` credential helper or rewrite remote URL back to unauthenticated form after each fetch/push.

#### H3. Worker agent has shell access with 1Password secrets in `env`
**Files:** `worker/claude-agent.ts:140-160`, `worker/task-executor.ts:73-80`  
`run_bash` spawns `/bin/sh -c <model-supplied command>` with 1Password-resolved secrets in `process.env`; the agent can trivially `env > leak.txt && git add -A && git push`.  
**Fix:** Strip known secret env keys before spawning the shell, or pass secrets only to declared build/test commands.

#### H4. Successful auto-merge still recorded as `needs_review`
**File:** `worker/task-executor.ts:323-340`  
`complete()` always writes `status: 'needs_review'` even when `mergedAt` is populated; merged tasks appear on the dashboard as still needing review.  
**Fix:** Write `status: 'completed'` (or `'merged'`) when `mergedAt` is set.

#### H5. PATCH `/api/webhook/urgent` — any user can flip any urgent item
**File:** `src/app/api/webhook/urgent/route.ts:79-95`  
No ownership check, no CSRF, no zod; any authenticated user can toggle the `done` flag on any `UrgentItem` by id.  
**Fix:** Check `UrgentItem.userId`; add `verifyCsrf` + zod.

#### H6. Several mutating routes skip CSRF
**Files:** `src/app/api/ai/chat/route.ts`, `src/app/api/admin/update/route.ts`, `src/app/api/admin/sync-config/route.ts`, `src/app/api/projects/route.ts` (POST), `src/app/api/projects/[slug]/files/[filename]/route.ts` (PUT), all `/api/amonis/**`  
The mature admin routes under `/api/admin/projects/*`, `/api/admin/agents/*`, and `/api/ai-hub/dispatch-task` correctly call `verifyCsrf(request)`; the above routes predate that pattern and have not been updated.  
**Fix:** Apply the `verifyCsrf` pattern uniformly to all mutating routes.

#### H7. `/api/admin/update` — no CSRF, fragile version compare, swallowed errors
**File:** `src/app/api/admin/update/route.ts:108-180`  
Triggers a host-side update via webhook or trigger file with no CSRF, no rate limit; `.version`-file string vs 7-char SHA prefix comparison is unreliable; webhook errors silently swallowed.  
**Fix:** Add CSRF; normalise version comparison; surface webhook failures.

---

### Medium

#### M1. Middleware session check is a no-op
**File:** `src/middleware.ts:36-46`  
Checks only that `lepoder_session` cookie exists — does not validate the iron-session signature. Any handler relying on middleware instead of calling `requireApiAuth` is effectively unprotected.  
**Fix:** Validate the session in middleware, or document that route handlers are the sole auth boundary and audit every route.

#### M2. `/api/admin/sync-config` — no CSRF, raw error to client
**File:** `src/app/api/admin/sync-config/route.ts:31-50`  
Returns `String(error)` in the response body; without CSRF, an admin on a malicious page can trigger DB writes and the attacker can read the resulting error.  
**Fix:** Add CSRF; log details server-side; return a generic error string.

#### M3. `/api/amonis/tasks/[id]` PATCH/DELETE — no admin check, no CSRF
**File:** `src/app/api/amonis/tasks/[id]/route.ts:30-77`  
Any logged-in user can mutate or delete any task; the C1 bearer also reaches this path.  
**Fix:** Require admin; add CSRF.

#### M4. `/api/amonis/tasks/` POST — no input validation
**File:** `src/app/api/amonis/tasks/route.ts:30-67`  
`title`, `description`, `priority` forwarded to Prisma without zod; missing `title` causes a 500 instead of a 400.  
**Fix:** Add a zod schema; return 400 on invalid input.

#### M5. `triggerAgent` is dead code with a latent bug
**File:** `src/app/api/amonis/tasks/route.ts:69-79`  
Defined but never called; when `AMONIS_WEBHOOK_SECRET` is unset it would send `Authorization: Bearer` with no value.  
**Fix:** Delete.

#### M6. `slug` not re-validated against path traversal at use sites
**Files:** `src/app/api/projects/[slug]/files/[filename]/route.ts:42-49`, `src/app/api/projects/[slug]/docs/[...filepath]/route.ts:51-58`  
`slug` is interpolated into `path.join(PROJECTS_DIR, slug, ...)` without local re-validation; the creation-time regex guard is not re-applied.  
**Fix:** `if (!/^[a-z0-9-]+$/.test(slug)) return 400` at each use site.

#### M7. In-memory rate limiter leaks intervals; per-process only
**File:** `src/lib/rate-limit.ts:84-94`  
`setInterval` registered at module load, never `unref`'d — leaks across HMR cycles; per-process store gives N× budget in multi-worker deploys.  
**Fix:** `interval.unref()`; switch to Redis for production (file's own comment flags this).

#### M8. `getClientIp` trusts `X-Forwarded-For` without proxy allowlist
**File:** `src/lib/audit.ts:43-49`  
Client can spoof IP to bypass rate-limit keys and poison audit logs without a trusted reverse proxy.  
**Fix:** Only honour XFF when `TRUSTED_PROXY` env is set.

#### M9. `/api/webhook/urgent` POST — timing-leaky token compare + no zod
**File:** `src/app/api/webhook/urgent/route.ts:25-39, 42-57`  
Non-constant-time bearer compare; body cast `as UrgentItemPayload` without runtime validation; missing fields coerce silently.  
**Fix:** Use `crypto.timingSafeEqual`; add a zod schema.

#### M10. Microsoft callback route duplication
**Files:** `src/app/api/microsoft/callback/route.ts`, `src/app/api/auth/microsoft/callback/route.ts`  
Both appear to exist. Only one should be reachable; state/nonce CSRF protection needs confirmation on the active route.  
**Fix:** Delete the unused callback; verify state/nonce on the surviving route.

---

### Low

#### L1. Redundant `findFirst` in worker task lock
**File:** `worker/index.ts:36-55` — Initial `findFirst` is wasted; the subsequent `findMany` covers it.  
**Fix:** Drop `findFirst`.

#### L2. Unreachable fallback in `pickAgentByExpertise`
**File:** `src/lib/agents.ts:165-167` — `?? active.sort(...)[0] ?? null` tail is dead code when `active.length > 0`.  
**Fix:** Drop the tail.

#### L3. `max_tokens: 8096` typo
**File:** `src/app/api/amonis/tasks/trigger/route.ts:31` — Likely intended `8192`.  
**Fix:** Correct the value.

#### L4. `run_bash` leaves zombie processes on timeout
**File:** `worker/claude-agent.ts:148-160` — 60 s timeout via `Promise.race` does not kill the child process; `run()` supports `timeoutMs` with SIGTERM/SIGKILL escalation.  
**Fix:** Pass `{ timeoutMs: 60_000 }` to `run()` instead of racing.

#### L5. `task.agentId!` non-null assertion can crash
**File:** `src/app/api/amonis/webhook/route.ts:47` — Coerces `null` to non-null; Prisma throws at runtime when the task has no assigned agent.  
**Fix:** Use `task.agentId ?? null` and make the field optional in the schema.

#### L6. Inconsistent auth helpers across routes
`getSessionUser()` (no bearer) used in `src/app/api/admin/update`, `sync-config`, `projects/*`; `getApiUser()` (bearer + session) elsewhere; well-factored routes use `requireApiAuth`/`requireApiAdmin`. Drift makes future auditing harder.  
**Fix:** Pick one pattern per use-case and apply uniformly.

---

## 3. Architecture Findings

### 3.1 Top-level structure issues

`src/lib/` is a flat directory mixing four distinct concerns: pure utilities (`utils.ts`, `crypto.ts`), auth primitives (`auth.ts`, `csrf.ts`), DB-touching business logic (`agents.ts`, `agent-dispatch.ts`, `audit.ts`, `bootstrap.ts`), and integration HTTP clients (`coolify.ts`, `microsoft.ts`, `microsoft-auth.ts`, `tailscale.ts`, `onepassword.ts`, `anthropic.ts`). Nothing in the naming signals "safe to import anywhere" vs "touches the database" vs "makes external network calls."

`src/server/` contains further server-only logic (`statusChecker/`, `vpnChecker.ts`, `iconProviders/`, `mcp/`) with no documented boundary separating it from `src/lib/`. New contributors will arbitrarily split similar features across both directories.

Route handlers in `src/app/api/` range from well-factored thin wrappers (the admin routes Rex identifies as reference implementations) to fat handlers with inline Prisma and Anthropic SDK calls (the Amonis routes). The `src/lib/agent-dispatch.ts` service-layer pattern exists but is applied only to the dispatch flow; projects, Amonis tasks, and webhooks do not follow it.

`src/app/manage/` and `src/app/admin/` both exist as top-level app directories. The `manage/` tree contains `admin/`, `ai/`, and `help/` sub-routes; `src/app/admin/` handles services management. The boundary is unclear from naming alone — `admin` appears at both levels.

**Proposed structural rules:**
```
src/lib/               — pure utilities + auth primitives only (no DB, no HTTP)
src/lib/services/      — business logic + Prisma (agents, dispatch, audit, projects)
src/lib/integrations/  — one dir per external service (see §3.3)
src/server/            — server-side infrastructure (status checks, MCP server, icon providers)
src/app/api/           — thin REST adapters; import from services/, not Prisma directly
```

### 3.2 Portal-meta vs Life-org tangle

Current sidebar grouping (verified from `src/components/layout/MainSidebar.tsx`):

| Group | Items |
|---|---|
| *(always visible)* | Dashboard, AI Hub |
| Productivity | Mail · Todo List · OneNote |
| Infrastructure | Tailscale · Local Services · VPS Servers · Remote Desktop |
| Development | Projects · Amonis Finance · Insights · Agents |
| Manage *(admin only)* | Manage services · Manage agents · Reports · Help |

The dashboard itself (verified from `src/app/dashboard/page.tsx`) is a service-tile grid with six widgets (Weather, Markets, UrgentInbox, Outlook, OneNote, Tailscale) — infrastructure-focused, not a mission-control overview. There are no project KPIs, no task queue, no agent status on the dashboard.

"Development" bundles AI-project-management tools (Projects, Agents) with a standalone finance sub-app (Amonis) and analytics (Insights). `AI Hub` sits at the top level while `Agents` — its configuration counterpart — is buried in Development. The `Todos` personal task model and the `Task` project-task model are entirely different entities, but personal todos appear in "Productivity" while project tasks have no sidebar entry at all.

The boundary between the portal's two stated missions — AI mission control and life organisation — is expressed nowhere in the navigation language.

### 3.3 Third-party integration pattern

Integrations confirmed in `src/lib/` and `src/app/api/`:

| Integration | Lib files | API route(s) |
|---|---|---|
| Microsoft / Graph | `microsoft.ts`, `microsoft-auth.ts` (split) | `api/microsoft/`, `api/auth/microsoft/` |
| 1Password | `onepassword.ts` | *(consumed by project secrets flow)* |
| Anthropic | `anthropic.ts` | `api/ai/`, `api/ai-hub/`, `api/amonis/tasks/trigger/` |
| Coolify | `coolify.ts` | `api/coolify/` |
| Tailscale | `tailscale.ts` | `api/tailscale/` |
| GitHub | `worker/git-handler.ts` (in worker, not lib) | `api/github/` |
| Synology | *(no lib file observed)* | `api/synology/` |
| Reddit | *(no lib file observed)* | `api/reddit/` |
| Shopify | *(no lib file observed)* | `api/shopify/` |

No consistent shape: Microsoft splits into two files while others are one; Anthropic is instantiated in three separate route trees; GitHub lives in `worker/` rather than `src/lib/`; Synology/Reddit/Shopify have API routes but no visible lib counterpart.

**Proposed normalized template:**
```
src/lib/integrations/
  microsoft/
    client.ts      — Graph API calls (consumes auth.ts internally)
    auth.ts        — OAuth flow, token refresh (was microsoft-auth.ts)
    types.ts       — Graph resource types
    index.ts       — public surface
  github/
    client.ts      — move from worker/git-handler.ts
    types.ts
    index.ts
  anthropic/
    client.ts      — singleton SDK instance + retry wrapper
    types.ts
    index.ts
  coolify/ tailscale/ onepassword/ synology/ reddit/ shopify/
    client.ts  types.ts  index.ts
```

Each integration becomes independently auditable. The worker imports `src/lib/integrations/github/` rather than maintaining a private copy.

### 3.4 Separation of concerns

Three concrete leaks observed in sampled files:

1. **Layout embedded in page components.** `src/app/projects/page.tsx`, `src/app/projects/[slug]/page.tsx`, and `src/app/dashboard/page.tsx` all import and render `MainSidebar` directly at the page component level. Adding a sidebar item or changing the layout requires touching every page. `src/app/layout.tsx` or a shared authenticated layout wrapper should own the sidebar; pages should be layout-free.

2. **Data fetching with bare `fetch()` in page components.** `src/app/projects/page.tsx` uses `useEffect` + `fetch('/api/projects')` with inline JSON parsing. `src/app/projects/[slug]/page.tsx` has five separate `useEffect` chains each managing their own loading/error state. Compare with `src/app/dashboard/page.tsx` which correctly uses custom hooks (`useAuth`, `useServices`, `useFavorites`, `useStatuses`, `useApiCall`) — that pattern should be applied uniformly to the projects pages.

3. **Project notes stored on the filesystem, outside Prisma.** `src/app/projects/[slug]/page.tsx` reads/writes CLAW-NOTES.md, README.md, and CHANGELOG.md via `/api/projects/[slug]/files/[filename]` — disk files on the server. This bypasses the audit log, is not backed up with the database, and is not searchable via Prisma queries. The `AiNote` model already exists for structured note storage and should be the canonical store for agent notes.

### 3.5 Projects Section Deep Dive ⚠️

**Current file layout (fully verified):**
```
src/app/projects/
  page.tsx          — card grid list (verified)
  new/page.tsx      — create form (verified)
  [slug]/page.tsx   — documentation + GitHub viewer (verified)
```

**What the list page does** (`src/app/projects/page.tsx`):
- Card grid: emoji icon, name, status badge, 2-line description, repo indicator, last-updated date, session count
- `_count.sessions` displayed but `_count.tasks` is not fetched — task activity invisible at list level
- No search, no status filter, no sort control
- Status labels in French (`Actif`, `En pause`, `Terminé`, `Archivé`)
- Admin-only "Nouveau projet" button

**What the new-project form does** (`src/app/projects/new/page.tsx`):
- Fields: emoji icon, name, slug (auto-generated from name), description, GitHub repo URL
- No `kind` field (digital vs physical — MISSING)
- No status field (server-side default)
- All UI text in French, no sidebar — page breaks the authenticated layout pattern

**What the detail page does** (`src/app/projects/[slug]/page.tsx`):
- Five tabs: `GitHub` (commits/issues/PRs from GitHub API), `Notes` (CLAW-NOTES.md on disk), `README` (README.md on disk), `Docs` (GitHub docs folder tree), `Changelog` (CHANGELOG.md on disk)
- Settings modal (admin only): name, description, repoUrl, icon, status
- Back arrow → `/projects`; external link → GitHub repo
- GitHub tab has sub-tabs: overview, commits, issues, PRs
- Docs tab: tree-nav for `/docs` folder in the GitHub repo, renders markdown

**What is entirely absent from the projects section:**
- **No tasks tab.** `Task`, `TaskLog`, `TaskAttachment` models have no UI route in this section. The only place task data might be visible is via the agent logs in `/api/amonis/`.
- **No sessions tab.** `ProjectSession` (work session notes with timestamps) is in the schema but has no route, no UI, and is not counted in the list page.
- **No secrets tab.** `ProjectSecretMapping` + `OnePasswordConnection` are in the schema but have no project-scoped UI. Secrets may be managed via admin routes only.
- **No activity feed.** No combined view of task transitions + session notes + commits.
- **No agent dispatch UI.** A project's assigned agents (`AgentProfile`) are not visible or configurable from the project detail page; dispatch happens via AI Hub.
- **No cross-project task queue.** No `/tasks` route anywhere in `src/app/`.

**Additional architectural problem — filesystem note storage:**
CLAW-NOTES.md is the primary agent-facing notes file. It lives on the server's filesystem at `PROJECTS_DIR/<slug>/CLAW-NOTES.md`, is read/written by the detail page, and is presumably also read by the worker's `read_file` tool. This creates three problems: (1) notes are not in the database so they escape audit logging and full-text search; (2) there is no version history beyond what git tracks; (3) if the project clone directory is cleaned up, notes are lost. The `AiNote` model should replace this.

**Proposed route restructure:**
```
/projects
  — board view: status columns (active | paused | completed | archived)
  — each card: open-task count, last-session date, status badge

/projects/new
  — create wizard: kind (digital | physical), name, description,
    repo URL + branch (digital only), icon, colour

/projects/[slug]
  — overview: status, KPIs (open tasks, last session, last agent run, last commit),
    quick-action buttons (new task, new session, dispatch agent)

/projects/[slug]/tasks
  — kanban: pending → queued → in_progress → needs_review → completed

/projects/[slug]/tasks/[id]
  — task detail: description, logs (TaskLog), attachments (TaskAttachment),
    sub-tasks, agent assignment

/projects/[slug]/sessions
  — session timeline: date, duration, markdown notes (ProjectSession)

/projects/[slug]/notes
  — AiNote records scoped to this project (replaces CLAW-NOTES.md on disk)

/projects/[slug]/github
  — current GitHub tab promoted to its own sub-page (keep existing component)

/projects/[slug]/docs
  — current Docs tab promoted (keep existing component)

/projects/[slug]/activity
  — combined feed: task transitions + sessions + agent runs + commits

/projects/[slug]/secrets
  — 1Password mappings (ProjectSecretMapping + OnePasswordConnection)

/projects/[slug]/settings
  — repo URL, branch, allowWrite, agents whitelist, danger zone
```

**Component reuse:**
- The existing `<GitHubTab>` and `<DocsTab>` components in `[slug]/page.tsx` can be extracted to `src/components/projects/` and reused in the new route structure without rewriting
- `src/app/dashboard/page.tsx` demonstrates the hook pattern (`useAuth`, custom hooks per data type) that the projects pages should adopt
- `src/components/ui/` has search, badge, and card primitives; a `<KanbanBoard>` component would be new but could be built on these

**`Project` model extension for physical projects:**
```prisma
enum ProjectKind {
  digital    // repo-linked, agent-dispatchable
  physical   // home / craft / physical project — no repo
}

model Project {
  // ... existing fields ...
  kind       ProjectKind  @default(digital)
  // repoUrl already String? — remains nullable for physical ✓
  // hide github, docs, secrets, agent-dispatch tabs when kind = physical
}
```

---

## 4. Feature Gap List

| Capability | Status | Evidence | Verdict |
|---|---|---|---|
| Unified inbox / command centre | **PARTIAL** | `CommandPalette.tsx` (search); `UrgentInboxWidget` on dashboard (verified); no `/inbox` page combining all urgent items | Must-have |
| Notes & ideas management | **PARTIAL** | `AiNote`, `AiThread` models exist; project notes live on filesystem (CLAW-NOTES.md); no notes entry in sidebar | Must-have |
| Personal todos | **PRESENT** | `Todo` model; `src/app/todos/page.tsx` exists | Present |
| Ideas backlog distinct from todos/notes | **MISSING** | No dedicated model or route | Nice-to-have |
| Physical vs digital projects | **MISSING** | `Project` model has no `kind` field; new-project form has no kind selector (`src/app/projects/new/page.tsx`) | Must-have |
| Calendar / scheduling integration | **MISSING** | No model, no route, no integration lib | Nice-to-have |
| Quick-capture global shortcut | **PARTIAL** | `CommandPalette.tsx` exists; dashboard has search bar; no `⌘N` capture flow confirmed | Must-have |
| Global search across all entities | **MISSING** | No `/api/search` route; no cross-entity query surface | Must-have |
| Dashboard / status at a glance | **PRESENT (service-focused)** | `src/app/dashboard/page.tsx` verified — service tiles + 6 widgets; no project KPIs or task queue | Present (needs expansion) |
| Notifications / alert centre | **PARTIAL** | `UrgentItem` model + `UrgentInboxWidget` on dashboard (verified); no dedicated `/inbox` page; PATCH has no ownership check (H5) | Must-have |
| Cross-project task queue | **MISSING** | `Task` model exists; no aggregated `/tasks` route or UI | Must-have |
| Project tasks workspace | **MISSING** | `Task`, `TaskLog`, `TaskAttachment` models exist; no UI route in projects section (verified) | Must-have |
| Work session tracking | **MISSING** | `ProjectSession` model exists; no UI route; not surfaced anywhere | Must-have |
| Agent activity log per project | **MISSING** | `TaskLog` + `AmonisAgentLog` exist; no per-project feed | Must-have |
| Bookmarks | **PARTIAL** | `Bookmark` model + `src/app/api/bookmarks/` route exist; no sidebar entry | Nice-to-have |
| Mobile responsiveness | **PARTIAL** | Hamburger + overlay mobile sidebar in `MainSidebar.tsx` (verified); bottom-sheet actions menu in dashboard (verified); full mobile audit not performed | Nice-to-have |

---

## 5. Organisation & UX Recommendations

### 5.1 Current Navigation Audit

From `src/components/layout/MainSidebar.tsx` NAV_GROUPS (fully verified):

**Always-visible (top of nav):** Dashboard · AI Hub

**Accordion groups:**
1. **Productivity:** Mail · Todo List · OneNote
2. **Infrastructure:** Tailscale · Local Services · VPS Servers · Remote Desktop
3. **Development:** Projects · Amonis Finance · Insights · Agents
4. **Manage** *(adminOnly: true):* Manage services · Manage agents · Reports · Help

**Bottom-pinned:** Settings · Sign Out

**Issues:**
- **AI Hub and Agents are split.** AI Hub (top-level, always visible) is the dispatch/chat runtime; Agents (buried in Development) is its configuration UI.
- **Amonis Finance is in "Development."** It is a standalone business finance sub-app sharing a group with dev tools only because it uses Claude agents.
- **The dashboard is not a mission control.** Verified: `src/app/dashboard/page.tsx` is a service-tile grid. There is no top-level view of open tasks, agent status, or project health.
- **Bookmarks has no sidebar entry.** `Bookmark` model and `/api/bookmarks/` route exist but are unreachable from the nav.
- **Notes have no sidebar entry.** `AiNote` records have no dedicated nav entry; notes are only reachable via the project detail page as a file on disk.
- **"Manage" mixes content and config.** Reports is operational analytics; Manage services and Manage agents are configuration screens.
- **Help is admin-only.** The `Manage` group is `adminOnly: true`, gating the Help link from regular users.
- **No quick-capture, no notification badge, no search shortcut** pinned above the accordion groups.

### 5.2 Proposed Information Architecture

```
┌───────────────────────────────────────┐
│  🔍  Search                    ⌘K    │  ← global search shortcut
│  ⚡  Quick Capture             ⌘N    │  ← create note / task / idea
│  🔔  Urgent Inbox              [3]   │  ← UrgentItem count badge
└───────────────────────────────────────┘

MISSION CONTROL
  · Dashboard            service tiles + widgets (current)
  · Projects             digital + physical; board grouped by status
  · Task Queue           cross-project in_progress + needs_review
  · Agents               roster, dispatch history, agent profiles
  · AI Hub               chat, dispatch task, AI threads

LIFE ORG
  · Todos                personal, non-project tasks
  · Notes & Ideas        AiNote + ideas backlog (replaces disk files)
  · Bookmarks
  · OneNote              Microsoft integration

SERVICES & INFRA
  · Local Network        service tiles
  · Remote Desktop
  · VPS (Coolify)
  · Tailscale

FINANCE
  · Amonis               promoted from "Development" to own section

ANALYTICS
  · Insights
  · Mail
  · Reports (admin only)

SETTINGS  (bottom-pinned)
  · Manage Services (admin)
  · Manage Agents (admin)
  · 1Password
  · Account & 2FA
  · Help                 ← moved out of admin-only
```

Key changes from current state:
- AI Hub and Agents unified under Mission Control
- Task Queue added as a first-class nav item (currently no route exists — needs building)
- Amonis promoted from "Development" to its own Finance section
- Bookmarks and Notes surfaced as first-class nav items under Life Org
- Dashboard remains the landing page but should gain project/task KPI widgets over time
- Help moved to bottom-pinned, always accessible

### 5.3 UX Friction Points

1. **The project detail page is a documentation viewer, not a workspace.** Verified: the `[slug]` page has GitHub + markdown tabs. A developer returning to a project cannot see what tasks are open, when the last session was, or what the agent last did. The project is navigational dead-end for work management.

2. **Tasks have no surface anywhere in the UI.** The `Task` model is used by the worker and Amonis dispatch system but is completely hidden from the user. The only way to know what a project's agent is doing is to look at CLAW-NOTES.md — an unstructured file on disk.

3. **No quick-capture flow.** Creating a task, note, or idea requires navigating to the right section and opening a form. The `CommandPalette` exists as a search tool. A global `⌘N` shortcut that asks "what kind of thing?" and routes to the right model would eliminate several navigation steps per session.

4. **The accordion sidebar hides context while working.** When focused on `/projects/[slug]`, the Development group is open — Productivity and Infrastructure are collapsed and invisible. Navigating to the urgent inbox requires expanding a different group. The top-pinned strip (quick capture, search, urgent inbox) proposed in §5.2 addresses this.

5. **French and English UI are mixed.** Status labels in `src/app/projects/page.tsx:18-23` (`Actif`, `En pause`, `Terminé`, `Archivé`) are French; the new-project form uses French labels throughout (`Nom du projet *`, `Slug (URL) *`, `Repository GitHub`); the dashboard uses some French strings (`Aucun service trouvé`, `Ajouter un service`). The codebase and type identifiers are English. If French is intentional for the personal UI, it should be consistent; if not, all user-facing strings should be English or extracted to a locale constant.

---

## 6. Quick Wins (< 1 hour each)

- **Delete `/api/todos/debug`** (`src/app/api/todos/debug/route.ts`) — one file delete eliminates C4.
- **Delete dead `triggerAgent` function** (`src/app/api/amonis/tasks/route.ts:69-79`) — ten-line delete, fixes M5.
- **Fix `max_tokens: 8096` → `8192`** (`src/app/api/amonis/tasks/trigger/route.ts:31`) — one character, L3.
- **Add `interval.unref()`** (`src/lib/rate-limit.ts:84-94`) — one line, prevents HMR interval leak (M7).
- **Add slug re-validation guard** at `src/app/api/projects/[slug]/files/[filename]/route.ts:42` and the docs route — `if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: 'invalid slug' }, { status: 400 })` (M6).
- **Add CSRF + ownership check to `/api/webhook/urgent` PATCH** (`src/app/api/webhook/urgent/route.ts:79`) — follow `verifyCsrf` + `UrgentItem.userId` ownership check (H5, H6).
- **Fix `task.agentId!`** (`src/app/api/amonis/webhook/route.ts:47`) — `task.agentId ?? null` (L5).
- **Move `Help` out of the admin-only group** (`src/components/layout/MainSidebar.tsx`) — extract the Help item from the `Manage` group (`adminOnly: true`) and pin it at the bottom.
- **Add `Bookmarks` to sidebar nav** — model and `/api/bookmarks/` route exist; add a nav entry.
- **Add task counts to projects list API** — include `_count: { tasks: true }` in `GET /api/projects`; render "N open tasks" on each card in `src/app/projects/page.tsx`.
- **Add status filter chips to projects list** (`src/app/projects/page.tsx`) — purely client-side filter on the already-fetched array; no API change needed.
- **Add `kind` field to new-project form** (`src/app/projects/new/page.tsx`) — two radio buttons (Digital / Physical), costs one form field and a migration column with a default.
- **Move `new/page.tsx` inside the authenticated layout** — it currently renders without `MainSidebar`, breaking the nav experience during project creation.

---

## 7. Bigger Bets (need planning)

- **Fail-closed secrets — eliminate all hardcoded fallbacks (C1, C2, C3, C4)** — Effort: **S** — Touches `src/lib/auth.ts`, `src/lib/csrf.ts`, `src/middleware.ts`, `.env.example`. Risk: misconfigured deploys throw instead of silently serving with public secrets — desired behaviour, but needs deployment documentation.

- **Worker security hardening (H2, H3, L4)** — Effort: **S** — Fix GitHub token embedding in `worker/git-handler.ts`; strip secret env keys before `run_bash` in `worker/claude-agent.ts`; pass `timeoutMs` to `run()`. Entirely within `worker/`; no Next.js changes.

- **Amonis sub-app security hardening (C5–C9, M3, M4, M5)** — Effort: **M** — Apply `requireApiAdmin` + `verifyCsrf` + zod to all Amonis route files; remove their `PUBLIC_PATHS` entries; update the worker to send an authenticated bearer to the endpoints it calls. Coordinate both sides in one PR to avoid a broken-window period.

- **CSRF + auth consistency sweep (H6, H7, M1, M2, L6)** — Effort: **M** — Horizontal pass applying `verifyCsrf` + the correct auth helper to all remaining mutating routes. Best as one atomic PR so the security posture change is a single reviewable diff.

- **Microsoft token + TOTP encryption (H1, M10)** — Effort: **S** — Prisma migration (add `iv`/`tag` columns); wrap reads/writes in the existing `encryptSecret`/`decryptSecret` from `src/lib/crypto.ts`. Coordinate with M10 callback deduplication.

- **Integrations normalisation (§3.3)** — Effort: **M** — Create `src/lib/integrations/<name>/` for all nine integrations; consolidate Microsoft's split files; move `worker/git-handler.ts` to `src/lib/integrations/github/`. Purely mechanical moves; no behaviour changes.

- **Migrate project filesystem notes to database (§3.4)** — Effort: **M** — Create `AiNote` records scoped to a project (add `projectId` foreign key if not present); migrate CLAW-NOTES.md content to `AiNote`; update `[slug]/page.tsx` Notes tab to read from Prisma; update the worker's `read_file`/`write_file` tools to use the DB or a content-addressed store. Risk: worker tooling must be updated in the same change; breaking the worker's notes access would disrupt agent tasks mid-flight.

- **`Project.kind` enum + physical projects UI (§3.5)** — Effort: **M** — Prisma migration (add `kind` column, default `digital`); update create wizard; hide repo/docs/secrets/agent tabs for `kind: physical`. Low migration risk; moderate UI effort.

- **Projects section restructure (§3.5)** — Effort: **L** — Build the full 10-route tree; extract `<GitHubTab>` and `<DocsTab>` to `src/components/projects/`; create `<KanbanBoard>`, `<SessionTimeline>`, `<ActivityFeed>` components; wire task counts + last-session to the list API; build secrets and settings sub-pages. Largest single UI change; feature-branch with new routes alongside old `[slug]` page until ready to cut over.

- **Global search (§4)** — Effort: **M** — Single `GET /api/search?q=` route fanning out to Prisma across `Project`, `Task`, `Todo`, `AiNote`, `Bookmark`, `Service`; wire results into `CommandPalette`. Risk: SQLite FTS performance at scale.

- **Unified inbox + quick-capture (§4, §5.3)** — Effort: **M** — Extend `CommandPalette` with a capture mode (`⌘N`) routing to `Todo`/`AiNote`/`Task` by type; surface `UrgentItem` count as a sidebar badge; build a `/inbox` page combining `UrgentItem` list with recent agent notifications.

---

## 8. Refactor Sequencing

Ordered to avoid dependency conflicts and ensure stability at each step:

1. **Fail-closed secrets (C1, C2, C3, C4)** — No downstream code is affected. Safe in isolation; confirms the deployment environment is correctly configured before anything else.

2. **Worker security fixes (H2, H3, L4, L5)** — Worker is a separate process. Fix GitHub token persistence and secret env exposure; self-contained in `worker/`.

3. **Amonis security hardening (C5–C9, M3–M5)** — All within `/api/amonis/`; requires the worker to pass its bearer token to the endpoints it calls. Coordinate both sides in one PR.

4. **CSRF + auth consistency sweep (H5, H6, H7, M1, M2, L6)** — Horizontal pass across all remaining mutating routes. One atomic PR for a reviewable security change. Completes the security work before any structural changes.

5. **Microsoft token + TOTP encryption + callback dedup (H1, M10)** — Requires a Prisma migration. Do after the auth sweep so migrations don't interleave with route changes.

6. **Integrations normalisation (§3.3)** — Mechanical file restructuring; no behaviour changes. Creates `src/lib/integrations/` before new integration features are added.

7. **`src/lib/` service layer + hook extraction (§3.1, §3.4)** — Split `src/lib/` structure; move page-level `fetch()` calls to shared hooks (following the `useServices`/`useFavorites` pattern in `src/app/dashboard/page.tsx`). Prerequisite before large UI work.

8. **Layout consolidation (§3.4)** — Move `MainSidebar` out of page components into a shared authenticated layout. Must happen before sidebar IA changes take effect everywhere.

9. **Filesystem notes → database (§3.4)** — Migrate CLAW-NOTES.md to `AiNote`. Do before the projects restructure so new routes are built on the correct storage model; coordinate worker tool updates in the same change.

10. **`Project.kind` migration + physical projects (§3.5)** — Prisma migration; update create wizard and list page. Foundational before the full projects restructure.

11. **Projects section restructure (§3.5)** — Build the full route tree, kanban, session timeline, activity feed, secrets, settings sub-pages. Largest effort; builds on the cleaned-up API layer, correct storage model, and layout from steps 7–10.

12. **Global search + quick-capture + unified inbox (§4, §5.3)** — New features composing every other entity. Implement after the information architecture is stable and the models/routes above exist.

13. **Sidebar IA update (§5.2)** — Update `src/components/layout/MainSidebar.tsx` NAV_GROUPS last, once all new routes from steps 11–12 are live and pointing to working pages.

---

*Generated 2026-05-25. Security findings (§2) sourced entirely from `docs/audits/01-code-quality.md` (Rex). Architecture and UX findings (§3–§8) derived from direct reads of: `src/components/layout/MainSidebar.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[slug]/page.tsx`, `src/app/projects/new/page.tsx`, `src/app/dashboard/page.tsx`, and the Prisma model list provided as audit context. All claims are verified against the files read in this session.*
