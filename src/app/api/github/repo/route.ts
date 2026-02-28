import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

const GITHUB_API = 'https://api.github.com';

interface RepoInfo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  pushed_at: string;
  created_at: string;
  updated_at: string;
  visibility: string;
  topics: string[];
}

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  html_url: string;
  author?: {
    login: string;
    avatar_url: string;
  };
}

interface Issue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: { name: string; color: string }[];
  pull_request?: object;
}

interface Branch {
  name: string;
  commit: {
    sha: string;
  };
  protected: boolean;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/|$)/,
    /github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
  }
  return null;
}

async function githubFetch(path: string, token?: string) {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LEPODER-Portal',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GITHUB_API}${path}`, {
    headers,
    next: { revalidate: 60 }, // Cache for 1 minute
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const repoUrl = url.searchParams.get('repo');
    const action = url.searchParams.get('action') || 'overview';

    if (!repoUrl) {
      return NextResponse.json({ ok: false, error: 'Repository URL required' }, { status: 400 });
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: 'Invalid GitHub URL' }, { status: 400 });
    }

    const { owner, repo } = parsed;
    const token = process.env.GITHUB_TOKEN;

    switch (action) {
      case 'overview': {
        // Get repo info, recent commits, issues, and branches
        const [repoInfo, commits, issues, pulls, branches] = await Promise.all([
          githubFetch(`/repos/${owner}/${repo}`, token),
          githubFetch(`/repos/${owner}/${repo}/commits?per_page=10`, token),
          githubFetch(`/repos/${owner}/${repo}/issues?state=open&per_page=10`, token),
          githubFetch(`/repos/${owner}/${repo}/pulls?state=open&per_page=10`, token),
          githubFetch(`/repos/${owner}/${repo}/branches?per_page=10`, token),
        ]);

        if (!repoInfo) {
          return NextResponse.json({ ok: false, error: 'Repository not found' }, { status: 404 });
        }

        // Filter out PRs from issues (GitHub returns PRs in issues endpoint)
        const actualIssues = (issues || []).filter((i: Issue) => !i.pull_request);

        return NextResponse.json({
          ok: true,
          data: {
            repo: {
              name: repoInfo.name,
              fullName: repoInfo.full_name,
              description: repoInfo.description,
              url: repoInfo.html_url,
              homepage: repoInfo.homepage,
              language: repoInfo.language,
              stars: repoInfo.stargazers_count,
              forks: repoInfo.forks_count,
              openIssues: repoInfo.open_issues_count,
              defaultBranch: repoInfo.default_branch,
              pushedAt: repoInfo.pushed_at,
              createdAt: repoInfo.created_at,
              visibility: repoInfo.visibility,
              topics: repoInfo.topics || [],
            },
            commits: (commits || []).slice(0, 10).map((c: Commit) => ({
              sha: c.sha.substring(0, 7),
              fullSha: c.sha,
              message: c.commit.message.split('\n')[0],
              author: c.commit.author.name,
              authorLogin: c.author?.login,
              authorAvatar: c.author?.avatar_url,
              date: c.commit.author.date,
              url: c.html_url,
            })),
            issues: actualIssues.slice(0, 10).map((i: Issue) => ({
              number: i.number,
              title: i.title,
              state: i.state,
              url: i.html_url,
              createdAt: i.created_at,
              author: i.user.login,
              authorAvatar: i.user.avatar_url,
              labels: i.labels.map(l => ({ name: l.name, color: l.color })),
            })),
            pullRequests: (pulls || []).slice(0, 10).map((p: Issue) => ({
              number: p.number,
              title: p.title,
              state: p.state,
              url: p.html_url,
              createdAt: p.created_at,
              author: p.user.login,
              authorAvatar: p.user.avatar_url,
              labels: p.labels.map(l => ({ name: l.name, color: l.color })),
            })),
            branches: (branches || []).map((b: Branch) => ({
              name: b.name,
              sha: b.commit.sha.substring(0, 7),
              protected: b.protected,
            })),
          },
        });
      }

      case 'commits': {
        const page = url.searchParams.get('page') || '1';
        const commits = await githubFetch(
          `/repos/${owner}/${repo}/commits?per_page=20&page=${page}`,
          token
        );
        return NextResponse.json({
          ok: true,
          data: (commits || []).map((c: Commit) => ({
            sha: c.sha.substring(0, 7),
            fullSha: c.sha,
            message: c.commit.message.split('\n')[0],
            fullMessage: c.commit.message,
            author: c.commit.author.name,
            authorLogin: c.author?.login,
            authorAvatar: c.author?.avatar_url,
            date: c.commit.author.date,
            url: c.html_url,
          })),
        });
      }

      case 'issues': {
        const state = url.searchParams.get('state') || 'open';
        const page = url.searchParams.get('page') || '1';
        const issues = await githubFetch(
          `/repos/${owner}/${repo}/issues?state=${state}&per_page=20&page=${page}`,
          token
        );
        const actualIssues = (issues || []).filter((i: Issue) => !i.pull_request);
        return NextResponse.json({
          ok: true,
          data: actualIssues.map((i: Issue) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            url: i.html_url,
            createdAt: i.created_at,
            updatedAt: i.updated_at,
            author: i.user.login,
            authorAvatar: i.user.avatar_url,
            labels: i.labels.map(l => ({ name: l.name, color: l.color })),
          })),
        });
      }

      case 'pulls': {
        const state = url.searchParams.get('state') || 'open';
        const page = url.searchParams.get('page') || '1';
        const pulls = await githubFetch(
          `/repos/${owner}/${repo}/pulls?state=${state}&per_page=20&page=${page}`,
          token
        );
        return NextResponse.json({
          ok: true,
          data: (pulls || []).map((p: Issue) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            url: p.html_url,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            author: p.user.login,
            authorAvatar: p.user.avatar_url,
            labels: p.labels.map(l => ({ name: l.name, color: l.color })),
          })),
        });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub repo API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
