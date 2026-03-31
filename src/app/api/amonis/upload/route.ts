import { NextResponse } from 'next/server';
import { getApiUser } from '@/lib/auth';

// Force dynamic
export const dynamic = 'force-dynamic';

// POST /api/amonis/upload - Convert screenshot to data URL
// No file system needed - just converts to base64
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

    // Limit file size (5MB for base64)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'File too large (max 5MB)' }, { status: 400 });
    }

    // Convert to base64 data URL
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const url = `data:${file.type};base64,${base64}`;

    return NextResponse.json({ ok: true, url, filename: file.name });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ ok: false, error: 'Upload failed' }, { status: 500 });
  }
}
