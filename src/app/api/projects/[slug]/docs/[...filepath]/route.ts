import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects');

const SLUG_RE = /^[a-z0-9-]+$/;

// GET - Read any markdown file content
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; filepath: string[] } }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug, filepath } = params;
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ ok: false, error: 'invalid slug' }, { status: 400 });
    }
    const relativePath = filepath.join('/');
    
    // Security: ensure path doesn't escape project dir
    const normalizedPath = path.normalize(relativePath);
    if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid path' },
        { status: 400 }
      );
    }
    
    // Must be a .md file
    if (!normalizedPath.toLowerCase().endsWith('.md')) {
      return NextResponse.json(
        { ok: false, error: 'Only markdown files allowed' },
        { status: 400 }
      );
    }

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

    // Read file
    const filePath = path.join(PROJECTS_DIR, slug, normalizedPath);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return NextResponse.json({
        ok: true,
        data: {
          name: path.basename(normalizedPath),
          path: normalizedPath,
          content,
          exists: true,
        },
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json(
          { ok: false, error: 'File not found' },
          { status: 404 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Doc read error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to read file' },
      { status: 500 }
    );
  }
}
