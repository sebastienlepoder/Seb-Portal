# UX / Information-Architecture & Feature-Gaps Audit — Area 4

**Auditor:** Pixel (read-only UX review)
**Date:** 2026-05-27
**Scope:** sidebar IA, global capture/search, dashboard surface, top-level routes vs Prisma models. Does **not** re-cover the projects deep-dive (see `docs/audits/03-architecture-projects.md`) or the core architecture audit (`docs/audits/02-architecture-core.md`).

---

## 1. Summary

The portal has the **plumbing for a full personal command-centre** — a `UrgentItem` inbox, `AiNote` notes, `Bookmark` import, `Todo` list, cross-project `Task` queue, `Activity` firehose, recurring schedules — but the sidebar exposes about half of it. The rest is reachable only through dashboard widgets, the AI Hub, or admin pages. There is **no quick-capture, no global search across entities, no notification centre, no calendar surface, and no dedicated bookmarks/notes/tasks routes**.

Navigation grouping mixes two unrelated concerns under one label ("Productivity" holds personal todos + Microsoft sub-apps; "Development" holds Projects + the Amonis sub-app + market Insights + the Agents dispatcher). UI strings are 50/50 French and English on the same screens. Project rows expose a task count but clicking them lands on a doc viewer, never a task workspace.

This audit lists each gap with file:line evidence and proposes a tight 5-section IA with a top-pinned action strip.

---

## 2. Part A — Feature gap matrix

| Feature | Status | Evidence | Verdict |
|---|---|---|---|
| Unified inbox / command-centre view | **PARTIAL** | `UrgentInboxWidget` rendered on dashboard (`src/app/dashboard/page.tsx:246`); no standalone `/inbox` route in `src/app/*/page.tsx`. | The model + API exist (`UrgentItem` model, `src/app/api/webhook/urgent/route.ts`) but live only as a 4-item widget. No "see all", filter, snooze, or bulk-done. |
| Notes & ideas management | **PARTIAL** | `AiNote` model (`prisma/schema.prisma:257-267`) is exposed only behind `/ai` → "Notes" tab (`src/app/ai/page.tsx:27`, `:37-45`). No `/notes` route, no sidebar entry. | Hidden under the AI Hub. Users won't discover it. |
| Personal to-dos (vs agent tasks) | **PRESENT** | `/todos` page exists with full CRUD (`src/app/todos/page.tsx:31-407`), seeded categories, filter chips, priority. | Solid implementation. Lives in "Productivity" group (`MainSidebar.tsx:67`). |
| Ideas backlog distinct from todos/notes | **MISSING** | No `Idea` model; "Ideas" exists only as a hard-coded category string in the todo add form (`src/app/todos/page.tsx:257`). | Ideas and todos are conflated. No separate inbox/triage step. |
| Physical vs digital project distinction | **PARTIAL** | `Project.kind` field exists (`prisma/schema.prisma:368`, `digital\|physical`) but Grep shows **no UI** reads it. Projects page renders the same card for both (`src/app/projects/page.tsx:199-249`). | Data model is ready; UI ignores it. No filter chip, no badge, no separate sections. |
| Calendar / scheduling integration | **MISSING** | No `/calendar` route. Recurring schedules exist for the worker (`prisma/schema.prisma:215`, `/admin/recurring`) but that is cron dispatch, not a user calendar. No Microsoft Graph calendar wrapper (Mail + OneNote only — `src/app/api/microsoft/`). | Despite Microsoft account integration, no calendar surface. |
| Quick-capture global shortcut (⌘N) | **MISSING** | Grep `QuickCapture\|⌘N\|cmd\+n` returns no files. Only `⌘K` is wired (`src/components/CommandPalette.tsx:78`). | No global "add note/todo/idea from anywhere". |
| Global search across all entities | **MISSING** | No `/api/search` route in the route list. `CommandPalette.tsx:38-42` only fetches `/api/services`; it cannot search todos, notes, bookmarks, projects, urgent items, or tasks. | Command palette is a service launcher, not a search engine. |
| Dashboard status-at-a-glance | **PARTIAL** | Dashboard renders 7 widgets (`src/app/dashboard/page.tsx:243-251`: Weather, Markets, UrgentInbox, ActivityFeed, Outlook, OneNote, Tailscale). | Strong on infra + Microsoft; missing project KPIs, task queue depth, agent worker status. |
| Notifications / alert centre | **MISSING** | No `Bell` icon in sidebar (`MainSidebar.tsx:6-34`); no notification badge on any nav item; no `/notifications` route. The UrgentInbox is the closest thing but has no count anywhere outside its own widget. | No persistent unread-count surface. |
| Cross-project task queue (`/tasks`) | **MISSING** | `Task` model has 60+ lines of fields (`prisma/schema.prisma:527-586`), full API at `/api/ai-hub/tasks/`, but no `/tasks` page. Tasks are visible only inside each project detail page (already flagged in `03-architecture-projects.md`). | Cannot triage open tasks across all projects. |
| Bookmarks | **MISSING (sidebar link is broken)** | Sidebar has a `Bookmarks` entry at `MainSidebar.tsx:69` pointing to `/bookmarks`, but Glob `src/app/bookmarks/**` returns **no files**. API exists (`src/app/api/bookmarks/route.ts`). | Dead link. |
| Mobile responsiveness for capture-on-the-go | **PARTIAL** | Sidebar collapses to overlay with `mobileOpen` state (`MainSidebar.tsx:172`, `:226-231`). Dashboard has a bottom-sheet for secondary actions (`src/app/dashboard/page.tsx:441-566`). No floating "+" capture button anywhere except the admin "Nouveau service" FAB (`:336-350`). | Layout adapts; capture does not. |

