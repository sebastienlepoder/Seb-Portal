/**
 * MCP Tool Registry
 * Pluggable architecture for "native action" tools.
 * Each tool has a JSON schema, handler, and permissions.
 */

import type { SessionUser } from '@/types';
import prisma from '@/lib/db';
import { dispatchTask, DispatchError } from '@/lib/agent-dispatch';
import type { TaskPriority } from '@/types/agents';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  adminOnly: boolean;
  handler: (input: Record<string, unknown>, user: SessionUser) => Promise<unknown>;
}

const toolRegistry: McpToolDef[] = [];

// ─── Built-in Tools ──────────────────────────────────────────

// Tool 1: Create a portal tile (working end-to-end native action)
toolRegistry.push({
  name: 'create_portal_tile',
  description: 'Create a new service tile on the portal dashboard',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Service name' },
      url: { type: 'string', description: 'Service URL' },
      section: { type: 'string', description: 'Portal section' },
      description: { type: 'string', description: 'Short description' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      requiresVPN: { type: 'boolean', description: 'Requires VPN' },
    },
    required: ['name', 'url'],
  },
  adminOnly: true,
  handler: async (input) => {
    const slug = (input.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const service = await prisma.service.create({
      data: {
        slug,
        name: input.name as string,
        url: input.url as string,
        section: (input.section as string) || 'General',
        description: (input.description as string) || null,
        tags: input.tags ? JSON.stringify(input.tags) : null,
        requiresVPN: (input.requiresVPN as boolean) || false,
      },
    });
    return { created: true, service: { id: service.id, slug: service.slug, name: service.name } };
  },
});

// Tool 2: Trigger n8n workflow
toolRegistry.push({
  name: 'trigger_n8n_workflow',
  description: 'Trigger an n8n workflow via webhook URL',
  inputSchema: {
    type: 'object',
    properties: {
      webhookUrl: { type: 'string', description: 'n8n webhook URL' },
      payload: { type: 'object', description: 'JSON payload to send' },
    },
    required: ['webhookUrl'],
  },
  adminOnly: false,
  handler: async (input) => {
    const url = input.webhookUrl as string;
    if (!url.includes('n8n') && !url.includes('webhook')) {
      throw new Error('URL does not appear to be an n8n webhook');
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.payload || {}),
      signal: AbortSignal.timeout(10000),
    });
    return { triggered: true, status: res.status, body: await res.text().catch(() => '') };
  },
});

// Tool 3: Fetch Shopify metrics (scaffold)
toolRegistry.push({
  name: 'fetch_shopify_metrics',
  description: 'Fetch basic Shopify store metrics (orders, revenue snapshot)',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  adminOnly: true,
  handler: async () => {
    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shopDomain || !accessToken) {
      return { error: 'Shopify not configured', configured: false };
    }

    const today = new Date().toISOString().split('T')[0];
    const ordersUrl = `https://${shopDomain}/admin/api/2024-01/orders/count.json?created_at_min=${today}T00:00:00Z&status=any`;

    const res = await fetch(ordersUrl, {
      headers: { 'X-Shopify-Access-Token': accessToken },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { error: `Shopify API error: ${res.status}`, configured: true };
    }

    const data = await res.json();
    return { configured: true, ordersToday: data.count };
  },
});

// Tool 4: Dispatch a task to a project's agent worker
toolRegistry.push({
  name: 'dispatch_to_project',
  description:
    'Dispatch a development task to a project\'s headless agent worker. The worker clones the GitHub repo and runs Claude with the chosen agent\'s system prompt to make code changes. Returns a taskId you can use to track progress.',
  inputSchema: {
    type: 'object',
    properties: {
      project_name: {
        type: 'string',
        description: 'Project slug or human name (e.g. "amonis-finance" or "Amonis Finance")',
      },
      task_title: { type: 'string', description: 'Short, imperative title (max 200 chars)' },
      task_description: {
        type: 'string',
        description: 'Detailed instructions for the agent (the agent receives this verbatim)',
      },
      agent_role: {
        type: 'string',
        description:
          'Optional: agent slug, role name, or id. If omitted, the system auto-matches by expertise.',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'urgent'],
        description: 'Task priority. Defaults to "normal".',
      },
    },
    required: ['project_name', 'task_title', 'task_description'],
  },
  adminOnly: false,
  handler: async (input, user) => {
    try {
      const result = await dispatchTask({
        projectName: String(input.project_name ?? ''),
        taskTitle: String(input.task_title ?? ''),
        taskDescription: String(input.task_description ?? ''),
        agentRole: input.agent_role ? String(input.agent_role) : null,
        priority: (input.priority as TaskPriority) ?? 'normal',
        createdById: user.id === 'amonis-worker' ? null : user.id,
      });
      return {
        success: true,
        taskId: result.taskId,
        message: result.message,
        taskUrl: result.taskUrl,
        agent: result.matchedAgentSlug,
        project: result.matchedProjectSlug,
      };
    } catch (e) {
      if (e instanceof DispatchError) {
        return { success: false, error: e.message, code: e.code };
      }
      throw e;
    }
  },
});

// ─── Registry Functions ──────────────────────────────────────

export function getMcpTools(isAdmin: boolean): McpToolDef[] {
  if (isAdmin) return toolRegistry;
  return toolRegistry.filter((t) => !t.adminOnly);
}

export async function executeMcpTool(
  name: string,
  input: Record<string, unknown>,
  user: SessionUser
): Promise<unknown> {
  const tool = toolRegistry.find((t) => t.name === name);
  if (!tool) throw new Error('TOOL_NOT_FOUND');
  if (tool.adminOnly && user.role !== 'admin') throw new Error('ADMIN_ONLY');
  return tool.handler(input, user);
}

export function registerMcpTool(tool: McpToolDef) {
  const existing = toolRegistry.findIndex((t) => t.name === tool.name);
  if (existing >= 0) toolRegistry[existing] = tool;
  else toolRegistry.push(tool);
}
