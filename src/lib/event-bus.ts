import { EventEmitter } from 'node:events';

export type ActivityEvent = {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  description: string;
  data: unknown;
  createdAt: string;
};

class ActivityBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

const g = globalThis as typeof globalThis & { __activityBus?: ActivityBus };
export const activityBus: ActivityBus = g.__activityBus ?? new ActivityBus();
g.__activityBus = activityBus;

export function broadcastActivity(event: ActivityEvent): void {
  activityBus.emit('activity', event);
}
