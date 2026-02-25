import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAuthUrl } from '@/lib/microsoft';
import { randomBytes } from 'crypto';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session.user) {
      return NextResponse.redirect(new URL('/login', process.env.BASE_URL || 'http://localhost:3000'));
    }

    // Generate state to prevent CSRF
    const state = randomBytes(32).toString('hex');
    
    // Store state in session for verification
    session.microsoftState = state;
    await session.save();

    const authUrl = getAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Microsoft login error:', error);
    return NextResponse.json({ error: 'Failed to initiate Microsoft login' }, { status: 500 });
  }
}
