import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

// GitHub API base
const GITHUB_API = 'https://api.github.com';

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
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

// Fetch the entire repo tree recursively
async function fetchRepoTree(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubTreeItem[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LEPODER-Portal',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Get default branch
  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers,
    next: { revalidate: 300 },
  });
  
  if (!repoRes.ok) {
    throw new Error(`GitHub API error: ${repoRes.status}`);
  }
  
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch || 'main';

  // Get full tree recursively
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers, next: { revalidate: 300 } }
  );

  if (!treeRes.ok) {
    throw new Error(`GitHub API error: ${treeRes.status}`);
  }

  const treeData = await treeRes.json();
  return treeData.tree || [];
}

// Filter and build hierarchical tree of markdown files
function buildMarkdownTree(items: GitHubTreeItem[], owner: string, repo: string): DocFile[] {
  // Filter to only .md files (exclude node_modules, .git, etc.)
  const mdFiles = items.filter(item => {
    if (item.type !== 'blob') return false;
    if (!item.path.toLowerCase().endsWith('.md')) return false;
    
    // Exclude common non-documentation paths
    const excludePaths = ['node_modules/', '.git/', '.next/', 'dist/', 'build/', 'vendor/'];
    return !excludePaths.some(ex => item.path.includes(ex));
  });

  // Build hierarchical structure
  const root: DocFile[] = [];
  const folders: Record<string, DocFile> = {};

  // First pass: create all necessary folders
  for (const file of mdFiles) {
    const parts = file.path.split('/');
    let currentPath = '';
    
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      
      if (!folders[currentPath]) {
        const folder: DocFile = {
          name: parts[i],
          path: currentPath,
          type: 'dir',
          url: `https://github.com/${owner}/${repo}/tree/main/${currentPath}`,
          children: [],
        };
        folders[currentPath] = folder;
        
        if (parentPath && folders[parentPath]) {
          folders[parentPath].children!.push(folder);
        } else if (!parentPath) {
          root.push(folder);
        }
      }
    }
  }

  // Second pass: add files to their folders
  for (const file of mdFiles) {
    const parts = file.path.split('/');
    const fileName = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    
    const docFile: DocFile = {
      name: fileName,
      path: file.path,
      type: 'file',
      url: `https://github.com/${owner}/${repo}/blob/main/${file.path}`,
    };
    
    if (parentPath && folders[parentPath]) {
      folders[parentPath].children!.push(docFile);
    } else {
      root.push(docFile);
    }
  }

  // Sort recursively: folders first, then files, alphabetically
  function sortTree(items: DocFile[]): DocFile[] {
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const item of items) {
      if (item.children) {
        item.children = sortTree(item.children);
      }
    }
    return items;
  }

  return sortTree(root);
}

// Count total files in tree
function countFiles(tree: DocFile[]): number {
  let count = 0;
  for (const item of tree) {
    if (item.type === 'file') count++;
    else if (item.children) count += countFiles(item.children);
  }
  return count;
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

// GET /api/github/docs - Fetch ALL markdown files from a GitHub repo
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
        // Get ALL markdown files from entire repo
        const repoTree = await fetchRepoTree(owner, repo, token);
        const tree = buildMarkdownTree(repoTree, owner, repo);
        const fileCount = countFiles(tree);
        
        return NextResponse.json({
          ok: true,
          data: {
            owner,
            repo,
            tree,
            fileCount,
            hasDocsFolder: tree.length > 0, // Now means "has any .md files"
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
        // Quick check if repo has any markdown files
        const repoTree = await fetchRepoTree(owner, repo, token);
        const mdCount = repoTree.filter(
          item => item.type === 'blob' && 
          item.path.toLowerCase().endsWith('.md') &&
          !item.path.includes('node_modules/')
        ).length;
        
        return NextResponse.json({
          ok: true,
          data: {
            hasDocsFolder: mdCount > 0,
            fileCount: mdCount,
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
