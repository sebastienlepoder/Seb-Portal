# Architecture Audit: Core Module Structure & Integrations — Area 2

**Auditor:** Archer (read-only architecture review)
**Date:** 2026-05-27
**Branch:** current working tree
**Scope:** `src/lib/`, `src/server/`, integration patterns, service-layer adoption, `src/app/admin/` vs `src/app/manage/`

---

## 1. Summary

- **`src/lib/` is a flat 30-file grab-bag** mixing pure utilities, auth primitives, DB/business-logic, HTTP clients, and sub-domains (`schedule/`, `mcp/`, `security/`, `skills/`). Already-present sub-dirs prove the need but they are not used consistently.
- **The `src/server/` vs `src/lib/` boundary is undefined**: `src/lib/mcp/` and `src/server/mcp/` both exist; `src/server/vpnChecker.ts` and `src/server/statusChecker/` duplicate responsibilities that belong in `src/lib/`.
- **Three integrations (Synology, Shopify, Reddit) have no `src/lib/` client** — all HTTP calls live inline in their route files, making the pattern inconsistent across 9 integrations.
- **`src/lib/agent-dispatch.ts` is a clean service-layer exemplar**, but at least 4 routes call Prisma and SDKs inline, duplicating validation and business logic.
- **`src/app/manage/` contains a single orphaned page** (`help`) while `src/app/admin/` holds 7 substantive admin pages — the split is confusing and serves no architectural purpose.

---

## 2. `src/lib/` Reorganization

### 2.1 Current file inventory & categorization

| File | Category | Notes |
|---|---|---|
| `utils.ts` | (a) pure utility | `cn()`, `formatRelativeTime()`, `priorityColor()` — no I/O |
| `crypto.ts` | (a) pure utility | encrypt/decrypt wrappers |
| `rate-limit.ts` | (a) pure utility | in-memory sliding window |
| `csrf.ts` | (a) pure utility | HMAC token generation/verification |
| `password.ts` | (a) pure utility | bcrypt helpers |
| `event-bus.ts` | (a) pure utility | Node `EventEmitter` singleton |
| `auth.ts` | (b) auth primitive | `getSession`, `requireApiAuth`, `getSessionUser` — iron-session |
| `microsoft-auth.ts` | (b) auth primitive | `getMicrosoftToken()` + auto-refresh via Prisma (`microsoft-auth.ts:8`) |
| `db.ts` | (c) DB/business-logic | Prisma client singleton |
| `activity.ts` | (c) DB/business-logic | `writeActivity()` writes Prisma rows + broadcasts (`activity.ts:14`) |
| `audit.ts` | (c) DB/business-logic | `auditLog()` wraps `writeActivity` + Prisma (`audit.ts:2`) |
| `agents.ts` | (c) DB/business-logic | DTO mappers for Prisma `AgentProfile`/`Task` models (`agents.ts:29`) |
| `agent-dispatch.ts` | (c) DB/business-logic | Task creation service layer (`agent-dispatch.ts:51`) |
| `config.ts` | (c) DB/business-logic | YAML→DB sync (`config.ts:14`) |
| `bootstrap.ts` | (c) DB/business-logic | Admin-seed + config sync on startup (`bootstrap.ts:7`) |
| `schedule/cron.ts` | (c) DB/business-logic | Cron expression evaluator |
| `schedule/dispatch.ts` | (c) DB/business-logic | Schedule→task dispatcher |
| `schedule/runner.ts` | (c) DB/business-logic | Runner loop |
| `schedule/parse.ts` | (c) DB/business-logic | CRON parse helpers |
| `skills/registry.ts` | (c) DB/business-logic | Skill file→DB sync (`skills/registry.ts:17`) |
| `mcp/trust.ts` | (c) DB/business-logic | MCP call-log stats + trust score (`mcp/trust.ts:21`) |
| `mcp/audit.ts` | (c) DB/business-logic | MCP audit log writer |
| `anthropic.ts` | (d) integration HTTP client | SDK factory + model constants (`anthropic.ts:11`) |
| `microsoft.ts` | (d) integration HTTP client | Graph OAuth + REST helpers (`microsoft.ts:23`) |
| `github.ts` | (d) integration HTTP client | GitHub REST helpers (`github.ts:32`) |
| `tailscale.ts` | (d) integration HTTP client | Multi-mode Tailscale client (`tailscale.ts:25`) |
| `coolify.ts` | (d) integration HTTP client | Coolify REST client (`coolify.ts:8`) |
| `onepassword.ts` | (d) integration HTTP client | 1Password Connect client with Prisma for config (`onepassword.ts:26`) |
| `security/injection-guard.ts` | (a) pure utility | Injection rule definitions |
| `security/scan.ts` | (a) pure utility | Text scanner |
| `security/secret-scanner.ts` | (a) pure utility | Secret pattern matcher |

