import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import prisma from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.cwd(), 'projects');

// Allowed files to read/write
const ALLOWED_FILES = ['README.md', 'CLAW-NOTES.md', 'CHANGELOG.md', 'SESSIONS.md'];

const SLUG_RE = /^[a-z0-9-]+$/;

// GET - Read file content
export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; filename: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug, filename } = params;
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ ok: false, error: 'invalid slug' }, { status: 400 });
    }
    const decodedFilename = decodeURIComponent(filename);

    // Validate filename
    if (!ALLOWED_FILES.includes(decodedFilename)) {
      return NextResponse.json(
        { ok: false, error: 'File not allowed' },
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
    const filePath = path.join(PROJECTS_DIR, slug, decodedFilename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return NextResponse.json({
        ok: true,
        data: {
          name: decodedFilename,
          content,
          exists: true,
        },
      });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist yet
        return NextResponse.json({
          ok: true,
          data: {
            name: decodedFilename,
            content: '',
            exists: false,
          },
        });
      }
      throw err;
    }
  } catch (error) {
    console.error('File read error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to read file' },
      { status: 500 }
    );
  }
}

// PUT - Write file content (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string; filename: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { slug, filename } = params;
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ ok: false, error: 'invalid slug' }, { status: 400 });
    }
    const decodedFilename = decodeURIComponent(filename);

    // Validate filename
    if (!ALLOWED_FILES.includes(decodedFilename)) {
      return NextResponse.json(
        { ok: false, error: 'File not allowed' },
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

    const body = await req.json();
    const { content } = body;

    if (typeof content !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'Content must be a string' },
        { status: 400 }
      );
    }

    // Ensure directory exists
    const projectDir = path.join(PROJECTS_DIR, slug);
    await fs.mkdir(projectDir, { recursive: true });

    // Write file
    const filePath = path.join(projectDir, decodedFilename);
    await fs.writeFile(filePath, content, 'utf-8');

    // Update project updatedAt
    await prisma.project.update({
      where: { slug },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      message: 'File saved',
      data: {
        name: decodedFilename,
        content,
        exists: true,
      },
    });
  } catch (error) {
    console.error('File write error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to write file' },
      { status: 500 }
    );
  }
}
