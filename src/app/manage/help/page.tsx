'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  HelpCircle,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react';

type Section = { id: string; label: string };
type Topic = { id: string; label: string; sections: Section[] };

const TOPICS: Topic[] = [
  {
    id: 'agents',
    label: 'Agents',
    sections: [
      { id: 'agents-overview', label: 'Overview' },
      { id: 'agents-dispatching', label: 'Dispatching a task' },
      { id: 'agents-read-only-vs-write', label: 'Read-only vs write-enabled' },
      { id: 'agents-starting-the-worker', label: 'Starting the worker' },
      { id: 'agents-troubleshooting', label: 'Troubleshooting' },
      { id: 'agents-reference', label: 'Agents reference' },
      { id: 'agents-task-routing', label: 'How auto-match works' },
      { id: 'agents-capabilities', label: 'What the agent can/can’t do' },
      { id: 'agents-mcp-tool', label: 'MCP tool: dispatch_to_project' },
      { id: 'agents-environment', label: 'Environment variables' },
    ],
  },
  {
    id: 'onepassword',
    label: '1Password',
    sections: [
      { id: 'onepassword-overview', label: 'Overview' },
      { id: 'onepassword-prerequisites', label: 'Prerequisites' },
      { id: 'onepassword-connect-setup', label: 'Setting up a Connect server' },
      { id: 'onepassword-access-token', label: 'Generating an access token' },
      { id: 'onepassword-linking', label: 'Linking the portal' },
      { id: 'onepassword-mapping', label: 'Mapping secrets to project env vars' },
      { id: 'onepassword-worker', label: 'How the worker uses the secrets' },
      { id: 'onepassword-security', label: 'Security model' },
      { id: 'onepassword-troubleshooting', label: 'Troubleshooting' },
    ],
  },
];

const ALL_SECTION_IDS = TOPICS.flatMap((t) => t.sections.map((s) => s.id));

