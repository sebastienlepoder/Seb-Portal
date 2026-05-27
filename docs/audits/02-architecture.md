# Portal Architecture & Module Organization Audit — Area 2

**Auditor:** Archer (architecture review)  
**Date:** 2026-05-27  
**Branch:** `agent/987ad3f8-2026-05-27T03-12-54`  
**Scope:** `src/app/`, `src/components/`, `src/lib/`, `src/types/`, `worker/`  
**Note:** Rex's code-quality findings (01-code-quality.md) are not duplicated here. This report focuses entirely on structural/architectural concerns.

---

## Executive Summary

1. **The `Project` model carries two incompatible responsibilities** — it is simultaneously the AI agent-dispatch target and the user's personal project notebook. The dual-endpoint split (`/api/projects` vs `/api/admin/projects`) is a symptom of this unresolved tension.
2. **`src/app/projects/[slug]/page.tsx` is a 290-line God component** containing 7+ distinct sub-components, 8 independent `useEffect` chains, and a bespoke Markdown renderer — none of which are shared with any other page.
3. **Eight integrations, three different shapes.** Microsoft/GitHub/1Password have typed client modules; Coolify/Tailscale have `isXxxAvailable()` guards; Reddit has no `src/lib/` module at all (logic lives in the route handler). There is no normalized integration contract.
4. **Portal-meta and life-org features share a route tree but no structural separation.** `agents/`, `admin/`, `amonis/` are portal infrastructure; `todos/`, `mail/`, `onenote/`, `bookmarks/` are life-org tools — but nothing in the folder layout signals this distinction, and there is no shared layout, data boundary, or navigation group for either category.
5. **`src/lib/auth.ts` exports nine auth helpers**, some overlapping (e.g. `getApiUser` vs `requireApiAuth`). Route handlers mix them inconsistently, making it hard to reason about the auth model at a glance.

---

## Architecture Findings

### [HIGH] A-1: Dual-endpoint split on `Project` creates two incompatible representations of the same model

**Files:**  
- `src/app/api/projects/route.ts` (`GET/POST /api/projects`)
- `src/app/api/projects/[slug]/route.ts` (`GET/PUT/DELETE /api/projects/[slug]`)
- `src/app/api/admin/projects/route.ts` (`GET/POST /api/admin/projects`)
- `src/app/api/admin/projects/[id]/route.ts` (`PATCH/DELETE /api/admin/projects/[id]`)
- `src/app/projects/page.tsx` (calls `/api/projects`)
- `src/app/projects/new/page.tsx` (calls `/api/projects` POST, limited fields)
- `src/app/admin/projects/page.tsx` (calls `/api/admin/projects`)

**Analysis:**  
The `/api/projects` family (portal-UI facing) and `/api/admin/projects` family (agent-dispatch admin) both write to the same `Project` table. They differ in: validation rigor (the portal routes use ad-hoc `body.name` extraction; admin routes use Zod), auth level, response shape (portal returns `_count.sessions/tasks`; admin returns `repoOwner`, `allowWrite`, `clonePath`), and mutation path (portal identifies by `slug`, admin by `id`). The portal's `new/page.tsx` form silently ignores all agent-dispatch fields (`repoOwner`, `repoName`, `allowWrite`, `workingBranch`), meaning a project created through the UI is incomplete as an agent target. There is no comment in either route file acknowledging the other.

**Recommendation:**  
Create a single `src/server/projects.ts` service with typed functions (`listProjects`, `getProject`, `createProject`, `updateProject`). Both route families call it. The service centralizes the Prisma interaction and accepts a "shape" param (`'portal' | 'admin'`) or two dedicated DTOs so each response contains only what its caller needs.

---

### [HIGH] A-2: `src/app/projects/[slug]/page.tsx` is a 290-line God component

**Files:**  
- `src/app/projects/[slug]/page.tsx`