---

## 3. Part B — Information architecture & navigation

### 3.1 Current sidebar anatomy (`MainSidebar.tsx`)

```
┌─────────────────────────────────────┐
│ Brand (LEPODER) + collapse toggle   │  L233-273
├─────────────────────────────────────┤
│ TOP-PINNED (always visible)         │
│   • Dashboard                        │  L277-283
│   • AI Hub                           │  L284-290
├─────────────────────────────────────┤
│ ACCORDION GROUPS (one open at time) │  L293-343
│                                      │
│ ▼ Productivity                       │  L62-71
│     Mail · Todo List · OneNote ·     │
│     Bookmarks (DEAD LINK)            │
│                                      │
│ ▶ Infrastructure                     │  L72-81
│     Tailscale · Local · VPS · Remote │
│                                      │
│ ▶ Development                        │  L82-105
│     Projects · Amonis Finance ·      │
│     Insights · Agents                │
│                                      │
│ ▶ Manage (admin only)                │  L106-143
│     Services · Agents · Recurring ·  │
│     MCP audit · Skills · Reports     │
├─────────────────────────────────────┤
│ BOTTOM-PINNED                        │  L347-378
│   • Help · Settings · Sign Out       │
└─────────────────────────────────────┘
```

Accordion state persists in `localStorage[sidebar.openGroup]` (`MainSidebar.tsx:153`, `:201-208`); the group containing the current page always wins on navigation (`:179-198`).

### 3.2 Split-concern problems

| Concern | Symptom |
|---|---|
| **AI Hub vs Agents** | `/ai` is top-pinned as a peer of Dashboard (`MainSidebar.tsx:284-290`), while `/agents` lives inside "Development" (`:99-103`). Both are conversational/agent surfaces; their split confuses the user about where to dispatch tasks. |
| **Productivity vs Mission Control** | "Productivity" mixes a generic todo list, OneNote (cloud notebook), Mail (cloud inbox), and a *broken* Bookmarks link. There is no "Mission Control / today's surface" — the dashboard tries to fill that role but is reachable only via the top-pinned Dashboard item. |
| **Amonis sub-app in "Development"** | `/amonis` (`MainSidebar.tsx:92-96`) is a self-contained personal-finance app with its own task system (`AmonisTask` in `prisma/schema.prisma:447-486`). Grouping it under "Development" alongside the Projects/Agents tooling buries it. |
| **Insights = market research** | `/insights` (`MainSidebar.tsx:97`) is a Reddit-scraping competitor-research tool (`src/app/insights/page.tsx:26-60`). It is neither a developer tool nor an analytics dashboard. The label "Insights" is too generic to convey "Reddit market research". |
| **Manage vs Settings** | Admin tools split across `/admin/*` (under "Manage" group) and `/settings` (bottom-pinned). User-level settings and admin settings should be visually disambiguated. |

### 3.3 Items with no sidebar entry but with backing data

