import prisma from '@/lib/db';

const GITHUB_API = 'https://api.github.com';

export class GithubError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

interface RepoCoords {
  owner: string;
  repo: string;
  defaultBranch: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'LEPODER-Portal',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh<T = unknown>(path: string, accept?: string): Promise<T> {
  const h = headers();
  if (accept) h.Accept = accept;
  const res = await fetch(`${GITHUB_API}${path}`, { headers: h, cache: 'no-store' });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body?.message === 'string' && body.message) message = body.message;
    } catch {
      // ignore
    }
    throw new GithubError(res.status, message);
  }
  if (accept === 'application/vnd.github.raw') {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

/**
 * Resolve a project identifier (slug or human name) to GitHub coordinates.
 * Throws GithubError(404) if the project doesn't exist or has no GitHub repo set.
 */
export async function resolveProjectRepo(projectQuery: string): Promise<RepoCoords> {
  const q = projectQuery.trim().toLowerCase();
  if (!q) throw new GithubError(400, 'project is required');
  const project =
    (await prisma.project.findUnique({ where: { slug: q } })) ??
    (await prisma.project.findFirst({
      where: {
        OR: [{ slug: { contains: q } }, { name: { contains: projectQuery } }],
      },
    }));
  if (!project) throw new GithubError(404, `No project matches "${projectQuery}"`);
  if (!project.repoOwner || !project.repoName) {
    throw new GithubError(400, `Project "${project.slug}" has no GitHub repo configured`);
  }
  return {
    owner: project.repoOwner,
    repo: project.repoName,
    defaultBranch: project.workingBranch || 'main',
  };
}

// ─── Repo metadata ───────────────────────────────────────────

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  defaultBranch: string;
  language: string | null;
  pushedAt: string | null;
  visibility: string;
  topics: string[];
  openIssues: number;
  stars: number;
}

export async function getRepoInfo(owner: string, repo: string): Promise<RepoInfo> {
  const r = await gh<{
    name: string;
    full_name: string;
    description: string | null;
    html_url: string;
    default_branch: string;
    language: string | null;
    pushed_at: string | null;
    visibility: string;
    topics?: string[];
    open_issues_count: number;
    stargazers_count: number;
  }>(`/repos/${owner}/${repo}`);
  return {
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    url: r.html_url,
    defaultBranch: r.default_branch,
    language: r.language,
    pushedAt: r.pushed_at,
    visibility: r.visibility,
    topics: r.topics ?? [],
    openIssues: r.open_issues_count,
    stars: r.stargazers_count,
  };
}

// ─── Branches ────────────────────────────────────────────────

export async function listBranches(
  owner: string,
  repo: string,
  perPage = 30
): Promise<{ name: string; sha: string; protected: boolean }[]> {
  const data = await gh<{ name: string; commit: { sha: string }; protected: boolean }[]>(
    `/repos/${owner}/${repo}/branches?per_page=${perPage}`
  );
  return data.map((b) => ({
    name: b.name,
    sha: b.commit.sha.slice(0, 7),
    protected: b.protected,
  }));
}

// ─── Commits ─────────────────────────────────────────────────

export async function listCommits(
  owner: string,
  repo: string,
  opts: { branch?: string; path?: string; perPage?: number } = {}
): Promise<
  {
    sha: string;
    message: string;
    author: string | null;
    date: string | null;
    url: string;
  }[]
> {
  const params = new URLSearchParams();
  params.set('per_page', String(opts.perPage ?? 20));
  if (opts.branch) params.set('sha', opts.branch);
  if (opts.path) params.set('path', opts.path);
  const data = await gh<
    {
      sha: string;
      commit: { message: string; author: { name: string; date: string } | null };
      author: { login: string } | null;
      html_url: string;
    }[]
  >(`/repos/${owner}/${repo}/commits?${params.toString()}`);
  return data.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split('\n')[0],
    author: c.author?.login ?? c.commit.author?.name ?? null,
    date: c.commit.author?.date ?? null,
    url: c.html_url,
  }));
}

