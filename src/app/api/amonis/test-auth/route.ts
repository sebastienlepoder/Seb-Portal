import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

const AMONIS_API_TOKEN = process.env.AMONIS_API_TOKEN || 'amonis-claw-2026';

export async function GET() {
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  
  return NextResponse.json({
    hasAuthHeader: !!authHeader,
    authHeaderValue: authHeader ? authHeader.substring(0, 20) + '...' : null,
    expectedToken: AMONIS_API_TOKEN.substring(0, 10) + '...',
    tokenMatch: authHeader === `Bearer ${AMONIS_API_TOKEN}`,
  });
}