| Entity | Model | API | Sidebar item? |
|---|---|---|---|
| Bookmarks | `Bookmark` (schema:304) | `/api/bookmarks` | Link present, **page missing** |
| Notes | `AiNote` (schema:257) | `/api/ai/notes` | None (buried in `/ai` tab) |
| Urgent items | `UrgentItem` (schema:319) | `/api/webhook/urgent` | None (only a widget) |
| Cross-project tasks | `Task` (schema:527) | `/api/ai-hub/tasks` | None |
| Activity feed | `Activity` (schema:147) | `/api/activity` | None (only a widget) |
| AI memories | `AiMemory` (schema:287) | implicit via MCP | None |
| Calendar | (Microsoft Graph available) | None wired | None |

### 3.4 Mixed-language UI

The portal is bilingual on the same screen. Examples:

- `src/app/dashboard/page.tsx:99` — `confirm('Supprimer ce service ?')`
- `src/app/dashboard/page.tsx:294` — admin-section "Ajouter" button next to English section headings
- `src/app/dashboard/page.tsx:321` — `<p className="text-lg">Aucun service trouvé</p>`
- `src/app/dashboard/page.tsx:328`, `:345`, `:348` — "Nouveau service", "Ajouter un service"
- `src/app/projects/page.tsx:36-39` — French status labels: "Actif", "En pause", "Terminé", "Archivé"
- `src/app/projects/page.tsx:118`, `:120`, `:129` — "Projets", "Documentation et suivi des projets", "Nouveau projet"
- `src/app/projects/page.tsx:180-194` — "Aucun projet", "Commencez par créer votre premier projet…", "Créer un projet"
- `src/app/projects/page.tsx:238` — `toLocaleDateString('fr-FR')` hard-coded

In contrast, the entire `MainSidebar.tsx`, `src/app/todos/page.tsx`, and `src/app/onenote/page.tsx` are English-only. A user toggling between Projects and Todos sees the language flip.

---

## 4. Part C — Proposed IA

Five top-pinned action surfaces + four collapsible groups + bottom utilities.

### 4.1 Top-pinned action strip (new)

```
┌─────────────────────────────────────┐
│ [⌘K  Search]  [⌘N  Capture]  [🔔 3] │   pinned, always visible
└─────────────────────────────────────┘
```

- **⌘K Search** — broadens `CommandPalette` to query a new `/api/search` endpoint that hits Todos, Notes, Bookmarks, Projects, Tasks, UrgentItems, Services in parallel. Keep `⌘K` shortcut (`CommandPalette.tsx:78`).
- **⌘N Quick Capture** — new modal that asks "Note · Todo · Idea · Urgent · Bookmark?", then a single textarea + tag chips. Routes to the right API based on the choice.
- **🔔 Urgent badge** — count of `UrgentItem.where(done=false)` plus failed `Task.status='failed'`. Click opens `/inbox`.

### 4.2 Sidebar groups (proposal)

| Section | Items | Replaces |
|---|---|---|
| **Mission Control** | Dashboard · Inbox (new, `/inbox`) · Activity (new, `/activity`) · Tasks (new, `/tasks`) | top-pinned Dashboard alone |
| **Life Org** | Todos · Notes (new, `/notes`) · Ideas (new, `/ideas`) · Bookmarks (FIX dead link) · Calendar (new, Microsoft Graph) | most of "Productivity" |
| **Work** | Projects · Amonis Finance · AI Hub · Agents | "Development" + AI Hub + Amonis |
| **Comms & Cloud** | Mail · OneNote · Insights (rename → "Market Research") | rest of "Productivity" |
| **Services & Infra** | Tailscale · Local Services · VPS Servers · Remote Desktop | "Infrastructure" |
| **Admin** (admin-only) | Manage services · Manage agents · Recurring tasks · MCP audit · Skills hub · Reports | "Manage" |

Bottom-pinned stays: Help · Settings · Sign Out.

### 4.3 Why five groups, not three

The current 4-group accordion + 2 top-pinned items = 6 surface concepts. Five groups + 3 top-pinned actions = 8 concepts but the action strip is muscle-memory (⌘K, ⌘N) and the urgent badge is a glanceable signal, not a click target requiring scanning. Cognitive load drops because **each group has a single coherent verb**: *manage today (Mission Control)*, *organise life (Life Org)*, *do project work (Work)*, *check comms (Comms & Cloud)*, *check machines (Services & Infra)*.

---

## 5. Part D — UX friction points

Concrete observations, each with evidence.

### 5.1 Project detail is a doc viewer, not a workspace