**Analysis:**  
A single file houses: the page shell, a `GitHubTab` component, a `DocsTab` component, a `DocsTree` recursive component, a `FileTab` component, a `SettingsModal` component, and a `MarkdownRenderer` component — seven distinct UI units. It also manages eight independent `useEffect` chains wired together through 17 state variables. The `MarkdownRenderer` is a full custom Markdown-to-JSX mapper that is not shared with any other part of the app (the `src/app/ai/page.tsx` notes tab renders notes as `<pre>` rather than Markdown). The settings mutation inline-assembles a CSRF header object rather than calling a shared helper. Lines are minified into one-liners for sub-components (e.g. `DocsTree`, `SettingsModal`) making them nearly unreadable.

**Recommendation:**  
Extract to `src/components/projects/`:
- `ProjectGitHubTab.tsx`
- `ProjectDocsTab.tsx`
- `ProjectFileTab.tsx`
- `ProjectSettingsModal.tsx`
- `src/components/ui/MarkdownRenderer.tsx` (shared)
- `src/hooks/useProjectData.ts` (the 8 useEffects collapsed into one custom hook)

---

### [HIGH] A-3: `AiNote` model and its UI are buried inside the AI Hub

**Files:**  
- `src/app/ai/page.tsx` (Notes tab, lines 115–163)
- `src/app/api/ai/notes/route.ts`
- `prisma/schema.prisma` (`AiNote` model)

**Analysis:**  
`AiNote` is a first-class life-org feature (free-text notes with tags and search) but it is hidden as a secondary tab inside `src/app/ai/page.tsx`, under a route named `/ai` whose primary purpose is the chat interface. The nav item in `MainSidebar` leads to "AI Hub" (`/ai`), not to notes. Notes have no dedicated URL, cannot be deep-linked, and have no edit/delete capability. There is no "ideas" feature at all — the schema has no `Idea` model and the sidebar has no such item, despite the portal's stated purpose including idea capture. `AiMemory` (key/value scratchpad written by MCP tools) is a separate model that exists only to feed the AI assistant, not as a user-facing notes replacement.

**Recommendation:**  
Move notes to a dedicated `src/app/notes/` route (or `/life/notes`). Create a separate `src/app/ideas/` route (or at minimum a tag-based view of `AiNote`). Expose both in the sidebar under a "Life Org" section. Keep the AI chat panel at `/ai` without the notes tab.

---

### [HIGH] A-4: No normalized integration module shape

**Files:**  
- `src/lib/anthropic.ts` (factory fn + constants, no `isXxxAvailable`)
- `src/lib/coolify.ts` (typed client, has `isCoolifyAvailable()`)
- `src/lib/tailscale.ts` (typed client, has `isTailscaleAvailable()`)
- `src/lib/microsoft.ts` (typed client, no guard fn)
- `src/lib/microsoft-auth.ts` (token manager — only integration split into two files)
- `src/lib/onepassword.ts` (client + DB-backed config loader)
- `src/lib/github.ts` (typed client, no guard fn)
- `src/app/api/reddit/route.ts` (no `src/lib/reddit.ts` — all logic inline in route)

**Analysis:**  
Each integration was built independently. Some have availability guards; some have typed interfaces; some auto-refresh tokens; Reddit has no lib module at all (its scraping logic — ~150 lines of filtering, subreddit lists, competitor keywords — lives entirely inside the route handler). Synology is mentioned in the README as an integration but has no `src/lib/synology.ts`. The Microsoft integration uniquely splits OAuth management from API calls across two files (`microsoft.ts` + `microsoft-auth.ts`), which is actually a good pattern but is not replicated anywhere else (e.g. GitHub has no token refresh layer even though it reads `GITHUB_TOKEN` ad-hoc at each call site via `headers()`).

**Recommendation:**  
See the **Integration Pattern Proposal** section below.

---

### [MEDIUM] A-5: Auth helper proliferation in `src/lib/auth.ts`

**Files:**  
- `src/lib/auth.ts`

