import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      select: { id: true, name: true, slug: true, icon: true, iconGenerated: true },
      take: 20,
    });
    return NextResponse.json({ ok: true, services });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
