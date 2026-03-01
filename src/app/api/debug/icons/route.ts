import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  const results: any = {};
  
  try {
    results.userCount = await prisma.user.count();
  } catch (e) {
    results.userError = String(e).substring(0, 100);
  }
  
  try {
    results.todoCount = await prisma.todo.count();
  } catch (e) {
    results.todoError = String(e).substring(0, 100);
  }
  
  try {
    results.serviceCount = await prisma.service.count();
  } catch (e) {
    results.serviceError = String(e).substring(0, 100);
  }
  
  try {
    const services = await prisma.service.findMany({
      select: { name: true, icon: true },
      take: 3,
    });
    results.services = services;
  } catch (e) {
    results.servicesError = String(e).substring(0, 100);
  }
  
  return NextResponse.json({ ok: true, results });
}
