/**
 * MCP Tools: read-only access to GitHub for the portal AI assistant.
 *
 * Auth: uses GITHUB_TOKEN (same env var as worker/git-handler.ts and
 * worker/index.ts). All tools degrade to unauthenticated requests if the
 * token is missing — public repos still work, private ones return 404.
 */

import type { McpToolDef } from './registry';

const GITHUB_API = 'https://api.github.com';
const MAX_FILE_BYTES = 50 * 1024;

type GhError = { error: string; resetAt?: string; status?: number };
type GhResult<T> = { ok: true; data: T; headers: Headers } | { ok: false; err: GhError };

async function ghFetch<T>(path: string, init?: RequestInit): Promise<GhResult<T>> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'lepoder-portal-mcp',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  if (res.ok) return { ok: true, data: (await res.json()) as T, headers: res.headers };

  if (res.status === 404) return { ok: false, err: { error: 'not found', status: 404 } };
  if (res.status === 401) {
    return { ok: false, err: { error: 'auth failed — check GITHUB_TOKEN env', status: 401 } };
  }
  // GitHub signals rate-limiting via 403 + X-RateLimit-Remaining: 0.
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = res.headers.get('x-ratelimit-reset');
    const resetAt = reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : undefined;
    return { ok: false, err: { error: 'rate limited', resetAt, status: 403 } };
  }
  return { ok: false, err: { error: `github api ${res.status}`, status: res.status } };
}

function parseRepo(repo: unknown): { owner: string; name: string } | null {
  if (typeof repo !== 'string') return null;
  const [owner, name, ...rest] = repo.split('/');
  if (!owner || !name || rest.length > 0) return null;
  return { owner, name };
}

interface GhPr {
  number: number;
  title: string;
  state: string;
  body: string | null;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  mergeable: boolean | null;
  head: { ref: string };
}

interface GhPrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
}

interface GhBranch {
  name: string;
  commit: { sha: string };
}

interface GhCommit {
  sha: string;
  commit: { message: string; author: { date: string } };
}

interface GhContent {
  content?: string;
  encoding?: string;
  sha: string;
  size: number;
  type: string;
}

export const githubTools: McpToolDef[] = [
  {
    name: 'github_list_prs',
    description:
      'List pull requests in a GitHub repo. Use this to check open work, recent merges, or branch activity.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository in "owner/name" form' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Defaults to "open"' },
      },
      required: ['repo'],
    },
    adminOnly: false,
    handler: async (input) => {
      const parsed = parseRepo(input.repo);
      if (!parsed) return { error: 'repo must be "owner/name"' };
      const state = input.state === 'closed' || input.state === 'all' ? input.state : 'open';
      const r = await ghFetch<GhPr[]>(
        `/repos/${parsed.owner}/${parsed.name}/pulls?state=${state}&per_page=50`
      );
      if (!r.ok) return r.err;
      return r.data.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        branch: p.head.ref,
        url: p.html_url,
        createdAt: p.created_at,
        mergedAt: p.merged_at,
      }));
    },
  },

  {
    name: 'github_get_pr',
    description: 'Fetch full details for one pull request, including changed files.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository in "owner/name" form' },
        pr_number: { type: 'number', description: 'Pull request number' },
      },
      required: ['repo', 'pr_number'],
    },
    adminOnly: false,
    handler: async (input) => {
      const parsed = parseRepo(input.repo);
      if (!parsed) return { error: 'repo must be "owner/name"' };
      const num = typeof input.pr_number === 'number' ? input.pr_number : Number(input.pr_number);
      if (!Number.isInteger(num) || num <= 0) return { error: 'pr_number must be a positive integer' };

      const [prRes, filesRes] = await Promise.all([
        ghFetch<GhPr>(`/repos/${parsed.owner}/${parsed.name}/pulls/${num}`),
        ghFetch<GhPrFile[]>(`/repos/${parsed.owner}/${parsed.name}/pulls/${num}/files?per_page=100`),
      ]);
      if (!prRes.ok) return prRes.err;
      const pr = prRes.data;
      const files = filesRes.ok
        ? filesRes.data.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          }))
        : [];
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        body: pr.body ?? '',
        branch: pr.head.ref,
        url: pr.html_url,
        mergeable: pr.mergeable,
        mergedAt: pr.merged_at,
        files,
      };
    },
  },

  {
    name: 'github_list_branches',
    description: 'List branches in a GitHub repo with their last commit.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository in "owner/name" form' },
      },
      required: ['repo'],
    },
    adminOnly: false,
    handler: async (input) => {
      const parsed = parseRepo(input.repo);
      if (!parsed) return { error: 'repo must be "owner/name"' };
      // Capped at 30 because we fan out one commit fetch per branch below.
      const r = await ghFetch<GhBranch[]>(
        `/repos/${parsed.owner}/${parsed.name}/branches?per_page=30`
      );
      if (!r.ok) return r.err;
      const enriched = await Promise.all(
        r.data.map(async (b) => {
          const c = await ghFetch<GhCommit>(
            `/repos/${parsed.owner}/${parsed.name}/commits/${b.commit.sha}`
          );
          if (!c.ok) {
            return {
              name: b.name,
              lastCommit: { sha: b.commit.sha, message: '', date: '' },
            };
          }
          return {
            name: b.name,
            lastCommit: {
              sha: c.data.sha,
              message: c.data.commit.message,
              date: c.data.commit.author.date,
            },
          };
        })
      );
      return enriched;
    },
  },

  {
    name: 'github_get_file',
    description:
      'Fetch a single file from a GitHub repo. Content is decoded from base64 and capped at 50 KB.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository in "owner/name" form' },
        path: { type: 'string', description: 'File path within the repo' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA. Defaults to repo default branch.' },
      },
      required: ['repo', 'path'],
    },
    adminOnly: false,
    handler: async (input) => {
      const parsed = parseRepo(input.repo);
      if (!parsed) return { error: 'repo must be "owner/name"' };
      const filePath = typeof input.path === 'string' ? input.path : '';
      if (!filePath) return { error: 'path required' };
      const ref = typeof input.ref === 'string' && input.ref ? `?ref=${encodeURIComponent(input.ref)}` : '';
      const encoded = filePath.split('/').map(encodeURIComponent).join('/');
      const r = await ghFetch<GhContent>(
        `/repos/${parsed.owner}/${parsed.name}/contents/${encoded}${ref}`
      );
      if (!r.ok) return r.err;
      if (r.data.type !== 'file') return { error: 'path is not a file' };
      if (!r.data.content || r.data.encoding !== 'base64') {
        return { error: 'file too large for contents api (>1MB)' };
      }
      const buf = Buffer.from(r.data.content, 'base64');
      const truncated = buf.byteLength > MAX_FILE_BYTES;
      const slice = truncated ? buf.subarray(0, MAX_FILE_BYTES) : buf;
      return {
        content: slice.toString('utf8'),
        sha: r.data.sha,
        truncated,
        byteSize: r.data.size,
      };
    },
  },
];