### 2.2 Proposed sub-directory layout

```
src/lib/
├── utils/
│   ├── cn.ts              ← cn(), clsx helpers          (from utils.ts)
│   ├── time.ts            ← formatRelativeTime()        (from utils.ts)
│   ├── priority.ts        ← priorityColor()             (from utils.ts)
│   └── index.ts           ← re-export barrel
├── security/              ← already exists; keep as-is
│   ├── injection-guard.ts
│   ├── scan.ts
│   └── secret-scanner.ts
├── auth/
│   ├── session.ts         ← getSession, getSessionUser, requireApiAuth  (from auth.ts)
│   ├── csrf.ts            ← HMAC helpers                (from csrf.ts)
│   ├── password.ts        ← bcrypt helpers              (from password.ts)
│   └── index.ts
├── crypto.ts              ← stays top-level (used by many)
├── rate-limit.ts          ← stays top-level
├── event-bus.ts           ← stays top-level
├── db.ts                  ← stays top-level (Prisma singleton)
├── domain/
│   ├── activity.ts        ← writeActivity               (from activity.ts)
│   ├── audit.ts           ← auditLog                    (from audit.ts)
│   ├── agents.ts          ← DTO mappers                 (from agents.ts)
│   └── config.ts          ← YAML/DB sync                (from config.ts)
├── bootstrap.ts           ← stays top-level (startup only)
├── schedule/              ← already exists; keep as-is
│   ├── cron.ts
│   ├── dispatch.ts
│   ├── runner.ts
│   └── parse.ts
├── skills/                ← already exists; keep as-is
│   └── registry.ts
├── mcp/                   ← already exists; keep as-is
│   ├── trust.ts
│   └── audit.ts
└── integrations/          ← new sub-dir (see Section 4)
    ├── anthropic/
    ├── microsoft/
    ├── github/
    ├── tailscale/
    ├── coolify/
    ├── onepassword/
    ├── synology/
    ├── shopify/
    └── reddit/
```

**Migration note:** `utils.ts` currently exports 3 unrelated helpers; they can be split lazily — split only when a new call-site is added to avoid churn. All current imports (`@/lib/utils`) still resolve if the directory export re-exports them via `index.ts`.

---

## 3. `src/server/` vs `src/lib/` Boundary

### 3.1 Current contents of `src/server/`

| Path | What it does |
|---|---|
| `statusChecker/index.ts` | In-memory TTL cache + HTTP health-check; reads Prisma (`statusChecker/index.ts:7`) |
| `vpnChecker.ts` | In-memory cache + VPN probe; **no Prisma**, pure logic (`vpnChecker.ts:12`) |
| `iconProviders/cloudApiProvider.ts` | Fetches icon from external CDN |
| `iconProviders/fallbackProvider.ts` | Emoji/SVG fallback generator |
| `iconProviders/aiIconProvider.ts` | Calls Anthropic to generate SVG icons |
| `mcp/portal-tools.ts` | MCP tool implementations (portal CRUD) |
| `mcp/github-tools.ts` | MCP tool implementations (GitHub) |
| `mcp/memory-tools.ts` | MCP tool implementations (memory/notes) |
| `mcp/registry.ts` | Tool registry: maps name→handler (`registry.ts:9`) |

