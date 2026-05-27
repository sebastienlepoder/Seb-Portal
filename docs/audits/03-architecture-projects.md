# Architecture Audit: Projects Section Deep-Dive — Area 3

**Auditor:** Archer (read-only architecture review)  
**Date:** 2026-05-27  
**Scope:** `src/app/projects/`, `src/app/admin/projects/`, all `src/app/api/projects/` and `src/app/api/admin/projects/` routes, `prisma/schema.prisma` (Project-related models), `src/app/api/ai-hub/dispatch-task/route.ts`, `worker/task-executor.ts` (skim)

---

## 1. Summary

The projects section is **two half-built features that never unified**:

- The **user-facing feature** (`/projects`, `/projects/[slug]`) treats projects as a documentation hub: GitHub viewer, disk-stored markdown notes, no concept of tasks or sessions.
- The **agent dispatch system** (`/admin/projects`, `/api/admin/projects`, `/api/ai-hub/dispatch-task`) treats projects as CI/CD targets: repo clone paths, `allowWrite`, secret mappings, task queues.

Both write to the same `Project` table but via **two separate, inconsistently secured API stacks**. The Prisma schema defines five rich child models (`Task`, `TaskLog`, `TaskAttachment`, `ProjectSession`, `ProjectSecretMapping`) that collectively have **zero UI representation** on the project detail page. The disk-storage pattern for notes is fragile and non-auditable. The result is a section that is disorganised at the route level, the API level, and the data-access level.

---

## 2. Current State: Files, Routes, and Components Inventory

### 2.1 Page routes

| Route | File | Purpose |
|---|---|---|
| `/projects` | `src/app/projects/page.tsx` | Grid of all projects with status-filter chips, session count, task count badges. Admin-only "Nouveau projet" link. |
| `/projects/new` | `src/app/projects/new/page.tsx` | Admin-gated creation form: name, slug (auto-generated), description, repoUrl, icon. Missing: `kind`, `color`, `repoOwner`, `repoName`, `workingBranch`. |
| `/projects/[slug]` | `src/app/projects/[slug]/page.tsx` | 291-line monolith. Tab switcher (GitHub / Notes / README / Docs / Changelog). Admin settings modal. |
| `/admin/projects` | `src/app/admin/projects/page.tsx` | Full project CRUD table for agent-dispatch config: slug, repoOwner, repoName, workingBranch, clonePath, allowWrite, sortOrder, status. Inline edit modal. |

### 2.2 API routes

#### User-facing (`/api/projects/…`)

| Route | Handler | Verb(s) | Notes |
|---|---|---|---|
| `/api/projects` | `src/app/api/projects/route.ts` | GET, POST | GET: list with `_count: {sessions, tasks}`. POST: admin-create; accepts `kind` but **no CSRF, no audit log**. |
| `/api/projects/[slug]` | `src/app/api/projects/[slug]/route.ts` | GET, PUT, DELETE | GET: project + last 10 sessions (sessions array **silently dropped** by UI). PUT: accepts `kind` but **settings modal never sends it**. |
| `/api/projects/[slug]/files/[filename]` | `src/app/api/projects/[slug]/files/[filename]/route.ts` | GET, PUT | Disk I/O for `CLAW-NOTES.md`, `README.md`, `CHANGELOG.md`, `SESSIONS.md`. No CSRF on PUT. |
| `/api/projects/[slug]/docs` | `src/app/api/projects/[slug]/docs/route.ts` | GET | Walks `$PROJECTS_DIR/{slug}/` for `.md` files; returns file tree. |
| `/api/projects/[slug]/docs/[...filepath]` | `src/app/api/projects/[slug]/docs/[...filepath]/route.ts` | GET | Reads any `.md` under the project dir by relative path. |

#### Admin (`/api/admin/projects/…`)

| Route | Handler | Verb(s) | Notes |
|---|---|---|---|
| `/api/admin/projects` | `src/app/api/admin/projects/route.ts` | GET, POST | Full schema, Zod validation, CSRF, `auditLog()`. |
| `/api/admin/projects/[id]` | `src/app/api/admin/projects/[id]/route.ts` | GET, PATCH, DELETE | PATCH: updates any project field. DELETE: guards in-flight tasks first. |
| `/api/admin/projects/[id]/secrets` | `src/app/api/admin/projects/[id]/secrets/route.ts` | GET, POST, DELETE | CRUD for `ProjectSecretMapping`. CSRF + audit. |

#### AI Hub

