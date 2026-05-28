# LEPODER Portal — Memory

> **This is the first memory file of the portal project.** It captures who
> the portal is, where the "development section" is going, and the vision
> Sebastien described on 2026-05-28. It is the reference doc we build against.

The portal's long-term goal is to become an **agentic OS**: a single place
where Sebastien manages many projects, gives them direction, dispatches
tasks to AI agents, and keeps a living memory of each project's purpose —
all from one cohesive development workspace.

---

## How memory works (the convention this file establishes)

Memory lives as editable Markdown files, surfaced and editable in the UI.
Two levels:

**Portal level** — `memory/`
- `memory/PORTAL.md` — this file: what the portal is + the roadmap.
- `memory/AI.md` — who the AI assistant is: identity, tone, behaviour, house rules.
- `memory/USER.md` — who Sebastien is: preferences, context, working style.

**Project level** — `projects/<slug>/MEMORY.md`
- One per project: what the project is, the goal, where we're going, current
  focus, decisions, constraints.

The AI assistant reads the portal-level files on every conversation, and the
active project's `MEMORY.md` when a project is selected, so it always has
context. (The older key/value `AiMemory` store remains for quick machine-written
facts — see "Open decisions".)

---

## The vision for the Development section

Everything below is the target state. "Today" = what exists now; "Target" =
what Sebastien asked for.

### 1. GitHub repositories: auto-sync + classify
- **Today:** `src/lib/github.ts` only does per-repo lookups. Projects are
  created manually in the admin UI. There is no "list all my repos."
- **Target:** Every GitHub repo on the account appears in the portal
  automatically. New repos show up without manual entry (kept in sync). Each
  repo can be classified — e.g. **active / archived / imposed / ignored** — so
  Sebastien can triage which ones become directed projects and which are parked.

### 2. One unified project page (projects + management merged)
- **Today:** `/projects` is a read view; `/admin/projects` is a separate CRUD
  page under the "Manage" section.
- **Target:** The Development → Projects page contains **everything**: the
  project list/detail **and** the management options (create, edit settings,
  repo binding, write permission, status, secrets) — no need to jump to the
  Manage section.

### 3. Tasks separated by project
- **Today:** `/agents` (Tasks) lists tasks grouped by project; the dispatcher
  has a project dropdown. The API already supports `?projectId=` filtering.
- **Target:** A clear **project selector** on the Tasks page. Pick a project →
  see only that project's tasks. Switch projects to switch the view. No more
  everything-at-once.

### 4. File-based memory (portal + per-project)
- **Today:** `AiMemory` is a per-user key/value store (PR #90), editable at
  `/memory`. The chat injects it into the system prompt.
- **Target:** Editable **`.md` files** as described in the convention above.
  Portal identity (AI + user) plus a `MEMORY.md` per project describing its
  purpose and direction. The AI loads these for context.

### 5. AI Hub available everywhere (global resizable side panel)
- **Today:** `AiChatPanel` is mounted in the dashboard side panel and on the
  dedicated `/ai` page only.
- **Target:** An **AI Hub icon top-right on every page**. Click it → a side
  panel opens that can be **resized (bigger/smaller)** and stays open while
  Sebastien keeps browsing the current page. The dedicated `/ai` page stays
  for full-screen use.

### 6. Project context in the conversation
- **Target:** When starting a conversation, optionally **select a project** so
  the AI understands the context (loads that project's `MEMORY.md`/docs). If
  left on default, the AI asks which project — or stays general — depending on
  the question.

### 7. Project to-do list (quick capture, project-aware)
- **Today:** `Todo` is user-scoped only — **no project link**.
- **Target:** Todos gain a **project** association. Quick-capture is easily
  reachable from the project navigation pages, and from the to-do view itself
  Sebastien can **switch the target project** — so a stray thought about
  Project B can be captured instantly while working on Project A.

### 8. Simplified navigation
- **Target:** Streamline the Development section so it's easy to understand —
  fold the management bits in, group related things, reduce duplicate entries.

---

## Resolved decisions (2026-05-28)

1. **Memory: files primary, keep K/V.** Markdown files (`PORTAL`/`AI`/`USER` +
   per-project `MEMORY.md`) hold the narrative identity & goals and are what
   Sebastien edits. The key/value `AiMemory` store stays for quick facts the AI
   writes to itself mid-chat. Both are injected into context.
2. **GitHub sync: scheduled poll + manual button.** Reuse the recurring-task
   scheduler to re-sync on an interval, plus a "Sync now" button. No webhook.
3. **Every repo is a project.** Sync auto-creates a `Project` row per repo;
   classification (active / archived / imposed / …) is a status on the project.
4. **Build order:** follow the proposed order below, starting with file memory.

_(Still to confirm when we reach it: whether to remove `/admin/projects`
entirely once `/projects` absorbs management, or keep it as an alias.)_

---

## Build order (proposed)

A phase per PR, smallest-useful-first:

1. **File memory** — `memory/*.md` + `projects/<slug>/MEMORY.md`, editor UI,
   chat injection. (Foundation; everything else benefits from project context.)
2. **Global AI Hub side panel** — mount once at the layout level, toggle from a
   top-right icon, resizable + persistent, with the per-conversation project
   selector.
3. **Unified projects page** — fold admin CRUD into `/projects`.
4. **Tasks project selector** — filter the Tasks view by selected project.
5. **GitHub repo sync + classification** — enumerate repos, store + classify,
   keep in sync.
6. **Project-aware todos** — add project to todos + quick capture with switcher.
7. **Navigation cleanup** — simplify the Development group.

---

_Last updated: 2026-05-28 — initial vision captured from Sebastien._