### 3.2 The problem

There is no documented rule separating `src/server/` from `src/lib/`. In practice `src/lib/mcp/` and `src/server/mcp/` coexist:

- `src/lib/mcp/trust.ts` — DB analytics (business logic)
- `src/lib/mcp/audit.ts` — DB writes (business logic)
- `src/server/mcp/registry.ts` — runtime tool dispatch (request handling)

`src/server/vpnChecker.ts` has no Prisma dependency and could live in `src/lib/` without change.

### 3.3 Recommended boundary rule

> **`src/lib/`** — Framework-agnostic modules: pure functions, Prisma queries, HTTP client wrappers, DTO mappers. No dependency on `next/server`, `next/headers`, or `react`.
>
> **`src/server/`** — Next.js server-runtime modules that orchestrate multiple lib modules or require Node.js server context (e.g., provider strategy patterns, in-memory caches shared across requests, MCP tool dispatch). These may import from `src/lib/` but never the reverse.

**Concrete moves implied by this rule:**

| File | Direction | Reason |
|---|---|---|
| `src/server/vpnChecker.ts` | → `src/lib/` | No Next.js deps, pure logic |
| `src/server/statusChecker/index.ts` | stays | Holds request-scoped cache; multi-lib orchestration |
| `src/server/mcp/` | stays | Runtime dispatch layer |
| `src/lib/mcp/trust.ts`, `src/lib/mcp/audit.ts` | stays | Pure DB helpers consumed by `src/server/mcp/` |

---

## 4. Integration Pattern Normalization

### 4.1 Current state

| Integration | Lib file(s) | API route prefix(es) | Issues |
|---|---|---|---|
| Microsoft | `microsoft.ts` + `microsoft-auth.ts` | `/api/microsoft/*`, `/api/auth/microsoft/*` | Split across two files; no shared `types.ts`; auth concerns mixed in `microsoft-auth.ts` which also calls Prisma |
| GitHub | `github.ts` | `/api/github/*` | Worker-side git ops live in `worker/git-handler.ts` (outside `src/`), severing the logical unit |
| Anthropic | `anthropic.ts` | used inline across routes | Clean factory+constants; no client-side type file |
| Tailscale | `tailscale.ts` | `/api/tailscale/` | Reasonable; multi-mode logic is complex but self-contained |
| Coolify | `coolify.ts` | `/api/coolify/` | Clean; types exported from same file |
| 1Password | `onepassword.ts` | `/api/onepassword/*` | Prisma config fetch coupled with HTTP client (`onepassword.ts:1-2`); should be split |
| Synology | *(none)* | `/api/synology/` | All HTTP calls inline in route (`synology/route.ts:38-80`) |
| Shopify | *(none)* | `/api/shopify/` | All HTTP calls inline in route (`shopify/route.ts:37-90`) |
| Reddit | *(none)* | `/api/reddit/` | All HTTP calls inline in route (`reddit/route.ts:1-120`) |

### 4.2 Normalized template

Each integration should follow this 4-file structure under `src/lib/integrations/<name>/`:

```
src/lib/integrations/<name>/
├── types.ts     ← TypeScript interfaces for API request/response shapes
├── client.ts    ← Pure HTTP client; reads from process.env; no Prisma
├── auth.ts      ← Token management (if OAuth); may import Prisma
└── index.ts     ← Barrel: re-exports public surface; hides internals
```

**Migration priority (by blast radius):**