| Route | Handler | Verb(s) | Notes |
|---|---|---|---|
| `/api/ai-hub/dispatch-task` | `src/app/api/ai-hub/dispatch-task/route.ts` | POST, GET | POST: create `Task` by `project_name` fuzzy match + optional attachments. GET: list tasks with `projectId`, `status`, `agentId` filters. |

### 2.3 Components inside `[slug]/page.tsx`

All defined in `src/app/projects/[slug]/page.tsx` — no separate component files:

| Function component | Lines | Purpose |
|---|---|---|
| `ProjectDetailPage` | 59–206 | Root page, all state, all `useEffect` hooks |
| `GitHubTab` | 208–263 | Repo overview + commits/issues/PRs sub-tabs |
| `DocsTab` | 265–275 | File-tree sidebar + markdown reader |
| `DocsTree` | 277–279 | Recursive tree renderer |
| `FileTab` | 281–283 | Markdown view + inline editor for disk files |
| `SettingsModal` | 285–287 | Admin edit modal (name, description, repoUrl, icon, status) |
| `MarkdownRenderer` | 289–291 | `ReactMarkdown` with portal prose styles |

Seven components in one file; each is a candidate for extraction to `src/components/projects/`.

---

## 3. Schema-to-UI Gap Matrix

| Prisma Model | Key Fields | User-facing UI | Admin UI | Gap |
|---|---|---|---|---|
| `Project` | slug, name, kind, status, repoUrl, allowWrite, workingBranch | List, partial detail, creation form | Full CRUD in `/admin/projects` | `kind` persisted in DB (`schema.prisma:367`) and accepted by API (`projects/route.ts:44`, `[slug]/route.ts:58`) but **never shown or set** in any user-facing form or detail view |
| `ProjectSession` | projectId, title, summary, date, tags | **None** | **None** | `GET /api/projects/[slug]` (`[slug]/route.ts:18–24`) fetches last 10 sessions, but the `Project` interface in the UI (`[slug]/page.tsx:17–21`) has no `sessions` field — data is discarded |
| `Task` | projectId, agentProfileId, parentTaskId, status, priority, resultSummary, costUsd | **None** | Indirectly via AI Hub | Task count shown on list card (`projects/page.tsx:203`) but no tasks tab on detail page |
| `TaskLog` | taskId, level, message | **None** | **None** | No log viewer anywhere in the portal |
| `TaskAttachment` | taskId, mimeType, dataBase64, byteSize | **None** | **None** | Attachments stored on dispatch (`dispatch-task/route.ts:99`) but never retrieved |
| `ProjectSecretMapping` | projectId, envName, vaultId, itemId | **None** | API only (`[id]/secrets/route.ts`) | Secrets managed via API but no UI surface — not even for admin on the detail page |
| `AgentProfile` | slug, name, role, systemPrompt, model | Consumed by dispatch, not linked from project | `/admin/agents` | No "dispatch to this project" action on the detail page |

---

## 4. Duplicate Logic Between `/projects` and `/admin/projects`

Both API stacks write to the same `Project` table but with inconsistent security posture:

| Concern | `/api/projects` (user-facing) | `/api/admin/projects` (admin) |
|---|---|---|
| Create project | `POST /api/projects` (`projects/route.ts:36`) | `POST /api/admin/projects` (`admin/projects/route.ts:56`) |
| Auth check | Manual string compare: `user.role?.toLowerCase() !== 'admin'` (`projects/route.ts:39`) | `requireApiAdmin()` helper (`admin/projects/route.ts:58`) |
| CSRF protection | **None** | `verifyCsrf(request)` (`admin/projects/route.ts:59`) |
| Audit log | **None** | `auditLog({ resource: 'project', op: 'create' })` (`admin/projects/route.ts:97`) |
| Input validation | Bare destructure; only `name` and `slug` required (`projects/route.ts:44`) | Full Zod `projectSchema` with 12 fields, length limits, regex (`admin/projects/route.ts:12–30`) |
| Fields accepted on create | 6: name, slug, description, repoUrl, icon, color, kind | 12: all above + repoOwner, repoName, workingBranch, clonePath, allowWrite, sortOrder |
| Slug uniqueness | Caught via Prisma `P2002` error (`projects/route.ts:77`) | Explicit `findUnique` before insert (`admin/projects/route.ts:73`) |

**Impact:** `/projects/new/page.tsx:43` calls `POST /api/projects` — the weaker path. An admin creating a project through the user-facing UI bypasses CSRF and leaves no audit record. The admin page calls the secured path. There are effectively **two create flows for the same resource**, with the worse one the primary user experience.

Similarly, `GET /api/projects` and `GET /api/admin/projects` both list the same rows. The user route returns `_count.sessions` and `_count.tasks`; the admin route omits counts but includes `toProjectSummary()` fields. Neither is a strict superset of the other, so clients cannot share a type.