export default function HelpCenterPage() {
  const { user, loading, logout } = useAuth();
  const [active, setActive] = useState<string>(TOPICS[0]!.sections[0]!.id);

  // Admin-only guard.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = '/login';
      return;
    }
    if (user.role?.toLowerCase() !== 'admin') {
      window.location.href = '/dashboard';
    }
  }, [loading, user]);

  // Initial active section from URL hash.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = window.location.hash.replace(/^#/, '');
    if (h && ALL_SECTION_IDS.includes(h)) {
      setActive(h);
      // Defer to allow content to mount before scrolling.
      requestAnimationFrame(() => {
        document.getElementById(h)?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    }
  }, []);

  // Scroll-spy: find the deepest section whose top is above 120px.
  useEffect(() => {
    const container = document.getElementById('help-scroll');
    if (!container) return;
    const handler = () => {
      let current = ALL_SECTION_IDS[0]!;
      for (const id of ALL_SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120) current = id;
      }
      setActive(current);
    };
    handler();
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, []);

  const activeTopic = useMemo(
    () => TOPICS.find((t) => t.sections.some((s) => s.id === active))?.id,
    [active]
  );

  if (loading || !user || user.role?.toLowerCase() !== 'admin') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-6 w-6 animate-spin text-portal-accent" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />
      <div id="help-scroll" className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center gap-3 mb-6 pl-12 sm:pl-0">
            <Link
              href="/dashboard"
              className="p-2 text-portal-muted hover:text-portal-text rounded-md transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
              title="Back to dashboard"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-portal-accent" />
                Help center
              </h1>
              <p className="text-sm text-portal-muted">
                Documentation for the portal’s admin features
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* TOC */}
            <nav className="lg:col-span-3 hidden lg:block">
              <div className="sticky top-4 bg-portal-card border border-portal-border rounded-xl p-3 space-y-3">
                {TOPICS.map((topic) => (
                  <div key={topic.id}>
                    <div className="text-[10px] uppercase tracking-wider px-2 py-1 font-semibold text-portal-muted flex items-center gap-1.5">
                      {topic.label}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {topic.sections.map((s) => (
                        <a
                          key={s.id}
                          href={`#${s.id}`}
                          className={
                            'block px-2 py-1.5 rounded text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent ' +
                            (active === s.id
                              ? 'text-portal-accent bg-portal-accent/10'
                              : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover')
                          }
                        >
                          {s.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </nav>

            {/* Content */}
            <article className="lg:col-span-9 prose prose-invert prose-sm max-w-none prose-headings:scroll-mt-24 prose-headings:text-portal-text prose-p:text-portal-text-dim prose-li:text-portal-text-dim prose-strong:text-portal-text prose-a:text-portal-accent hover:prose-a:underline prose-code:text-portal-accent prose-code:bg-portal-card prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-portal-border">

              {/* =================================================== */}
              {/* AGENTS TOPIC                                         */}
              {/* =================================================== */}
              <TopicHeading id="agents-topic" label="Agents" first />

              <Section id="agents-overview" title="Overview">
                <p>
                  The Agent Dispatch system lets you assign development tasks to specialized AI
                  workers. You describe a task from the AI Hub or the <a href="/agents">Agents</a>{' '}
                  page; the system picks (or you pick) an agent profile; a headless worker clones
                  the target GitHub repo and runs Claude with that agent’s system prompt to
                  make the change; the result lands as a commit, a PR, or a written summary.
                </p>
                <p>
                  The portal and the worker are two processes that share one database. The portal
                  is the dashboard; the worker is the muscle. Without the worker running, tasks
                  sit in <code>pending</code> forever.
                </p>
              </Section>

              <Section id="agents-dispatching" title="Dispatching a task">
                <ol>
                  <li>
                    Open <a href="/agents">/agents</a> and click <strong>New task</strong>.
                  </li>
                  <li>
                    <strong>Project</strong> — pick the repo. Configure projects in{' '}
                    <a href="/admin/projects">Admin → Projects</a>.
                  </li>
                  <li>
                    <strong>Agent</strong> — leave on “Auto” to let expertise tags pick
                    the agent, or choose explicitly.
                  </li>
                  <li>
                    <strong>Title</strong> — short imperative (e.g. “Add search bar to
                    dashboard”).
                  </li>
                  <li>
                    <strong>Description</strong> — detailed instructions. The agent receives this
                    verbatim.
                  </li>
                  <li>
                    <strong>Priority</strong> — workers pick urgent first, then high, normal, low.
                  </li>
                  <li>Click <strong>Dispatch</strong>.</li>
                </ol>
                <p>
                  The task appears in the queue with status <code>pending</code>. When a worker
                  picks it up it moves to <code>in_progress</code>, then <code>completed</code> or{' '}
                  <code>failed</code>. Click any task to see live logs.
                </p>
              </Section>

              <Section id="agents-read-only-vs-write" title="Read-only vs write-enabled projects">
                <p>
                  Every project is one of two modes. Toggle the mode from{' '}
                  <a href="/admin/projects">Admin → Projects</a> by clicking the badge next to the
                  project name.
                </p>
                <div className="not-prose grid sm:grid-cols-2 gap-3 my-4">
                  <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-300 font-medium text-sm mb-2">
                      <Lock className="h-4 w-4" /> Read-only (default)
                    </div>
                    <p className="text-portal-text-dim text-sm m-0">
                      The agent clones the repo, reads files, runs commands locally in its
                      workdir, and produces a written summary. <strong>No commits, no pushes, no
                      PRs.</strong> Safe to dispatch to anything.
                    </p>
                  </div>
                  <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-yellow-300 font-medium text-sm mb-2">
                      <Unlock className="h-4 w-4" /> Write enabled
                    </div>
                    <p className="text-portal-text-dim text-sm m-0">
                      The agent commits its changes on a per-task branch{' '}
                      (<code>agent/&lt;id&gt;-&lt;timestamp&gt;</code>), pushes, and opens a pull
                      request against <code>workingBranch</code>. Requires{' '}
                      <code>GITHUB_TOKEN</code> in the worker’s environment.
                    </p>
                  </div>
                </div>
                <p>
                  <strong>How to enable write:</strong> on{' '}
                  <a href="/admin/projects">Admin → Projects</a>, click the blue{' '}
                  <code>read-only</code> badge — it becomes a yellow <code>write enabled</code>{' '}
                  badge after confirmation. You can also flip it inside the edit form (pencil
                  icon → “Allow worker to commit/push” checkbox).
                </p>
                <p>
                  <strong>Recommendation:</strong> keep projects read-only until you’ve
                  watched a few tasks succeed end-to-end and trust the agent. The first few should
                  be code reviews / summaries.
                </p>
              </Section>

              <Section id="agents-starting-the-worker" title="Starting the worker">
                <p>
                  The portal does not run the worker. It’s a separate Node.js process that
                  polls the database. If no worker is running, you’ll see the yellow banner
                  on <a href="/agents">/agents</a>:
                </p>
                <div className="not-prose bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 rounded-lg px-4 py-3 my-3 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-yellow-300" />
                  <div className="text-sm">
                    <div className="font-medium text-yellow-100">No worker is running.</div>
                    <div className="text-yellow-200/80">
                      Tasks will sit in <span className="font-mono">pending</span> until a worker
                      picks them up.
                    </div>
                  </div>
                </div>

                <h3>Production (Docker Compose)</h3>
                <p>
                  After deploying a new build, the <code>portal-worker</code> service needs to be
                  rebuilt and started:
                </p>
                <pre><code>{`docker compose build portal-worker
docker compose up -d portal-worker

# Watch the logs
docker compose logs -f portal-worker

# Check it's alive
docker compose ps portal-worker`}</code></pre>
                <p>
                  The worker reads <code>ANTHROPIC_API_KEY</code> and <code>GITHUB_TOKEN</code>{' '}
                  from your <code>.env</code> file (mounted via{' '}
                  <code>env_file: .env</code> in <code>docker-compose.yml</code>). Make sure both
                  are set there.
                </p>

                <h3>Local development</h3>
                <p>
                  Run the worker in a second terminal alongside <code>npm run dev</code>:
                </p>
                <pre><code>{`# Terminal 1 — portal
npm run dev

# Terminal 2 — worker
ANTHROPIC_API_KEY=sk-ant-... \\
GITHUB_TOKEN=ghp_... \\
DATABASE_URL="file:./dev.db" \\
npm run worker`}</code></pre>
                <p className="text-yellow-300">
                  <strong>Important:</strong> the worker must use the <em>same</em>{' '}
                  <code>DATABASE_URL</code> as the portal. If the portal writes to{' '}
                  <code>./dev.db</code> and the worker connects to <code>./prisma/dev.db</code>,
                  they’re looking at different databases and the task will sit forever.
                </p>

                <h3>Verifying it picked up the task</h3>
                <p>Once the worker boots, you should see in its logs:</p>
                <pre><code>{`[worker] Starting "portal-worker-1" (concurrency=1, poll=5000ms, ...)
[worker] Picked up task <id> (in-flight=1)
[<timestamp>] [<task-id>] [info] Worker "portal-worker-1" starting task: ...
[<timestamp>] [<task-id>] [info] Cloning sebastienlepoder/Seb-Portal ...`}</code></pre>
                <p>
                  Reload <a href="/agents">/agents</a> — the task should switch from{' '}
                  <code>pending</code> to <code>in_progress</code> within ~5s, and you can click
                  it to follow live logs.
                </p>
              </Section>

              <Section id="agents-troubleshooting" title="Troubleshooting">
                <h3>Task stuck on “pending”</h3>
                <p>
                  The worker isn’t running, or it’s connected to a different database.
                  See <a href="#agents-starting-the-worker">Starting the worker</a> above. The yellow
                  banner on <a href="/agents">/agents</a> confirms this.
                </p>

                <h3>Task fails immediately with “ANTHROPIC_API_KEY not set”</h3>
                <p>
                  The worker process doesn’t see your API key. For Docker, check the key is
                  in <code>.env</code> and restart with <code>docker compose up -d --force-recreate portal-worker</code>. For local dev, export it
                  in the same shell where you run <code>npm run worker</code>.
                </p>

                <h3>“Project has no repoOwner/repoName configured”</h3>
                <p>
                  Open <a href="/admin/projects">Admin → Projects</a>, click the pencil on the
                  project, fill in <strong>Owner</strong> (e.g. <code>sebastienlepoder</code>) and{' '}
                  <strong>Repo name</strong> (e.g. <code>amonis</code>), and save.
                </p>

                <h3>Cloning a private repo fails</h3>
                <p>
                  Set <code>GITHUB_TOKEN</code> in the worker’s environment with{' '}
                  <code>repo</code> scope. Public repos clone without a token.
                </p>

                <h3>PR creation fails but commit succeeded</h3>
                <p>
                  The branch was pushed but the GitHub API rejected the PR (usually because{' '}
                  <code>GITHUB_TOKEN</code> lacks <code>pull_requests: write</code>, or the
                  default branch protection rejects it). The task is recorded with the commit URL
                  and a note. Re-create the PR manually from the GitHub UI.
                </p>

                <h3>Agent ran for 5 minutes and was killed</h3>
                <p>
                  Default per-task timeout is <code>WORKER_TIMEOUT_MS=300000</code> (5 min). For
                  larger tasks, raise it on the worker. Most failures aren’t timeouts —
                  check the task’s logs first.
                </p>

                <h3>Worker is running but stale tasks pile up</h3>
                <p>
                  If a worker dies mid-task the row stays as <code>in_progress</code>. Every tick
                  the worker reaps any task whose <code>workerStartedAt</code> is older than{' '}
                  <code>2 × WORKER_TIMEOUT_MS</code> and marks it <code>failed</code>. You can
                  also <strong>Cancel</strong> a task manually from the task detail modal.
                </p>
              </Section>

              <Section id="agents-reference" title="Agents reference">
                <p>
                  Edit any agent’s system prompt at{' '}
                  <a href="/admin/agents">Admin → Agents</a>. The default seeded set:
                </p>
                <div className="not-prose overflow-x-auto">
                  <table className="text-sm w-full border border-portal-border rounded-lg">
                    <thead className="bg-portal-card-hover/50">
                      <tr>
                        <th className="text-left p-2 border-b border-portal-border text-portal-text">Slug</th>
                        <th className="text-left p-2 border-b border-portal-border text-portal-text">Name</th>
                        <th className="text-left p-2 border-b border-portal-border text-portal-text">Use for</th>
                      </tr>
                    </thead>
                    <tbody className="text-portal-text-dim">
                      <Row slug="ui-ux-pro-max" name="Pixel" use="Visual / interaction / a11y" />
                      <Row slug="architecture-expert" name="Archer" use="Refactors, type safety, module boundaries" />
                      <Row slug="backend-engineer" name="Beck" use="API routes, Prisma queries, server logic" />
                      <Row slug="budgeting-specialist" name="Budgie" use="Amonis Finance budget / numerics" />
                      <Row slug="security-auditor" name="Sentry" use="Auth, CSRF, validation, secrets" />
                      <Row slug="database-expert" name="Doris" use="Schema, migrations, indexes" />
                      <Row slug="test-engineer" name="Tess" use="Unit + integration tests" />
                      <Row slug="bug-hunter" name="Hunter" use="Reproduce + minimal fix + regression test" />
                      <Row slug="devops" name="Otto" use="Docker, compose, env, deploy" />
                      <Row slug="integration-specialist" name="Iris" use="Third-party APIs, OAuth, webhooks" />
                      <Row slug="code-reviewer" name="Rex" use="Read-only diff review + findings list" />
                      <Row slug="docs-writer" name="Penn" use="README, CHANGELOG, doc comments" />
                      <Row slug="perf-engineer" name="Velo" use="Bundle / query / render optimization" />
                    </tbody>
                  </table>
                </div>
                <p>
                  Disable an agent (uncheck <strong>Active</strong>) to remove it from auto-match
                  and from the dispatch dropdown without deleting its config.
                </p>
              </Section>

              <Section id="agents-task-routing" title="How auto-match works">
                <p>
                  When you leave the <strong>Agent</strong> field on “Auto”, the system
                  scores every active agent against the task text:
                </p>
                <ul>
                  <li>
                    Each <strong>expertise tag</strong> that appears in the task title +
                    description: <code>+1</code>
                  </li>
                  <li>
                    The <strong>role string</strong> (e.g. “Bug Hunter”) appearing in
                    the text: <code>+2</code>
                  </li>
                  <li>Highest score wins. Ties broken by lowest <code>sortOrder</code>.</li>
                  <li>
                    If nothing matches at all, the lowest-sortOrder active agent is used so the
                    task always has somewhere to go.
                  </li>
                </ul>
                <p>
                  This is intentionally crude. For non-obvious matches, pick the agent
                  explicitly — the dropdown lists every active one.
                </p>
              </Section>

              <Section id="agents-capabilities" title="What the agent can/can’t do">
                <p>
                  The agent runs inside the worker container with these tools, all scoped to the
                  per-task working directory (a fresh clone of the repo):
                </p>
                <ul>
                  <li><code>read_file(path)</code> — up to 50,000 chars</li>
                  <li><code>write_file(path, content)</code> — overwrites; creates dirs</li>
                  <li><code>list_directory(path)</code> — one entry per line, dirs end in <code>/</code></li>
                  <li>
                    <code>run_bash(command)</code> — full shell, 60s timeout per call. Used for{' '}
                    <code>grep</code>, <code>find</code>, <code>npm test</code>,{' '}
                    <code>tsc --noEmit</code>, etc.
                  </li>
                  <li><code>finish(summary)</code> — ends the run with a summary</li>
                </ul>
                <p>
                  The agent <strong>cannot</strong>:
                </p>
                <ul>
                  <li>Escape the workdir (every path is validated against the clone root)</li>
                  <li>Reach the portal’s database or call portal APIs</li>
                  <li>Talk to the host network beyond <code>npm install</code> if the task
                    explicitly runs it (and you should generally not let it)</li>
                  <li>Run <code>xcodebuild</code> or anything Mac-only — the worker is Linux</li>
                  <li>Make commits / pushes / PRs unless <code>allowWrite=true</code> on the project</li>
                </ul>
                <p>
                  Agent runs are bounded by <code>WORKER_TIMEOUT_MS</code> (default 5 min) and{' '}
                  <code>WORKER_MAX_TURNS</code> (default 100 Claude Agent SDK turns).
                </p>
              </Section>

              <Section id="agents-mcp-tool" title="MCP tool: dispatch_to_project">
                <p>
                  The same dispatch entry point is exposed as an MCP tool so the AI Hub’s
                  Claude can invoke it via <code>tool_use</code>. Tool name:{' '}
                  <code>dispatch_to_project</code>. Schema:
                </p>
                <pre><code>{`{
  "project_name": "amonis-finance",      // slug or name (required)
  "task_title": "Add search bar",        // required
  "task_description": "...",             // required, agent receives verbatim
  "agent_role": "ui-ux-pro-max",         // optional: slug, role, or id
  "priority": "normal"                   // optional: low | normal | high | urgent
}`}</code></pre>
                <p>
                  Returns <code>{'{ success, taskId, message, taskUrl }'}</code>. The tool calls
                  the same internal <code>dispatchTask()</code> helper as{' '}
                  <code>POST /api/ai-hub/dispatch-task</code>, so behavior is identical.
                </p>
              </Section>

              <Section id="agents-environment" title="Environment variables">
                <h3>Worker — required</h3>
                <ul>
                  <li>
                    <code>DATABASE_URL</code> — must point at the same SQLite (or other Prisma
                    DB) as the portal. In Docker, both services use{' '}
                    <code>file:/app/data/portal.db</code> via the shared volume.
                  </li>
                </ul>
                <h3>Worker — Claude auth (one of)</h3>
                <ul>
                  <li>
                    <strong>Claude Max OAuth (recommended).</strong> Run <code>claude login</code>{' '}
                    once on a machine with a browser, then copy{' '}
                    <code>~/.claude/.credentials.json</code> into{' '}
                    <code>CLAUDE_CREDS_DIR</code> (default{' '}
                    <code>/data/coolify/lepoder-portal/claude-creds</code>). The worker
                    mounts it read-only at <code>/home/nextjs/.claude</code> and uses your
                    Max subscription instead of paying per-token.
                  </li>
                  <li>
                    <strong>API key fallback.</strong> Set <code>ANTHROPIC_API_KEY</code> (and
                    optionally <code>ANTHROPIC_BASE_URL</code>) — the SDK uses these when no
                    OAuth credentials are mounted. Note: proxies that wrap requests in a
                    Claude Code SDK session (Meridian etc.) won&apos;t work with the worker&apos;s
                    long agent loops.
                  </li>
                </ul>
                <h3>Worker — recommended</h3>
                <ul>
                  <li>
                    <code>GITHUB_TOKEN</code> — required to clone private repos and to open PRs.
                    Needs <code>repo</code> scope.
                  </li>
                </ul>
                <h3>Worker — tunables</h3>
                <ul>
                  <li><code>WORKER_ID</code> — unique id (default <code>hostname-pid</code>)</li>
                  <li><code>WORKER_POLL_INTERVAL_MS</code> — default <code>5000</code></li>
                  <li><code>WORKER_TIMEOUT_MS</code> — per-task hard cap, default <code>300000</code></li>
                  <li><code>WORKER_MAX_TURNS</code> — Claude Agent SDK turn budget per subagent, default <code>100</code></li>
                  <li><code>WORKER_CONCURRENCY</code> — simultaneous tasks per worker, default <code>1</code></li>
                  <li><code>WORKER_DEFAULT_MODEL</code> — fallback when an agent has no model override, default <code>claude-sonnet-4-6</code></li>
                </ul>
                <p>
                  All of these are documented in <code>.env.example</code> and read by the worker
                  on startup. Restart the worker after changing them.
                </p>
              </Section>

              {/* =================================================== */}
              {/* 1PASSWORD TOPIC                                      */}
              {/* =================================================== */}
              <TopicHeading id="onepassword-topic" label="1Password" />

              <Section id="onepassword-overview" title="Overview">
                <p>
                  The 1Password integration lets the portal pull secrets out of a 1Password vault
                  at task-start and inject them into the worker’s environment when it spawns the
                  agent and any sub-processes. The goal is to keep API keys, database URLs, and
                  similar credentials out of the codebase, out of <code>.env</code> files
                  committed by mistake, and out of the portal database.
                </p>
                <p>
                  The portal talks to a self-hosted{' '}
                  <a href="https://developer.1password.com/docs/connect/get-started" target="_blank" rel="noreferrer">
                    1Password Connect server
                  </a>{' '}
                  over HTTP. The access token is encrypted at rest in the portal database using{' '}
                  <code>src/lib/crypto.ts</code> and is never returned by the API after it’s
                  saved.
                </p>
              </Section>

              <Section id="onepassword-prerequisites" title="Prerequisites">
                <ul>
                  <li>A 1Password Business or Teams account with at least one vault.</li>
                  <li>
                    A reachable 1Password Connect server. For most self-hosted setups this means
                    running the two official Docker images (<code>1password/connect-api</code>{' '}
                    and <code>1password/connect-sync</code>) on a host the portal worker
                    container can reach.
                  </li>
                  <li>
                    A <em>Connect access token</em> generated against that Connect server, with
                    permission to read the vaults you intend to map secrets from.
                  </li>
                  <li>
                    Admin access to the portal — only admins can configure the connection or
                    create mappings.
                  </li>
                </ul>
              </Section>

              <Section id="onepassword-connect-setup" title="Setting up a Connect server">
                <p>
                  The simplest, officially-supported way to run Connect is Docker Compose. From
                  the 1Password developer docs, the canonical setup is two services sharing a
                  data volume, both reading the same{' '}
                  <code>1password-credentials.json</code> file that you download when you
                  provision Connect in your 1Password account:
                </p>
                <pre><code>{`# docker-compose.yml
services:
  op-connect-api:
    image: 1password/connect-api:latest
    ports:
      - "8080:8080"
    volumes:
      - ./1password-credentials.json:/home/opuser/.op/1password-credentials.json
      - op-data:/home/opuser/.op/data
    restart: unless-stopped

  op-connect-sync:
    image: 1password/connect-sync:latest
    volumes:
      - ./1password-credentials.json:/home/opuser/.op/1password-credentials.json
      - op-data:/home/opuser/.op/data
    restart: unless-stopped

volumes:
  op-data:`}</code></pre>
                <p>
                  Once running, the Connect API is reachable at <code>http://&lt;host&gt;:8080</code>.
                  The portal needs network access to that URL — if the worker runs in a
                  container, make sure it’s on a Docker network that can reach the Connect
                  container (or use the host’s LAN IP, or put both behind the same reverse proxy).
                </p>
                <p>
                  <strong>Alternative — the <code>op</code> CLI.</strong> For read-only access
                  from a single shell, the official <code>op</code> CLI also works against the
                  same vaults using a service account token. The portal integration, however,
                  speaks the Connect REST API specifically and expects a Connect server URL plus
                  a Connect access token, so the CLI alone is not enough for portal-driven
                  injection.
                </p>
              </Section>

              <Section id="onepassword-access-token" title="Generating an access token">
                <p>
                  Follow the official guide:{' '}
                  <a href="https://developer.1password.com/docs/connect/get-started" target="_blank" rel="noreferrer">
                    1Password Connect — Get started
                  </a>
                  . The short version:
                </p>
                <ol>
                  <li>
                    In your 1Password account, open{' '}
                    <strong>Integrations → Directory → 1Password Connect</strong>.
                  </li>
                  <li>
                    Provision a new Connect server. You’ll receive a{' '}
                    <code>1password-credentials.json</code> file — keep this somewhere safe and
                    mount it into the Connect containers as shown above.
                  </li>
                  <li>
                    Issue a Connect access token, granting it{' '}
                    <strong>read</strong> access to each vault you want the portal to read.
                    Copy the token immediately — 1Password only shows it once.
                  </li>
                </ol>
                <p>
                  The token is a long opaque string. Treat it like any other production
                  credential: do not paste it into chat, do not commit it, and rotate it if
                  exposed.
                </p>
              </Section>

              <Section id="onepassword-linking" title="Linking the portal">
                <ol>
                  <li>
                    Go to <a href="/settings">Settings</a> and scroll to the{' '}
                    <strong>1Password</strong> panel (admin-only).
                  </li>
                  <li>
                    Paste your Connect host URL into <strong>Connect host URL</strong>
                    (e.g. <code>https://op-connect.internal:8080</code>). Both <code>http://</code>{' '}
                    and <code>https://</code> are accepted, but production should use TLS.
                  </li>
                  <li>
                    Paste your token into <strong>Access token</strong>. This field is write-only:
                    after saving, the portal never displays or echoes it back.
                  </li>
                  <li>
                    Optionally set a <strong>Default vault ID</strong> to scope the picker to one
                    vault by default.
                  </li>
                  <li>
                    Click <strong>Save &amp; test</strong>. The portal calls{' '}
                    <code>GET /v1/vaults</code> on the Connect server with the token and only
                    persists the connection if it succeeds.
                  </li>
                </ol>
                <p>
                  Once saved, the panel displays the connect host, the time of the last test, a
                  status badge (green OK / red Failed), a <strong>Test connection</strong>{' '}
                  button, and a <strong>Disconnect</strong> button. The token input is cleared
                  after a successful save.
                </p>
              </Section>

              <Section id="onepassword-mapping" title="Mapping secrets to project env vars">
                <p>
                  A <em>secret mapping</em> tells the worker: “when running a task for project X,
                  read field <code>F</code> on item <code>I</code> in vault <code>V</code>, and
                  inject it as environment variable <code>ENV_NAME</code>.”
                </p>
                <p>To create a mapping, from the 1Password panel in Settings:</p>
                <ol>
                  <li>Pick the target project from the project dropdown.</li>
                  <li>
                    Enter an <strong>env name</strong>. It must match the regex{' '}
                    <code>^[A-Z_][A-Z0-9_]*$</code> — UPPER_SNAKE_CASE only, the same shape POSIX
                    expects for environment variables.
                  </li>
                  <li>Pick the <strong>vault</strong> (populated from Connect).</li>
                  <li>Pick the <strong>item</strong> (populated when a vault is selected).</li>
                  <li>
                    Enter the <strong>field label</strong> — the case-insensitive label of the
                    field on the 1Password item, e.g. <code>password</code>,{' '}
                    <code>credential</code>, or <code>api_key</code>. The portal looks it up by
                    label, not by id, so renaming fields in 1Password Just Works as long as the
                    label stays the same.
                  </li>
                </ol>
                <p>
                  <strong>Example.</strong> To make{' '}
                  <code>STRIPE_API_KEY</code> available to the agent for the{' '}
                  <code>amonis-finance</code> project:
                </p>
                <pre><code>{`Env name:      STRIPE_API_KEY
Vault:         Production
Item:          Stripe API
Field label:   credential`}</code></pre>
                <p>
                  When you submit, the API resolves the field once to make sure it exists and is
                  not empty before saving the row — so if the field label is wrong, you’ll get a
                  validation error immediately rather than a silent miss at task time.
                </p>
              </Section>

              <Section id="onepassword-worker" title="How the worker uses the secrets">
                <p>At the start of each task, the worker calls:</p>
                <pre><code>{`const secrets = await resolveProjectSecrets(projectId);`}</code></pre>
                <p>
                  This walks every <code>ProjectSecretMapping</code> for the task’s project,
                  fetches each field from Connect, and returns a plain{' '}
                  <code>Record&lt;envName, value&gt;</code>. The map is then passed into the
                  spawned tool process via the <code>extraEnv</code> parameter in{' '}
                  <code>worker/task-executor.ts</code>, so the agent (and any sub-process it
                  spawns through <code>run_bash</code>) sees the variables in its{' '}
                  <code>process.env</code>.
                </p>
                <p>
                  Secrets are <strong>never logged</strong>: only the env names appear in the
                  task log, never the values. If a single mapping fails to resolve (e.g.
                  the field was deleted in 1Password), the worker logs the failure and skips
                  that one mapping rather than killing the whole task.
                </p>
              </Section>

              <Section id="onepassword-security" title="Security model">
                <ul>
                  <li>
                    <strong>Encrypted at rest.</strong> The Connect access token is encrypted in
                    the portal database with AES-256-GCM via <code>src/lib/crypto.ts</code>{' '}
                    before being stored. The ciphertext, IV, and auth tag are persisted as three
                    separate columns; the encryption key lives in the portal’s environment, not
                    in the database.
                  </li>
                  <li>
                    <strong>Admin-only.</strong> Every connection and mapping endpoint goes
                    through <code>requireApiAdmin()</code>. Non-admin sessions get a{' '}
                    <code>403</code>, and the UI redirects non-admins to <code>/dashboard</code>.
                  </li>
                  <li>
                    <strong>CSRF protected.</strong> All mutating endpoints require the
                    session’s <code>x-csrf-token</code> header.
                  </li>
                  <li>
                    <strong>Token never returned.</strong> The{' '}
                    <code>GET /api/onepassword/connection</code> endpoint returns a redacted view
                    (connect host, last-tested status, default vault id) — never the token,
                    even to the admin who set it.
                  </li>
                  <li>
                    <strong>Audit log.</strong> Connection upserts, deletes, test runs, and
                    mapping CRUD all emit an entry through <code>auditLog()</code> with the
                    acting user id, the IP, and the affected resource.
                  </li>
                </ul>
              </Section>

              <Section id="onepassword-troubleshooting" title="Troubleshooting">
                <h3>“Test connection” returns Failed with 401 or 403</h3>
                <p>
                  The Connect server is reachable but the token is wrong, expired, or doesn’t
                  have read access to any vault. Regenerate the token in your 1Password account
                  and re-save it in <a href="/settings">Settings</a>. If you used a vault-scoped
                  token, make sure the scope includes the vaults you plan to map.
                </p>

                <h3>“1Password Connect request failed: fetch failed” / network errors</h3>
                <p>
                  The portal can’t reach the Connect host. If the worker runs in Docker, the URL
                  has to be reachable from inside that container — <code>localhost</code> on
                  the host machine is not the same as <code>localhost</code> inside the
                  container. Use the host’s LAN address or put both containers on the same
                  Docker network and reference the service by name (e.g.{' '}
                  <code>http://op-connect-api:8080</code>).
                </p>

                <h3>“Field does not resolve” when adding a mapping</h3>
                <p>
                  The portal validates each new mapping by fetching the field from Connect
                  before saving. This error means either the field label doesn’t exist on that
                  item, or the field exists but has no value. The lookup is case-insensitive on
                  the label — confirm the label as it appears in the 1Password UI, not the
                  id.
                </p>

                <h3>“Mapping for X already exists on this project”</h3>
                <p>
                  Each <code>(projectId, envName)</code> pair is unique. Delete the existing row
                  from the mappings table before adding a new one for the same env var.
                </p>

                <h3>Worker logs say the env var resolved as empty / undefined</h3>
                <p>
                  The mapping resolved at create time but the field is empty <em>now</em> in
                  1Password — likely the value was cleared without the field being deleted.
                  Open the item in 1Password, restore the value, and re-run the task. No portal
                  change is needed.
                </p>

                <h3>“No 1Password connection configured” from the vaults or items endpoint</h3>
                <p>
                  The connection was disconnected (or was never saved). Re-link from{' '}
                  <a href="/settings">Settings → 1Password</a>. Existing mappings are not deleted
                  by a disconnect — they’ll resume resolving as soon as the connection comes
                  back.
                </p>
              </Section>

              <div className="not-prose mt-8 pt-6 border-t border-portal-border flex items-center justify-between text-sm">
                <Link
                  href="/dashboard"
                  className="text-portal-muted hover:text-portal-text inline-flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded-md px-1"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to dashboard
                </Link>
                <div className="flex items-center gap-3">
                  <Link
                    href="/admin/projects"
                    className="text-portal-muted hover:text-portal-text inline-flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded-md px-1"
                  >
                    <Bot className="h-4 w-4" /> Manage projects
                  </Link>
                  <Link
                    href="/admin/agents"
                    className="text-portal-muted hover:text-portal-text inline-flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded-md px-1"
                  >
                    <Bot className="h-4 w-4" /> Manage agents
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopicHeading({
  id,
  label,
  first,
}: {
  id: string;
  label: string;
  first?: boolean;
}) {
  return (
    <div
      id={id}
      className={
        'not-prose scroll-mt-24 ' +
        (first ? 'mb-4' : 'mt-12 mb-4 pt-6 border-t border-portal-border')
      }
    >
      <div className="text-[10px] uppercase tracking-wider text-portal-muted font-semibold">
        Topic
      </div>
      <h1 className="text-2xl font-bold text-portal-text mt-1">{label}</h1>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 mb-10">
      <h2 className="!mt-0">{title}</h2>
      {children}
    </section>
  );
}

function Row({ slug, name, use }: { slug: string; name: string; use: string }) {
  return (
    <tr className="border-b border-portal-border last:border-0">
      <td className="p-2 font-mono text-xs text-portal-accent">{slug}</td>
      <td className="p-2 text-portal-text">{name}</td>
      <td className="p-2">{use}</td>
    </tr>
  );
}