**Analysis:**  
Nine exported auth functions: `getSession`, `getSessionUser`, `requireAuth`, `requireAdmin`, `getSessionFromReq`, `getApiSession`, `getApiUser`, `requireApiAuth`, `requireApiAdmin`. Route handlers use them inconsistently — `src/app/api/coolify/route.ts` calls `getSessionUser()` directly and does its own null check; `src/app/api/ai-hub/tasks/route.ts` calls `requireApiAuth()` which throws `'UNAUTHORIZED'` caught by a try/catch; `src/app/api/projects/route.ts` calls `getSessionUser()` with a manual null check. The `getApiUser` function checks for a Bearer token first (to support the Amonis worker), then falls through to the session — this is only relevant for Amonis-callable routes, but because it's shared, every route that calls it inherits that bearer-token path.

**Recommendation:**  
Consolidate to three exported functions: `getSessionUser` (nullable, for read-only checks), `requireUser` (throws/redirects if unauthenticated), `requireAdmin` (throws/redirects if not admin). Add a fourth `requireWorkerOrAdmin` specifically for the routes that accept bearer tokens. Remove `getApiSession`, `getSessionFromReq` (internal helpers), and the overlapping `requireApiAuth`/`requireApiAdmin` aliases.

---

### [MEDIUM] A-6: `Project` type is declared locally in three separate page files

**Files:**  
- `src/app/projects/page.tsx` (lines 19–33)
- `src/app/projects/[slug]/page.tsx` (lines 17–21)
- `src/app/admin/projects/page.tsx` (lines 24–39)

**Analysis:**  
Each page declares its own `interface Project` with overlapping but not identical fields. The list page knows about `_count.sessions` and `_count.tasks`; the detail page omits counts; the admin page knows about `allowWrite`, `clonePath`, `repoOwner`, `repoName`, and `workingBranch`. A shared DTO in `src/types/` already exists for the agent system (`src/types/agents.ts` exports `ProjectSummary`) but the project pages don't use it — they import nothing from `src/types/`. If the Prisma schema changes a field, all three local interfaces must be updated separately.

**Recommendation:**  
Add `ProjectPortalDTO` and `ProjectAdminDTO` to `src/types/index.ts` (or a new `src/types/projects.ts`). Import them into all three pages. The admin DTO can extend the portal one.

---

### [MEDIUM] A-7: `src/app/api/ai-hub/dispatch-task/route.ts` duplicates the GET handler of `tasks/route.ts`

**Files:**  
- `src/app/api/ai-hub/dispatch-task/route.ts` (GET handler, lines 136–172)
- `src/app/api/ai-hub/tasks/route.ts`

**Analysis:**  
The comment in `dispatch-task/route.ts` says "GET /api/ai-hub/dispatch-task?status=... Mostly delegates to /api/ai-hub/tasks but exists at this URL for the spec." The two GET handlers are not delegating — they are copy-pasted. Any filter logic change in one does not propagate to the other. `dispatch-task` GET also has a different default limit (100 vs 200 in `tasks` GET).

**Recommendation:**  
Extract task filtering into `src/lib/task-queries.ts` and call it from both route handlers. Or: remove the GET handler from `dispatch-task/route.ts` and have the UI call `/api/ai-hub/tasks` for listing. The `dispatch-task` route should only handle POST.

---

### [MEDIUM] A-8: `worker/` has no clear boundary with `src/`

**Files:**  
- `worker/index.ts`, `worker/task-executor.ts`, `worker/claude-agent.ts`, `worker/git-handler.ts`, `worker/orchestrator.ts`, `worker/auth-mode.ts`
- `src/types/agents.ts` (types used by both portal and worker)

**Analysis:**  
`src/types/agents.ts` is the only shared module between the Next.js app and the worker process. That's intentional and good. However, `worker/` imports from `@prisma/client` directly (via the same database) — the worker runs as a separate process but shares the SQLite file. Any schema migration that renames a column will break the worker at runtime, not at build time. There is no worker-specific Prisma client configuration and no documentation of the worker's DB access pattern in relation to the portal.