---

## 5. Filesystem-Notes Problem

### How it works

Three API routes perform direct disk I/O against `$PROJECTS_DIR/{slug}/` (defaulting to `path.join(process.cwd(), 'projects')`):

- `GET/PUT /api/projects/[slug]/files/[filename]` — `files/[filename]/route.ts:7,52,139`
- `GET /api/projects/[slug]/docs` — `docs/route.ts:7,111`
- `GET /api/projects/[slug]/docs/[...filepath]` — `docs/[...filepath]/route.ts:7,58`

Allowed files are hard-coded: `['README.md', 'CLAW-NOTES.md', 'CHANGELOG.md', 'SESSIONS.md']` (`files/[filename]/route.ts:10`).

### Why this is problematic

1. **No audit trail.** `PUT /api/projects/[slug]/files/[filename]` (`files/[filename]/route.ts:87–164`) writes the file and calls `prisma.project.update({ data: { updatedAt: new Date() } })`. Who edited, what they changed, and when is permanently lost. The admin route equivalents (`/api/admin/projects/[id]`) all call `auditLog()` (`[id]/route.ts:67`); the file-write route never does.

2. **No backup or replication.** Files live in the process working directory. In Docker, `process.cwd()` is ephemeral unless an explicit volume is mounted. A container restart with no volume drops all notes. The 1Password-backed `ProjectSecretMapping` model and the Prisma `ProjectSession` model both survive restarts; the notes do not.

3. **No full-text search.** SQLite FTS5 cannot index content that lives on disk. Searching across `CLAW-NOTES.md` across all projects is impossible without a separate filesystem grep.

4. **No versioning.** `PUT` is a destructive overwrite (`fs.writeFile`, `files/[filename]/route.ts:140`). There is no diff history; a mistaken save destroys prior content.

5. **Concurrency hazard.** Two simultaneous `PUT` requests for the same file (`files/[filename]/route.ts:139`) have no write lock — last writer wins and may silently corrupt content.

6. **`SESSIONS.md` duplicates `ProjectSession`.** The schema already has a proper `ProjectSession` model (`schema.prisma:379–390`) with `title`, `summary`, `date`, and `tags`. The disk file `SESSIONS.md` is a free-text shadow of the same data with none of the query benefits.

7. **`CLAW-NOTES.md` is agent-specific jargon exposed as primary UX.** The notes tab label in the detail page is `'🦀 Notes'` (`[slug]/page.tsx:45`) but the backend filename is `CLAW-NOTES.md` — a Claude agent artifact name leaking into user-visible UI.

---

## 6. Missing Concepts

### 6.1 `Project.kind` enum is schema-only

`kind String @default("digital")` exists in Prisma (`schema.prisma:367`) and is accepted by both write APIs (`/api/projects/route.ts:44,61`, `/api/projects/[slug]/route.ts:58,61`). Zero UI controls set it. The detail page infers "no GitHub" from `!project.repoUrl` (`[slug]/page.tsx:171`) rather than from `kind === 'physical'`, so the discriminator is already present in the data layer but has no surface.

### 6.2 No tasks tab

`Task` rows carry a `projectId` foreign key (`schema.prisma:529`) and the list API returns `_count: { tasks: true }` (`projects/route.ts:21`). Task counts appear on list cards (`projects/page.tsx:202–248`). But the detail page has no tasks tab, no task creation form, and no link to the AI Hub task view for the specific project.

### 6.3 Sessions tab silently empty

`GET /api/projects/[slug]` fetches `sessions: { orderBy: { date: 'desc' }, take: 10 }` (`[slug]/route.ts:18–24`) but the TypeScript `Project` interface on the client (`[slug]/page.tsx:17–21`) has no `sessions` property. The network payload is discarded. `ProjectSession` has `title`, `summary`, `date`, `tags` — enough for a useful timeline.

### 6.4 No activity feed

The global `Activity` model (`schema.prisma:147–158`) records events like `task.created`. No project-scoped activity feed surfaces these. The dispatch-task route writes an `auditLog` entry (`dispatch-task/route.ts:104`) but not an `Activity` row with `entityId = project.id`.

### 6.5 Secrets not visible on detail page

`ProjectSecretMapping` is fully managed via `GET/POST/DELETE /api/admin/projects/[id]/secrets` (with CSRF and audit logging) but is never rendered anywhere in the portal UI — not even a read-only list for admin. The worker resolves secrets at task time via `loadProjectSecrets` (`task-executor.ts:70–80`) but an admin has no way to verify mappings without hitting the API directly.

