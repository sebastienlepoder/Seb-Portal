'use client';

import { useEffect, useState } from 'react';
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

const SECTIONS: { id: string; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'dispatching', label: 'Dispatching a task' },
  { id: 'read-only-vs-write', label: 'Read-only vs write-enabled' },
  { id: 'starting-the-worker', label: 'Starting the worker' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
  { id: 'agents-reference', label: 'Agents reference' },
  { id: 'task-routing', label: 'How auto-match works' },
  { id: 'capabilities', label: 'What the agent can/can’t do' },
  { id: 'mcp-tool', label: 'MCP tool: dispatch_to_project' },
  { id: 'environment', label: 'Environment variables' },
];

export default function AgentsHelpPage() {
  const { user, loading } = useAuth();
  const [active, setActive] = useState<string>(SECTIONS[0]!.id);

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  // Scroll-spy
  useEffect(() => {
    const handler = () => {
      let current = SECTIONS[0]!.id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 120) current = s.id;
      }
      setActive(current);
    };
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).then(() => {
      window.location.href = '/login';
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <Loader2 className="h-6 w-6 animate-spin text-portal-accent" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={handleLogout} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center gap-3 mb-6 pl-12 sm:pl-0">
            <Link
              href="/agents"
              className="p-2 text-portal-muted hover:text-portal-text rounded-md"
              title="Back to Agents"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-portal-text flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-portal-accent" />
                Agent Dispatch — Help
              </h1>
              <p className="text-sm text-portal-muted">
                How the agent system works and how to operate it
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* TOC */}
            <nav className="lg:col-span-3 hidden lg:block">
              <div className="sticky top-4 bg-portal-card border border-portal-border rounded-xl p-3">
                <div className="text-[10px] uppercase tracking-wider text-portal-muted px-2 py-1">
                  On this page
                </div>
                {SECTIONS.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={
                      'block px-2 py-1.5 rounded text-sm transition-colors ' +
                      (active === s.id
                        ? 'text-portal-accent bg-portal-accent/10'
                        : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover')
                    }
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </nav>

            {/* Content */}
            <article className="lg:col-span-9 prose prose-invert prose-sm max-w-none prose-headings:scroll-mt-24 prose-headings:text-portal-text prose-p:text-portal-text-dim prose-li:text-portal-text-dim prose-strong:text-portal-text prose-a:text-portal-accent hover:prose-a:underline prose-code:text-portal-accent prose-code:bg-portal-card prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-portal-border">

              <Section id="overview" title="Overview">
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

              <Section id="dispatching" title="Dispatching a task">
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

              <Section id="read-only-vs-write" title="Read-only vs write-enabled projects">
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

              <Section id="starting-the-worker" title="Starting the worker">
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

              <Section id="troubleshooting" title="Troubleshooting">
                <h3>Task stuck on “pending”</h3>
                <p>
                  The worker isn’t running, or it’s connected to a different database.
                  See <a href="#starting-the-worker">Starting the worker</a> above. The yellow
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

              <Section id="task-routing" title="How auto-match works">
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

              <Section id="capabilities" title="What the agent can/can’t do">
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
                  <code>WORKER_MAX_ITERATIONS</code> (default 40 tool-loop iterations).
                </p>
              </Section>

              <Section id="mcp-tool" title="MCP tool: dispatch_to_project">
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

              <Section id="environment" title="Environment variables">
                <h3>Worker — required</h3>
                <ul>
                  <li>
                    <code>DATABASE_URL</code> — must point at the same SQLite (or other Prisma
                    DB) as the portal. In Docker, both services use{' '}
                    <code>file:/app/data/portal.db</code> via the shared volume.
                  </li>
                  <li>
                    <code>ANTHROPIC_API_KEY</code> — your Claude API key. Without it tasks fail
                    immediately.
                  </li>
                </ul>
                <h3>Worker — recommended</h3>
                <ul>
                  <li>
                    <code>GITHUB_TOKEN</code> — required to clone private repos and to open PRs.
                    Needs <code>repo</code> scope.
                  </li>
                  <li>
                    <code>ANTHROPIC_BASE_URL</code> — optional, point at a self-hosted
                    Anthropic-compatible proxy (Meridian etc.).
                  </li>
                </ul>
                <h3>Worker — tunables</h3>
                <ul>
                  <li><code>WORKER_ID</code> — unique id (default <code>hostname-pid</code>)</li>
                  <li><code>WORKER_POLL_INTERVAL_MS</code> — default <code>5000</code></li>
                  <li><code>WORKER_TIMEOUT_MS</code> — per-task hard cap, default <code>300000</code></li>
                  <li><code>WORKER_MAX_ITERATIONS</code> — agent tool-loop budget, default <code>40</code></li>
                  <li><code>WORKER_CONCURRENCY</code> — simultaneous tasks per worker, default <code>1</code></li>
                  <li><code>WORKER_DEFAULT_MODEL</code> — fallback when an agent has no model override, default <code>claude-sonnet-4-6</code></li>
                </ul>
                <p>
                  All of these are documented in <code>.env.example</code> and read by the worker
                  on startup. Restart the worker after changing them.
                </p>
              </Section>

              <div className="not-prose mt-8 pt-6 border-t border-portal-border flex items-center justify-between text-sm">
                <Link
                  href="/agents"
                  className="text-portal-muted hover:text-portal-text inline-flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Agents
                </Link>
                <div className="flex items-center gap-3">
                  <Link
                    href="/admin/projects"
                    className="text-portal-muted hover:text-portal-text inline-flex items-center gap-1"
                  >
                    <Bot className="h-4 w-4" /> Manage projects
                  </Link>
                  <Link
                    href="/admin/agents"
                    className="text-portal-muted hover:text-portal-text inline-flex items-center gap-1"
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