**Recommendation:**  
Add a `worker/README.md` section (or a `docs/worker-architecture.md`) explaining the shared-DB contract. Long-term: introduce a thin HTTP API layer between worker and portal so the worker reads/writes tasks only through typed endpoints, making the boundary explicit and testable.

---

### [LOW] A-9: `src/components/` is nearly flat — no feature sub-folders

**Files:**  
- `src/components/CommandPalette.tsx`
- `src/components/ClientProviders.tsx`
- `src/components/admin/UpdatePanel.tsx`
- `src/components/dashboard/ServiceTile.tsx` (+ 2 more)
- `src/components/widgets/` (6 files)
- `src/components/ai/AiChatPanel.tsx`
- `src/components/ui/` (3 files: `StatusDot`, `SearchBar`, `VpnBadge`)
- `src/components/layout/MainSidebar.tsx`

**Analysis:**  
The `src/components/ui/` folder has only three files, all fairly generic (`StatusDot`, `SearchBar`, `VpnBadge`). Reusable primitives like `MarkdownRenderer`, a project card, a task status badge, or a generic modal wrapper don't exist as components — they are inlined inside page files. The pattern is inconsistent: some features have a subfolder (`admin/`, `dashboard/`, `widgets/`, `ai/`) while others don't (the projects section has no `components/projects/`).

**Recommendation:**  
Create `src/components/projects/` for the project card, the tab system, and the extracted sub-components described in A-2. Add `src/components/ui/MarkdownRenderer.tsx`. Adopt a convention: any component used by more than one page lives in `src/components/<feature>/`; anything used by three or more unrelated features lives in `src/components/ui/`.

---

### [LOW] A-10: Navigation mixes portal-meta and life-org items without structural separation

**Files:**  
- `src/components/layout/MainSidebar.tsx`

**Analysis:**  
The sidebar has four accordion groups: Productivity, Infrastructure, Development, Manage. "Productivity" contains Mail, Todo, OneNote, Bookmarks — life-org tools. "Development" contains Projects, Amonis Finance, Insights, Agents — a mix of life-org (Amonis is the finance tracker app being developed) and portal meta (Agents is the dispatch system). "AI Hub" is pinned above all groups alongside "Dashboard". There is no "Life Org" section, no "AI Tools" section — concepts that the user's stated goals call for explicitly.

**Recommendation:**  
Reorganize into: **Home** (Dashboard, Quick-capture/inbox), **AI** (AI Hub, Agents, Dispatch), **Projects** (all projects + tasks), **Life** (Notes, Ideas, Todos, Bookmarks), **Tools** (Mail, OneNote, Tailscale, Coolify, Remote), **Admin** (manage routes). This matches the portal's two stated domains (AI mission control vs life-org) and makes room for future additions in the right bucket.

---

## Integration Pattern Proposal

Each integration should live in `src/lib/integrations/<name>/` with a standardized internal shape. Three files maximum:

```
src/lib/integrations/
  github/
    client.ts      # typed API functions, no DB access, env vars read here
    types.ts       # exported interfaces (RepoInfo, Commit, PullRequest, ...)
    index.ts       # re-exports + optional isAvailable() guard
  microsoft/
    client.ts      # graphApi(), getMessages(), getNotebooks(), ...
    auth.ts        # getMicrosoftToken(), token refresh, DB writes via prisma
    types.ts       # OneNoteNotebook, OutlookMessage, ...
    index.ts
  coolify/
    client.ts
    types.ts
    index.ts       # exports isCoolifyAvailable()
  tailscale/
    client.ts
    types.ts
    index.ts       # exports isTailscaleAvailable(), getConnectionMode()
  onepassword/
    client.ts      # connectFetch(), listVaults(), getItem(), resolveSecret()
    auth.ts        # getConnection(), loadHostAndToken() — DB-backed config
    types.ts
    index.ts
  reddit/
    client.ts      # moved from src/app/api/reddit/route.ts
    types.ts       # RedditPost, SubredditConfig, InsightResult
    index.ts
  anthropic/
    client.ts      # getAnthropicClient()
    types.ts       # ANTHROPIC_MODELS const
    index.ts
```

