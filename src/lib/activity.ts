import prisma from './db';
import { broadcastActivity, type ActivityEvent } from './event-bus';

export type ActivityInput = {
  type: string;
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  actor?: string | null;
  data?: unknown;
};

export async function writeActivity(input: ActivityInput): Promise<void> {
  try {
    const row = await prisma.activity.create({
      data: {
        type: input.type,
        description: input.description,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actor: input.actor ?? null,
        data: input.data !== undefined ? JSON.stringify(input.data) : null,
      },
    });
    const event: ActivityEvent = {
      id: row.id,
      type: row.type,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.actor,
      description: row.description,
      data: input.data ?? null,
      createdAt: row.createdAt.toISOString(),
    };
    broadcastActivity(event);
  } catch (e) {
    console.error('writeActivity error:', e);
  }
}
