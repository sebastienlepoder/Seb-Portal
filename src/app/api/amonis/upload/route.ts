import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// POST /api/amonis/upload - Upload a screenshot
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'Only images allowed' }, { status: 400 });
    }

    // Limit file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${randomUUID()}.${ext}`;
    
    // Save to public/uploads/amonis
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'amonis');
    await mkdir(uploadDir, { recursive: true });
    
    const filepath = join(uploadDir, filename);
    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    // Return public URL
    const url = `/uploads/amonis/${filename}`;

    return NextResponse.json({ ok: true, url, filename });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 });
  }
}
