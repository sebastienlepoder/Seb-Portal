import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const users = await prisma.user.findMany({ 
      select: { id: true, email: true, role: true } 
    });
    
    const todosByUser = await Promise.all(
      users.map(async (u) => ({
        email: u.email,
        role: u.role,
        todoCount: await prisma.todo.count({ where: { userId: u.id } })
      }))
    );
    
    return NextResponse.json({ ok: true, users: todosByUser });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