**Contract rules:**
- `client.ts` must not import from `@/lib/db` (no Prisma). DB access belongs in `auth.ts` or the calling route.
- `types.ts` exports only interface/type declarations — no runtime code.
- `index.ts` re-exports the public surface and (if applicable) exposes `isXxxAvailable(): boolean`.
- All env var reads happen in `client.ts` (not scattered across route files).

Migration path: rename existing files and update import paths. No logic changes needed for the initial move.

---

## Projects Section Deep Dive

### Current State

**Route tree:**
```
GET  /api/projects                          → list (portal UI, no Zod)
POST /api/projects                          → create (limited fields, portal UI)
GET  /api/projects/[slug]                   → get + 10 most recent sessions
PUT  /api/projects/[slug]                   → update (5 fields only)
DELETE /api/projects/[slug]                 → delete
GET  /api/projects/[slug]/docs              → GitHub docs tree
GET  /api/projects/[slug]/docs/[...path]    → GitHub file content (wildcard)
GET/PUT /api/projects/[slug]/files/[name]   → read/write local .md files

GET  /api/admin/projects                    → list (full admin shape, Zod)
POST /api/admin/projects                    → create (full fields, Zod + CSRF + audit)
PATCH/DELETE /api/admin/projects/[id]       → update/delete by ID (Zod + CSRF)
GET/POST/DELETE /api/admin/projects/[id]/secrets → 1Password mappings
```

**Page tree:**
```
/projects          → project grid with status filter chips
/projects/new      → create form (5 fields: name, slug, desc, repoUrl, icon)
/projects/[slug]   → monolith page: GitHub tab, Notes tab, README, Docs, Changelog
```

### What's Disorganized

**1. The create form is detached from the admin form.**  
`/projects/new` calls `POST /api/projects` and only sets `name, slug, description, repoUrl, icon`. A project created this way has `allowWrite: false`, no `repoOwner`, no `repoName`, no `workingBranch` — it is invisible to the agent dispatch system until an admin also configures it via `/admin/projects`. The user has no feedback that this second step is required.

**2. No per-project task or session view exists.**  
The `Project` model has relations to `Task[]` and `ProjectSession[]`, but neither appears on any page under `/projects/[slug]`. The project list shows a `taskCount` badge but clicking it goes nowhere — the tab inside `/projects/[slug]` has GitHub, Notes, README, Docs, Changelog but no Tasks and no Sessions tab. To see tasks for a project, the user goes to `/agents` and filters — a separate part of the app.

**3. The "Notes" tab is a CLAW-NOTES.md viewer, not a notes system.**  
The tab labeled `🦀 Notes` reads `CLAW-NOTES.md` from disk (via `GET /api/projects/[slug]/files/CLAW-NOTES.md`). This is a Claude-agent scratchpad file, not the user's notes. It is editor-friendly but semantically misleading. A user looking for their own notes about a project will find a file written by the AI agent.

**4. Settings are buried in a modal.**  
Project metadata editing (name, description, repoUrl, icon, status) is in a `SettingsModal` spawned by a button inside the sticky header of `/projects/[slug]`. The full admin settings (allowWrite, repoOwner, clonePath, secrets) are in a completely different place (`/admin/projects`). There is no unified project settings page.

**5. File reads go to disk; docs reads go to GitHub — from the same tab bar.**  
README, Notes, and Changelog tabs read local files from `GET /api/projects/[slug]/files/[filename]`. The Docs tab reads from GitHub via `GET /api/projects/[slug]/docs` and then `GET /api/github/docs`. The GitHub tab also calls `/api/github/repo`. Three different data sources behind five tabs in one component — and the component doesn't gracefully handle missing repos (it filters tabs based on `project.repoUrl` but still fetches without waiting for project load).