Already covered in depth in `03-architecture-projects.md`. UX impact: project card on `/projects` shows a task badge (`src/app/projects/page.tsx:243-247`) → user clicks expecting a task list → lands on a GitHub/Notes/README tab switcher with **no task surface at all**. Broken expectation.

### 5.2 Tasks have no UI surface

`Task` is the richest model in the schema (60+ lines, `prisma/schema.prisma:527-586`) with cost tracking, parent/child orchestration, review states, and PR/commit results. Yet **no route renders a task list**. Users learn about a task only via the AI Hub dispatch flow.

### 5.3 No quick-capture

The only way to add a todo is to navigate to `/todos`, click "Add Task" (`src/app/todos/page.tsx:170`), open the form, choose a category dropdown, type, submit. Five clicks/keystrokes for one idea. No keyboard shortcut. No way to capture from another page. Compare with `⌘K` for search (one shortcut).

### 5.4 Accordion hides context

`MainSidebar.tsx:200-208` collapses other groups when one is opened. While navigating, the user cannot scan all sections at once — they must click open each group to remember what is inside. On a desktop with 900px of vertical real estate this is a regression from a flat list. Mitigation: an "expand all" toggle, or switch to permanently-open headers when viewport height > 800px.

### 5.5 Mixed languages

Listed in §3.4. UX impact: French is used only for projects and service CRUD; everything else is English. A user invited to the portal will hesitate which language to write a project description in.

### 5.6 No notification badge

The sidebar has zero counters or dots. Failed agent tasks, unresolved urgent items, and unread mail are all invisible from the nav. The user must visit each page to discover state changes. Adding a single `<NavBadge count={…} />` slot to `SidebarLink` (`MainSidebar.tsx:392`) would fix this for every item.

### 5.7 Command palette is service-only

`CommandPalette.tsx:17-26` defines 8 hard-coded pages and merges in `/api/services` results (`:37-42`). Cannot find a todo by title, an urgent item by snippet, a project by slug, or a note by tag. The empty-state copy ("No results found for…") is therefore deceptive — it implies the search was broad.

### 5.8 No timezone or locale awareness

`src/app/projects/page.tsx:238` hard-codes `'fr-FR'` for date formatting. `src/app/todos/page.tsx` and `src/app/mail/page.tsx:38-49` use the browser default. Inconsistent.

### 5.9 Dashboard mixes "today" with "everything"

Dashboard renders widgets (Weather, Markets, UrgentInbox, ActivityFeed, Outlook, OneNote, Tailscale) **plus** the entire service catalogue grouped by section (`src/app/dashboard/page.tsx:282-317`). Two purposes — "what is happening" and "launch a service" — are stacked vertically without a visual break. Scroll depth on a fresh login is ~3500px on desktop.

---

## 6. Part E — Mobile audit (light)

What exists:

- Mobile menu trigger fixed top-left, hidden when sheet is open (`MainSidebar.tsx:214-224`).
- Off-canvas sidebar slides in on `mobileOpen` toggle with translucent backdrop (`MainSidebar.tsx:226-232`, `:382-387`).
- Dashboard has a dedicated 2-row mobile header (title row + full-width search row) and a `MobileActionsMenu` bottom-sheet for secondary actions (`src/app/dashboard/page.tsx:141-164`, `:441-566`) — body-scroll lock, account header, email shortcuts, MCP tools.
- Floating admin FAB at `bottom-5 right-5` on dashboard (`src/app/dashboard/page.tsx:336-350`), 56×56 px (meets 44 px guideline).

What is missing for "on-the-go capture":

- **No global FAB** outside the dashboard's admin-only one. The most common mobile action — "I just thought of something, capture it" — has no entry point.
- **No bottom-sheet capture pattern reused** outside dashboard. The pattern at `:441-566` is reusable but currently a one-off.
- **Sidebar items use `h-3.5 w-3.5` icons** (`MainSidebar.tsx:66-69` etc.), which together with `text-xs` labels and `py-2` padding land each touch target around 32 px — **below the 44 px guideline** for mobile.
- **No swipe-to-complete** on the todo list (`src/app/todos/page.tsx:329-401`). Edit/delete buttons are 28 px (`p-1.5`).
- **No haptics or pull-to-refresh.**

---

## 7. Quick Wins (under 1 hour each)

