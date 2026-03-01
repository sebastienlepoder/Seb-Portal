import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ICON_DIR = join(process.cwd(), 'public', 'icons', 'generated');

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  
  // Try different extensions
  const extensions = ['png', 'svg', 'ico', 'webp', 'jpg'];
  
  for (const ext of extensions) {
    const filePath = join(ICON_DIR, `${slug}.${ext}`);
    if (existsSync(filePath)) {
      const buffer = readFileSync(filePath);
      const contentType = ext === 'svg' ? 'image/svg+xml' : 
                          ext === 'ico' ? 'image/x-icon' :
                          ext === 'webp' ? 'image/webp' :
                          ext === 'jpg' ? 'image/jpeg' : 'image/png';
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
    
    // Also try with -fav and -ddg suffixes
    for (const suffix of ['-fav', '-ddg']) {
      const altPath = join(ICON_DIR, `${slug}${suffix}.${ext}`);
      if (existsSync(altPath)) {
        const buffer = readFileSync(altPath);
        const contentType = ext === 'svg' ? 'image/svg+xml' : 
                            ext === 'ico' ? 'image/x-icon' : 'image/png';
        
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    }
  }
  
  return new NextResponse('Icon not found', { status: 404 });
}
