import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects');

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

// Recursively scan for .md files
async function scanMarkdownFiles(dir: string, basePath: string = ''): Promise<FileNode[]> {
  const nodes: FileNode[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    // Sort: folders first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    for (const entry of entries) {
      // Skip hidden files, node_modules, .git, .next, etc.
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === 'build') {
        continue;
      }
      
      const fullPath = path.join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectory
        const children = await scanMarkdownFiles(fullPath, relativePath);
        // Only include folder if it contains .md files (directly or nested)
        if (children.length > 0) {
          nodes.push({
            name: entry.name,
            path: relativePath,
            type: 'folder',
            children,
          });
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
        });
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('Scan error:', err);
    }
  }
  
  return nodes;
}

// Flatten tree to get file count
function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      count++;
    } else if (node.children) {
      count += countFiles(node.children);
    }
  }
  return count;
}

// GET - List all markdown files in project
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = params;

    // Check project exists
    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json(
        { ok: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Scan project directory for .md files
    const projectDir = path.join(PROJECTS_DIR, slug);
    const tree = await scanMarkdownFiles(projectDir);
    const fileCount = countFiles(tree);

    return NextResponse.json({
      ok: true,
      data: {
        tree,
        fileCount,
        projectDir: slug,
      },
    });
  } catch (error) {
    console.error('Docs scan error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to scan docs' },
      { status: 500 }
    );
  }
}
