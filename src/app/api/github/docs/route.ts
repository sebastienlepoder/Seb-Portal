import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

// GitHub API base
const GITHUB_API = 'https://api.github.com';

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
  html_url: string;
}

interface DocFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  url: string;
  children?: DocFile[];
}

// Extract owner/repo from GitHub URL
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle various GitHub URL formats
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

// Fetch directory contents from GitHub
async function fetchGitHubContents(
  owner: string,
  repo: string,
  path: string = 'docs',
  token?: string
): Promise<GitHubContent[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LEPODER-Portal',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    headers,
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!res.ok) {
    if (res.status === 404) {
      return [];
    }
    throw new Error(`GitHub API error: ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// Fetch file content from GitHub
async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string
): Promise<string> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3.raw',
    'User-Agent': 'LEPODER-Portal',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    headers,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.text();
}

// Recursively build docs tree
async function buildDocsTree(
  owner: string,
  repo: string,
  path: string = 'docs',
  token?: string,
  depth: number = 0
): Promise<DocFile[]> {
  if (depth > 3) return []; // Limit recursion depth

  const contents = await fetchGitHubContents(owner, repo, path, token);
  const tree: DocFile[] = [];

  for (const item of contents) {
    const docFile: DocFile = {
      name: item.name,
      path: item.path,
      type: item.type,
      url: item.html_url,
    };

    if (item.type === 'dir') {
      docFile.children = await buildDocsTree(owner, repo, item.path, token, depth + 1);
    }

    tree.push(docFile);
  }

  // Sort: directories first, then files, alphabetically
  return tree.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// GET /api/github/docs - Fetch docs from a GitHub repo
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const repoUrl = url.searchParams.get('repo');
    const filePath = url.searchParams.get('file');
    const action = url.searchParams.get('action') || 'tree';

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
      case 'tree': {
        // Get docs folder tree
        const tree = await buildDocsTree(owner, repo, 'docs', token);
        return NextResponse.json({
          ok: true,
          data: {
            owner,
            repo,
            tree,
            hasDocsFolder: tree.length > 0,
          },
        });
      }

      case 'file': {
        // Get specific file content
        if (!filePath) {
          return NextResponse.json({ ok: false, error: 'File path required' }, { status: 400 });
        }
        const content = await fetchFileContent(owner, repo, filePath, token);
        return NextResponse.json({
          ok: true,
          data: {
            path: filePath,
            content,
            owner,
            repo,
          },
        });
      }

      case 'check': {
        // Just check if docs folder exists
        const contents = await fetchGitHubContents(owner, repo, 'docs', token);
        return NextResponse.json({
          ok: true,
          data: {
            hasDocsFolder: contents.length > 0,
            fileCount: contents.filter(c => c.type === 'file').length,
            dirCount: contents.filter(c => c.type === 'dir').length,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('GitHub docs API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