### 6.6 No agent dispatch from project detail

The only way to dispatch a task is through the AI Hub. The project detail page has a "Settings" button (admin-only, `[slug]/page.tsx:189`) but no "Run agent task" action, even though the `project.id` is already in scope. The dispatch endpoint accepts `project_name` (`dispatch-task/route.ts:16`) not `project_id`, so even a wired-up button would need to pass the name string.

### 6.7 No cross-project task queue

`GET /api/ai-hub/dispatch-task` supports `?projectId=…` (`dispatch-task/route.ts:143`) but no UI uses this filter to show all tasks scoped to a project. The AI Hub shows a flat task list. There is no "all open tasks across all projects" view.

---

## 7. Proposed Route Tree

Each tab becomes a distinct Next.js route under a shared `src/app/projects/[slug]/layout.tsx` that owns the sticky header and tab bar (extracting the current header from `[slug]/page.tsx:177–196`).

| Route | New File | Reusable Existing Component |
|---|---|---|
| `/projects/[slug]/overview` | `overview/page.tsx` | `GitHubTab` (overview sub-tab only) + new `ActivityFeed` widget |
| `/projects/[slug]/tasks` | `tasks/page.tsx` | New `TaskTable` (can share status-badge logic from `projects/page.tsx:35–50`) |
| `/projects/[slug]/tasks/[id]` | `tasks/[id]/page.tsx` | New `TaskLogStream` + `TaskAttachmentGallery` |
| `/projects/[slug]/sessions` | `sessions/page.tsx` | New `SessionTimeline`; feeds from existing `ProjectSession` Prisma relation |
| `/projects/[slug]/notes` | `notes/page.tsx` | `FileTab` (rename + DB-backed) |
| `/projects/[slug]/github` | `github/page.tsx` | `GitHubTab` (full: commits / issues / PRs sub-tabs) |
| `/projects/[slug]/docs` | `docs/page.tsx` | `DocsTab` + `DocsTree` |
| `/projects/[slug]/activity` | `activity/page.tsx` | New `ActivityFeed`; reuses `Activity` model |
| `/projects/[slug]/secrets` | `secrets/page.tsx` | New `SecretMappingTable`; admin-gated; calls existing `/api/admin/projects/[id]/secrets` |
| `/projects/[slug]/settings` | `settings/page.tsx` | `SettingsModal` promoted to a full page; adds `kind` selector |

**Default redirect:** `/projects/[slug]` → `/projects/[slug]/overview`.

---

## 8. Proposed Schema Changes

### 8.1 `Project.kind` TypeScript guard (no migration needed)

Add to `src/types/projects.ts` (new file):

```typescript
// src/types/projects.ts
export const PROJECT_KINDS = ['digital', 'physical'] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export function isProjectKind(v: unknown): v is ProjectKind {
  return PROJECT_KINDS.includes(v as ProjectKind);
}
```

Wire into the Zod schemas in `/api/projects/route.ts` and `/api/admin/projects/route.ts`:

```typescript
// In both projectSchema and dispatchSchema:
kind: z.enum(['digital', 'physical']).default('digital'),
```

### 8.2 `ProjectNote` model — migrate disk notes to DB

```diff
// prisma/schema.prisma — proposed additions only (do not apply without review)

 model Project {
   // ... existing fields unchanged ...
+  notes           ProjectNote[]
 }

+model ProjectNote {
+  id          String   @id @default(uuid())
+  projectId   String
+  noteType    String   // "notes" | "readme" | "changelog" | "custom"
+  content     String   // markdown body
+  version     Int      @default(1)
+  editedById  String?  // userId of last editor
+  createdAt   DateTime @default(now())
+  updatedAt   DateTime @updatedAt
+
+  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
+
+  @@unique([projectId, noteType])
+  @@index([projectId, noteType])
+}
```

**Why `@@unique([projectId, noteType])`:** Each note type is a single "slot" per project (mirroring the current one-file-per-type pattern), but the DB enforces it and provides an `updatedAt` audit trail.

### 8.3 `Activity` entity linkage for project events

No schema change required. `Activity.entityId` (`schema.prisma:153`) already supports this. Add `writeActivity` calls in:
- `dispatch-task/route.ts` after task creation (set `entityType: 'project'`, `entityId: project.id`)
- `[slug]/route.ts` PUT handler
- `files/[filename]/route.ts` PUT handler (once migrated to DB)

### 8.4 SQLite CHECK constraint for `kind` (optional migration)