export async function getCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<{
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  url: string;
  stats: { additions: number; deletions: number; total: number } | null;
  files: { filename: string; status: string; additions: number; deletions: number }[];
}> {
  const r = await gh<{
    sha: string;
    commit: { message: string; author: { name: string; date: string } | null };
    author: { login: string } | null;
    html_url: string;
    stats?: { additions: number; deletions: number; total: number };
    files?: { filename: string; status: string; additions: number; deletions: number }[];
  }>(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`);
  return {
    sha: r.sha,
    message: r.commit.message,
    author: r.author?.login ?? r.commit.author?.name ?? null,
    date: r.commit.author?.date ?? null,
    url: r.html_url,
    stats: r.stats ?? null,
    files: (r.files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

// ─── Pull requests ───────────────────────────────────────────

export async function listPullRequests(
  owner: string,
  repo: string,
  opts: { state?: 'open' | 'closed' | 'all'; perPage?: number } = {}
): Promise<
  {
    number: number;
    title: string;
    state: string;
    merged: boolean;
    author: string | null;
    url: string;
    createdAt: string;
    headRef: string;
    baseRef: string;
  }[]
> {
  const params = new URLSearchParams();
  params.set('state', opts.state ?? 'all');
  params.set('per_page', String(opts.perPage ?? 20));
  params.set('sort', 'updated');
  params.set('direction', 'desc');
  const data = await gh<
    {
      number: number;
      title: string;
      state: string;
      merged_at: string | null;
      user: { login: string } | null;
      html_url: string;
      created_at: string;
      head: { ref: string };
      base: { ref: string };
    }[]
  >(`/repos/${owner}/${repo}/pulls?${params.toString()}`);
  return data.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    merged: !!p.merged_at,
    author: p.user?.login ?? null,
    url: p.html_url,
    createdAt: p.created_at,
    headRef: p.head.ref,
    baseRef: p.base.ref,
  }));
}

export async function getPullRequest(
  owner: string,
  repo: string,
  number: number
): Promise<{
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean;
  mergedAt: string | null;
  author: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: { filename: string; status: string; additions: number; deletions: number }[];
}> {
  const [pr, files] = await Promise.all([
    gh<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      merged: boolean;
      merged_at: string | null;
      user: { login: string } | null;
      html_url: string;
      created_at: string;
      updated_at: string;
      head: { ref: string };
      base: { ref: string };
      additions: number;
      deletions: number;
      changed_files: number;
    }>(`/repos/${owner}/${repo}/pulls/${number}`),
    gh<{ filename: string; status: string; additions: number; deletions: number }[]>(
      `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`
    ).catch(() => []),
  ]);
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    merged: pr.merged,
    mergedAt: pr.merged_at,
    author: pr.user?.login ?? null,
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    files: (files ?? []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
  };
}

// ─── Contents ────────────────────────────────────────────────

const MAX_FILE_BYTES = 200_000;

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ path: string; ref: string | null; truncated: boolean; content: string }> {
  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const text = await gh<string>(
    `/repos/${owner}/${repo}/contents/${encodeURI(path)}${qs}`,
    'application/vnd.github.raw'
  );
  const truncated = text.length > MAX_FILE_BYTES;
  return {
    path,
    ref: ref ?? null,
    truncated,
    content: truncated ? text.slice(0, MAX_FILE_BYTES) : text,
  };
}

export async function listDirectory(
  owner: string,
  repo: string,
  path = '',
  ref?: string
): Promise<{ name: string; path: string; type: string; size: number | null }[]> {
  const params = new URLSearchParams();
  if (ref) params.set('ref', ref);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await gh<
    { name: string; path: string; type: string; size: number }[] | { name: string; path: string; type: string; size: number }
  >(`/repos/${owner}/${repo}/contents/${encodeURI(path)}${qs}`);
  const items = Array.isArray(data) ? data : [data];
  return items.map((i) => ({
    name: i.name,
    path: i.path,
    type: i.type,
    size: i.type === 'file' ? i.size : null,
  }));
}

// ─── Repo enumeration (for project sync) ─────────────────────

export interface GithubRepoSummary {
  name: string;
  owner: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
  archived: boolean;
  fork: boolean;
  isPrivate: boolean;
  language: string | null;
  pushedAt: string | null;
}

interface RawRepo {
  name: string;
  owner: { login: string };
  full_name: string;
  html_url: string;
  default_branch: string;
  description: string | null;
  archived: boolean;
  fork: boolean;
  private: boolean;
  language: string | null;
  pushed_at: string | null;
}

/**
 * Enumerate repositories to sync into projects. Scope is configurable:
 *   GITHUB_SYNC_ORG          — list a specific org's repos instead of the user's
 *   GITHUB_SYNC_AFFILIATION  — /user/repos affiliation (default "owner")
 *   GITHUB_SYNC_INCLUDE_FORKS — "true" to include forks (default exclude)
 * Requires GITHUB_TOKEN. Paginates up to 20×100 = 2000 repos.
 */
export async function listSyncableRepos(): Promise<GithubRepoSummary[]> {
  if (!process.env.GITHUB_TOKEN) {
    throw new GithubError(401, 'GITHUB_TOKEN is not configured');
  }
  const org = process.env.GITHUB_SYNC_ORG?.trim();
  const affiliation = process.env.GITHUB_SYNC_AFFILIATION?.trim() || 'owner';
  const includeForks = process.env.GITHUB_SYNC_INCLUDE_FORKS === 'true';
  const perPage = 100;
  const out: GithubRepoSummary[] = [];

  for (let page = 1; page <= 20; page++) {
    const path = org
      ? `/orgs/${encodeURIComponent(org)}/repos?per_page=${perPage}&page=${page}&sort=pushed`
      : `/user/repos?per_page=${perPage}&page=${page}&affiliation=${encodeURIComponent(affiliation)}&sort=pushed`;
    const repos = await gh<RawRepo[]>(path);
    if (!Array.isArray(repos) || repos.length === 0) break;
    for (const r of repos) {
      if (!includeForks && r.fork) continue;
      out.push({
        name: r.name,
        owner: r.owner?.login ?? '',
        fullName: r.full_name,
        htmlUrl: r.html_url,
        defaultBranch: r.default_branch || 'main',
        description: r.description,
        archived: !!r.archived,
        fork: !!r.fork,
        isPrivate: !!r.private,
        language: r.language,
        pushedAt: r.pushed_at,
      });
    }
    if (repos.length < perPage) break;
  }
  return out;
}
