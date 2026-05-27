import prisma from '../db';
import { executeMcpTool } from '@/server/mcp/registry';
import type { SessionUser } from '@/types';

export type DispatchKind = 'mcp' | 'webhook' | 'task';

export interface McpPayload {
  toolName: string;
  input?: Record<string, unknown>;
}

export interface WebhookPayload {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TaskPayload {
  projectId: string;
  title: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  agentProfileId?: string;
  autoMerge?: boolean;
}

export type DispatchResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

const SCHEDULER_USER: SessionUser = {
  id: 'scheduler',
  email: 'scheduler@portal.local',
  role: 'admin',
};

/**
 * Run a recurring schedule's payload against the chosen dispatch target.
 * Each kind isolates its own failure so a single bad webhook can't crash
 * the worker loop.
 */
export async function dispatchScheduled(
  kind: DispatchKind,
  payloadJson: string
): Promise<DispatchResult> {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, error: 'Invalid JSON payload' };
  }

  try {
    switch (kind) {
      case 'mcp':
        return await dispatchMcp(payload as McpPayload);
      case 'webhook':
        return await dispatchWebhook(payload as WebhookPayload);
      case 'task':
        return await dispatchTask(payload as TaskPayload);
      default:
        return { ok: false, error: `Unknown dispatch kind: ${kind}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function dispatchMcp(p: McpPayload): Promise<DispatchResult> {
  if (!p?.toolName) return { ok: false, error: 'mcp payload missing toolName' };
  const result = await executeMcpTool(p.toolName, p.input ?? {}, SCHEDULER_USER);
  return { ok: true, result };
}

async function dispatchWebhook(p: WebhookPayload): Promise<DispatchResult> {
  if (!p?.url) return { ok: false, error: 'webhook payload missing url' };
  const method = p.method ?? 'POST';
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(p.headers ?? {}),
    },
  };
  if (p.body !== undefined && method !== 'GET') {
    init.body = typeof p.body === 'string' ? p.body : JSON.stringify(p.body);
  }
  const res = await fetch(p.url, init);
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `${res.status} ${res.statusText}: ${text.slice(0, 200)}` };
  }
  return { ok: true, result: { status: res.status, body: text.slice(0, 500) } };
}

async function dispatchTask(p: TaskPayload): Promise<DispatchResult> {
  if (!p?.projectId || !p?.title || !p?.description) {
    return { ok: false, error: 'task payload missing projectId/title/description' };
  }
  const task = await prisma.task.create({
    data: {
      projectId: p.projectId,
      agentProfileId: p.agentProfileId,
      title: p.title,
      description: p.description,
      priority: p.priority ?? 'normal',
      status: 'pending',
      autoMerge: p.autoMerge ?? false,
    },
  });
  return { ok: true, result: { taskId: task.id } };
}

/**
 * Lightweight sanity check on a payload for a given kind, used by the
 * admin API to fail fast on create/update instead of waiting for the
 * next scheduled fire to surface the error.
 */
export function validatePayload(kind: DispatchKind, payloadJson: string): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return 'Payload is not valid JSON';
  }
  const p = payload as Record<string, unknown>;
  switch (kind) {
    case 'mcp':
      if (typeof p.toolName !== 'string' || !p.toolName) return 'mcp: toolName required';
      return null;
    case 'webhook':
      if (typeof p.url !== 'string' || !/^https?:\/\//.test(p.url)) return 'webhook: url must be http(s)';
      return null;
    case 'task':
      if (typeof p.projectId !== 'string') return 'task: projectId required';
      if (typeof p.title !== 'string') return 'task: title required';
      if (typeof p.description !== 'string') return 'task: description required';
      return null;
    default:
      return `Unknown kind: ${kind}`;
  }
}