```sql
-- migrations/YYYYMMDDHHMMSS_project_kind_check/migration.sql
-- SQLite does not enforce existing CHECK constraints via ALTER TABLE;
-- this requires table recreation (Prisma handles via --create-only + manual review)
-- Proposed constraint to add to the CREATE TABLE regeneration:
-- CHECK (kind IN ('digital', 'physical'))
```

For now, application-level validation via Zod (`z.enum(['digital','physical'])`) is sufficient until a SQLite→Postgres migration occurs.

---

## 9. Migration Sequence

Steps are ordered from smallest-risk to largest-risk. Each is independently deployable.

**Step 1 — Close the dual-creation security gap** *(1 file change)*  
Route `/projects/new/page.tsx:43` to `POST /api/admin/projects` instead of `POST /api/projects`. The admin route has Zod validation, CSRF checking, and `auditLog()`. Deprecate `POST /api/projects` (return `405 Method Not Allowed` or remove it). This is a pure auth/security fix, not a UX change.

**Step 2 — Add `kind` to all UI forms** *(3 file changes)*  
- `/projects/new/page.tsx`: add `<select>` for `kind` (digital/physical) beside the icon field.
- `[slug]/page.tsx`: add `kind` to `settingsForm` state and `SettingsModal` inputs.
- `src/types/projects.ts`: create the `ProjectKind` type guard (Step 7.1 above).
Both write APIs already accept `kind`; no API changes needed.

**Step 3 — Extract components from `[slug]/page.tsx`** *(prerequisite for Step 4)*  
Move `GitHubTab`, `DocsTab`, `DocsTree`, `FileTab`, `SettingsModal`, `MarkdownRenderer` to `src/components/projects/`. Keep `ProjectDetailPage` as the only export from `[slug]/page.tsx`. This does not change behaviour but reduces the monolith from 291 lines to ~80 and unblocks sub-route creation.

**Step 4 — Introduce sub-route layout** *(new files only)*  
Create `src/app/projects/[slug]/layout.tsx` with the sticky header and tab bar. Rename `[slug]/page.tsx` to `[slug]/overview/page.tsx`. Add a redirect from `[slug]/page.tsx` to `[slug]/overview`. Wire up all tab links from Section 7. At this point tabs resolve to stub `<ComingSoon />` pages — no functional regression.

**Step 5 — Add tasks tab** *(new API + new page)*  
Create `GET /api/projects/[slug]/tasks` returning `Task[]` scoped to the project. Create `/projects/[slug]/tasks/page.tsx`. Add dispatch form calling `POST /api/ai-hub/dispatch-task`. Create `/projects/[slug]/tasks/[id]/page.tsx` with `TaskLog` polling and `TaskAttachment` rendering.

**Step 6 — Wire sessions tab** *(no new API needed)*  
`GET /api/projects/[slug]` already returns sessions. Add `sessions` to the TypeScript `Project` interface in the UI. Create `/projects/[slug]/sessions/page.tsx` with a session timeline and a "New session" form calling `POST /api/projects/[slug]/sessions` (new route, trivial Prisma insert).

**Step 7 — Migrate disk notes to `ProjectNote`** *(data migration required)*  
- Add `ProjectNote` model via Prisma migration (diff in Section 8.2).
- Write a one-time migration script: read `$PROJECTS_DIR/{slug}/*.md`, insert `ProjectNote` rows.
- Swap `GET/PUT /api/projects/[slug]/files/[filename]` to read/write `ProjectNote` rows via Prisma. Keep the disk paths as a fallback read for one release cycle, then delete.
- Add `editedById` population and `auditLog()` on every note save.

**Step 8 — Surface secrets tab** *(new page, existing API)*  
Create `/projects/[slug]/secrets/page.tsx` (admin-gated). Calls existing `GET /api/admin/projects/[id]/secrets`. Renders a read-only table of `envName → vaultId/itemId/fieldLabel` mappings with an admin-only "Add mapping" form. No API changes needed.

**Step 9 — Add activity feed** *(Activity write-calls + new page)*  
Add `writeActivity({ type: 'task.dispatched', entityType: 'project', entityId: project.id, ... })` in `dispatch-task/route.ts` after task creation. Create `GET /api/projects/[slug]/activity` querying `Activity` by `entityId = project.id`. Create `/projects/[slug]/activity/page.tsx`.

**Step 10 — Promote settings to full page** *(refactor only)*  
Move `SettingsModal` content to `/projects/[slug]/settings/page.tsx`. Remove the modal and the Settings button from the detail header. Add `kind` selector. Link to `/admin/projects` for agent-dispatch fields (`allowWrite`, `workingBranch`, `clonePath`) to avoid duplicating that admin surface.