| # | Win | Files | Effort |
|---|---|---|---|
| 1 | Remove the dead `/bookmarks` link or stub a placeholder page that lists `Bookmark` rows from the existing API. | `src/components/layout/MainSidebar.tsx:69` + new `src/app/bookmarks/page.tsx` (~80 lines) | 30 min |
| 2 | Rename "Insights" → "Market Research" so the label is honest about what it does. | `MainSidebar.tsx:97` | 1 min |
| 3 | Move `/ai` out of top-pinned into a "Work" group; promote a (new) `/inbox` to top-pinned alongside Dashboard. | `MainSidebar.tsx:284-290` | 5 min |
| 4 | Add an `<UrgentBadge>` slot to `SidebarLink` and wire it on the new `/inbox` item. Count comes from `/api/webhook/urgent?count=true`. | `MainSidebar.tsx:392-436` | 45 min |
| 5 | Unify language: translate the projects page + dashboard French strings to English (or vice-versa) and remove the hard-coded `'fr-FR'` locale. | 8 specific lines listed in §3.4 | 30 min |
| 6 | Bump sidebar item touch targets from `py-2` to `py-2.5` and icons from `h-3.5 w-3.5` to `h-4 w-4` for mobile — passes 44 px guideline. | `MainSidebar.tsx:66-141`, `:426` | 15 min |
| 7 | Add a "View all" link inside `UrgentInboxWidget` pointing to (future) `/inbox`. | `src/components/widgets/UrgentInboxWidget.tsx` | 10 min |
| 8 | Add `/notes` redirect to `/ai?tab=notes` so the entity is at least addressable. | new `src/app/notes/page.tsx` (~10 lines) | 10 min |

---

## 8. Bigger Bets

| # | Bet | Why | Effort |
|---|---|---|---|
| 1 | **Global Quick Capture (⌘N)** — modal with entity picker (Note · Todo · Idea · Urgent · Bookmark), single textarea, one submit. Mounted globally in `ClientProviders.tsx` alongside `CommandPalette`. | Highest-leverage feature for a personal portal; one shortcut replaces five clicks. | 1–2 days |
| 2 | **Cross-entity global search (`/api/search`)** — backend route that runs parallel Prisma queries across Todo/AiNote/Bookmark/Project/Task/UrgentItem/Service and returns a typed, ranked result list. Wire into `CommandPalette` replacing the current service-only filter. | Makes the ⌘K shortcut actually useful; turns the portal into a searchable knowledge base. | 2–3 days |
| 3 | **Dedicated `/inbox` page** — full-screen view of all `UrgentItem` rows with snooze, mark-done, bulk-actions, filter by source/priority. Replaces the cramped widget. Plus push `Activity` feed in a side panel. | Surfaces the "command-centre" promise the widget hints at. | 2 days |
| 4 | **Dedicated `/tasks` page** — cross-project task queue (group by project, filter by status, sort by priority/cost). Reuse existing `/api/ai-hub/tasks/`. | Closes the biggest model-to-UI gap (`Task` is 60 fields with zero list view). | 2 days |
| 5 | **Calendar surface** — wire Microsoft Graph `/me/calendar`, render a week view at `/calendar`. Surface upcoming events on the dashboard alongside UrgentInbox. | Microsoft account is already connected for Mail + OneNote; calendar is the obvious next slot. | 3 days |
| 6 | **Mission Control restructure** — apply the §4.2 sidebar grouping. Includes a "compact / expanded" sidebar toggle for users with >800 px height that shows all groups open. | Resolves the §5.4 accordion problem and the §3.2 split-concern problems. | 1 day |
| 7 | **Notes/Ideas split** — promote `AiNote` to a first-class `/notes` page with tag filtering, and add an `Idea` model + `/ideas` triage page (one-tap "promote to todo" / "promote to project" / "archive"). | Distinguishes capture from action — the missing layer in any GTD system. | 3–4 days (incl. schema migration) |
| 8 | **Persistent notification system** — small `useNotifications()` hook + `Bell` icon in sidebar showing aggregate count (urgent items + failed tasks + unread mail). Click opens a slide-over panel. | Closes §5.6. Reusable across the app. | 2 days |

---

## 9. Pre-delivery checklist

- [x] Read-only audit; no source files modified.
- [x] Every claim cites file:line.
- [x] Does not duplicate `03-architecture-projects.md` (projects deep-dive) or `02-architecture-core.md` (core architecture).
- [x] Five sections A–E plus Quick Wins (§7) and Bigger Bets (§8).
- [x] ~400 lines (this file).
- [x] Uses portal vocabulary (Mission Control, Life Org, Urgent Inbox) consistent with the codebase.