### Proposed Route Tree

```
/projects                              → grid (status filter, kind filter: digital|physical)
/projects/new                          → unified create form (all fields, including agent config)
/projects/[slug]                       → project workspace shell (sub-nav)
/projects/[slug]/overview              → summary card, recent activity, quick stats
/projects/[slug]/tasks                 → task list for this project (status filter, dispatch button)
/projects/[slug]/tasks/[taskId]        → task detail (logs, attachments, result)
/projects/[slug]/sessions              → ProjectSession log (work session notes)
/projects/[slug]/docs                  → GitHub docs tree + file viewer (existing logic extracted)
/projects/[slug]/github                → repo overview: commits, issues, PRs (existing GitHubTab)
/projects/[slug]/notes                 → agent scratchpad files (CLAW-NOTES.md, etc.)
/projects/[slug]/settings              → unified settings page (replaces modal + /admin/projects split)
/projects/[slug]/settings/secrets      → 1Password secret mappings (moved from /admin/projects/[id]/secrets)
```

**API changes that enable this:**
- Merge `/api/projects/[slug]` and `/api/admin/projects/[id]` into a single route family that returns different shapes based on the user's role (or two explicit query params).
- Add `GET /api/projects/[slug]/tasks` returning tasks filtered to this project.
- Add `GET /api/projects/[slug]/sessions` returning ProjectSessions for this project.
- Remove `/projects/new` page; make the create form part of `/projects` as a slide-over/modal so users aren't navigated away.

**Note on `kind: digital|physical`:** the field was added recently but has no UI filter on `/projects`. The proposed grid above adds a kind filter chip alongside the existing status chips.

---

## Refactor Sequencing

Order matters to avoid merge conflicts and half-broken states:

1. **Create `src/types/projects.ts`** with `ProjectPortalDTO` and `ProjectAdminDTO`. Update imports in the three pages. No logic changes — this is purely additive. *(~30 min)*

2. **Extract `src/components/ui/MarkdownRenderer.tsx`** from `src/app/projects/[slug]/page.tsx`. It has no external state and is a pure presentation component. *(~20 min)*

3. **Extract `src/lib/integrations/reddit/`** — move all route logic out of `src/app/api/reddit/route.ts` into `src/lib/integrations/reddit/client.ts` and `types.ts`. Update the route to call the new module. This is the only integration without a lib file and the easiest isolated win. *(~30 min)*

4. **Create `src/server/projects.ts`** service layer. Move Prisma calls from both `/api/projects/` and `/api/admin/projects/` into typed service functions. Both route families call the service. *(~60 min)*

5. **Extract sub-components from `src/app/projects/[slug]/page.tsx`** into `src/components/projects/`. Start with `ProjectSettingsModal` (self-contained) then `ProjectGitHubTab`, `ProjectDocsTab`, `ProjectFileTab`. Replace the 8 useEffect chains with `src/hooks/useProjectData.ts`. *(~90 min)*

6. **Add `/projects/[slug]/tasks` page** — a filtered task list reusing the task card already built in `src/app/agents/page.tsx`. This gives projects their own task view without touching the agents page. *(~60 min)*

7. **Consolidate auth helpers** in `src/lib/auth.ts` to four exported functions. Update all call sites. *(~45 min — high ROI for readability, but touches many files; do this in a dedicated PR)*

8. **Reorganize `src/lib/integrations/`** — rename and restructure existing lib files following the normalized pattern. This is a rename-heavy refactor that should happen in one PR to keep import changes atomic. *(~60 min)*

9. **Add `/projects/[slug]/settings` page** and deprecate the inline SettingsModal. Merge the admin secrets panel into the settings page (role-gated). *(~90 min)*

10. **Reorganize sidebar nav** into the six-group IA described in A-10 once the new routes exist. This is last because it depends on `/notes`, `/ideas`, and the consolidated projects workspace being in place. *(~30 min)*
