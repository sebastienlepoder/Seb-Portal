import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/amonis/tasks/[id] - Get task details
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const task = await prisma.amonisTask.findUnique({
    where: { id: params.id },
    include: { agent: true },
  });

  if (!task) {
    return NextResponse.json({ ok: false, error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: task });
}

// PATCH /api/amonis/tasks/[id] - Update task
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const updateData: Record<string, unknown> = {};

  // Handle status changes
  if (body.status) {
    updateData.status = body.status;
    
    if (body.status === 'in_progress' && !body.startedAt) {
      updateData.startedAt = new Date();
    }
    if (body.status === 'approved' || body.status === 'done') {
      updateData.reviewedAt = new Date();
    }
    if (body.status === 'done') {
      updateData.completedAt = new Date();
    }
  }

  // Handle other fields
  const allowedFields = [
    'title', 'description', 'agentId', 'priority',
    'workSummary', 'filesChanged', 'screenshotBefore', 'screenshotAfter',
    'designerNotes', 'designerApproved', 'devilNotes', 'devilApproved',
    'buildNumber',
  ];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updateData[field] = body[field];
    }
  }

  const task = await prisma.amonisTask.update({
    where: { id: params.id },
    data: updateData,
    include: { agent: true },
  });

  return NextResponse.json({ ok: true, data: task });
}

// DELETE /api/amonis/tasks/[id] - Delete task
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  await prisma.amonisTask.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