1. **Microsoft** (`microsoft.ts` → `integrations/microsoft/client.ts`, `microsoft-auth.ts` → `integrations/microsoft/auth.ts`) — already two files; moving is a rename + barrel.
2. **Synology / Shopify / Reddit** — extract inline route logic into `client.ts`; route shrinks to auth-check + `client.method()` + JSON response.
3. **1Password** — split Prisma config fetch into `auth.ts`; keep pure HTTP in `client.ts`.
4. **GitHub** — `github.ts` → `integrations/github/client.ts`; `worker/git-handler.ts` stays in `worker/` (it's a worker concern, not a portal lib concern) but add a note in `integrations/github/index.ts`.

---

## 5. Service-Layer Adoption Gaps

`src/lib/agent-dispatch.ts` is the gold-standard service layer: typed `DispatchInput`/`DispatchResult`, a domain `DispatchError`, no HTTP primitives, no `NextResponse` references (`agent-dispatch.ts:11-47`).

The following routes do **not** follow this pattern:

### 5.1 `src/app/api/amonis/tasks/trigger/route.ts` (lines 7–162)

- **Problem:** The entire `runClaudeAgent` function (lines 7–102) lives inside the route file: it streams the Anthropic API, writes `AmonisAgentLog` rows, and flips `AmonisTask` + `AmonisAgent` statuses — all Prisma calls in an HTTP handler.
- **Fix:** Extract to `src/lib/services/amonis.ts::runClaudeAgentTask(taskId)`. The route handler becomes `≤20 lines`.

### 5.2 `src/app/api/ai/chat/route.ts` (lines 300–500+)

- **Problem:** The `executeTool()` function (line 301) calls `prisma.project.findMany`, `prisma.agentProfile.findMany`, and `dispatchTask` directly inside the route. The `list_projects` and `list_agents` tool implementations are inline closures (`route.ts:307`, `route.ts:323`).
- **Fix:** `list_projects` and `list_agents` queries belong in `src/lib/services/portal.ts` as `listActiveProjects()` / `listActiveAgents()` — they're already called by `src/server/mcp/portal-tools.ts` equivalents, so a shared service would eliminate the duplication.

### 5.3 `src/app/api/projects/route.ts` (lines 1–89)

- **Problem:** GET and POST handlers call `prisma.project.findMany` and `prisma.project.create` inline with no validation layer. The role check (`user.role?.toLowerCase() !== 'admin'`) is duplicated across multiple admin routes rather than being asserted once in a service.
- **Fix:** Extract to `src/lib/services/projects.ts::listProjects()` and `createProject(input)`. The service owns Prisma + slug validation; the route owns auth + serialization.

### 5.4 `src/app/api/amonis/tasks/route.ts` (inline Prisma)

- **Problem:** Likely repeats the same `prisma.amonisTask.findMany / create` pattern (consistent with trigger route). These belong alongside `runClaudeAgentTask` in `src/lib/services/amonis.ts`.

### 5.5 `src/server/mcp/registry.ts` (lines 9+)

- **Problem:** The registry handler for MCP tools calls `prisma.project.findMany` and `prisma.agentProfile.findMany` directly (mirrors `ai/chat/route.ts:307,323`) — the same queries in two places, with no shared abstraction.
- **Fix:** Both sites should call `src/lib/services/portal.ts::listActiveProjects()`.

### 5.6 Recommended service shape

```typescript
// src/lib/services/<domain>.ts
// ── Inputs are plain objects; output is typed; errors are domain errors ──

export interface CreateProjectInput { name: string; slug: string; /* ... */ }
export interface ProjectSummary { id: string; name: string; /* ... */ }
export class ProjectError extends Error { constructor(public code: 'SLUG_TAKEN' | 'NOT_FOUND', msg: string) { super(msg); } }

export async function listProjects(): Promise<ProjectSummary[]> { /* prisma only */ }
export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> { /* prisma + validation */ }
```

Routes import from `src/lib/services/*`, never from `@prisma/client` directly.

---

## 6. `src/app/admin/` vs `src/app/manage/` Reconciliation

### 6.1 Current contents

**`src/app/admin/`** (7 pages — all substantive admin UI):

| Route | Page |
|---|---|
| `/admin/agents` | Agent profile management |
| `/admin/services` | Service CRUD |
| `/admin/mcp` | MCP tool dashboard |
| `/admin/reports` | Reports viewer |
| `/admin/projects` | Project management |
| `/admin/recurring` | Recurring task schedules |
| `/admin/skills` | Skills browser |

**`src/app/manage/`** (1 page — orphaned):

| Route | Page |
|---|---|
| `/manage/help` | Help page (`manage/help/page.tsx`) |

### 6.2 Problem

`/manage/help` is a singleton in an otherwise-empty top-level directory. No other `/manage/*` routes exist or are referenced. The naming implies a future `/manage/` section that was never built.

### 6.3 Recommendation

Move `src/app/manage/help/page.tsx` → `src/app/admin/help/page.tsx`. Delete `src/app/manage/`. Add a redirect from `/manage/help` → `/admin/help` if deep links exist.

> **Canonical rule:** All staff/operator UI lives under `/admin/`. There is no `/manage/` section. If a future "tenant self-service" manage surface is needed, it should be scoped under a named feature directory (e.g., `/workspace/`), not the generic `/manage/`.

---

## 7. Ranked Recommendations

### High Impact

| # | Recommendation | Files affected |
|---|---|---|
| H1 | **Extract service layer for Amonis task execution** (`runClaudeAgent` → `src/lib/services/amonis.ts`). Removes 100+ lines of Prisma + SDK code from an HTTP route; enables testing and reuse. | `amonis/tasks/trigger/route.ts`, new `src/lib/services/amonis.ts` |
| H2 | **Create `src/lib/services/portal.ts`** with `listActiveProjects()` / `listActiveAgents()`. Eliminates duplication between `ai/chat/route.ts:307` and `src/server/mcp/registry.ts`. | `ai/chat/route.ts`, `server/mcp/registry.ts`, new `src/lib/services/portal.ts` |
| H3 | **Add `src/lib/integrations/` and migrate Synology / Shopify / Reddit clients out of route files.** Routes become thin; clients become testable. | 3 route files, 3 new `integrations/` clients |

### Medium Impact

| # | Recommendation | Files affected |
|---|---|---|
| M1 | **Consolidate Microsoft split** (`microsoft.ts` + `microsoft-auth.ts`) into `src/lib/integrations/microsoft/{client,auth,types,index}.ts`. | 2 lib files + all consumers |
| M2 | **Move `src/server/vpnChecker.ts` → `src/lib/`** to match the boundary rule. It has no Next.js deps. | `src/server/vpnChecker.ts`, `src/app/api/vpn/route.ts` import path |
| M3 | **Merge `src/app/manage/` into `src/app/admin/`**. One orphaned page is low code-change but reduces navigation confusion. | `src/app/manage/help/page.tsx` |
| M4 | **Define the `src/server/` vs `src/lib/` rule in a CONTRIBUTING.md or ADR** so future modules land in the right place by default. | Documentation only |

### Low Impact

| # | Recommendation | Files affected |
|---|---|---|
| L1 | **Split `src/lib/utils.ts`** into `utils/cn.ts`, `utils/time.ts`, `utils/priority.ts` with a barrel `utils/index.ts`. Safe at any time since barrel re-exports preserve import paths. | `src/lib/utils.ts` + ∼20 consumers |
| L2 | **Add a `types.ts`** to each existing integration lib (`github`, `tailscale`, `coolify`) to make response shapes first-class. Currently types are co-located in the client file. | 3 lib files |
| L3 | **`src/lib/onepassword.ts`**: split Prisma config fetch (auth concern) from HTTP call layer** (client concern). Matches the normalized template. | `src/lib/onepassword.ts` |
