/**
 * MCP Tools: per-user key/value memory for the AI assistant.
 *
 * Backed by the AiMemory table. Each user has their own keyspace —
 * the (userId, key) unique constraint enforces this at the DB level,
 * and every handler scopes its queries to the calling user's id.
 *
 * Use these to persist facts, preferences, and ongoing context across
 * chat sessions. `read_memory` with no key returns the index of entries.
 */

import prisma from '@/lib/db';
import type { McpToolDef } from './registry';

const ALLOWED_TYPES = ['user', 'project', 'feedback', 'reference', 'general'] as const;
type MemoryType = (typeof ALLOWED_TYPES)[number];

const MAX_KEY_LEN = 200;
const MAX_VALUE_LEN = 64 * 1024;

function asKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return null;
  return trimmed;
}

export const memoryTools: McpToolDef[] = [
  {
    name: 'read_memory',
    description:
      'Read a persisted memory entry by key. Omit `key` to list the index of all stored entries (key, type, updatedAt) for the current user. Memory is scoped per user.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Memory key to fetch. Omit to list all entries.',
        },
      },
    },
    adminOnly: false,
    handler: async (input, user) => {
      if (input.key === undefined || input.key === null || input.key === '') {
        const entries = await prisma.aiMemory.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: 'desc' },
          select: { key: true, type: true, updatedAt: true },
        });
        return {
          count: entries.length,
          entries: entries.map((e) => ({
            key: e.key,
            type: e.type,
            updatedAt: e.updatedAt.toISOString(),
          })),
        };
      }

      const key = asKey(input.key);
      if (!key) return { error: `key must be a non-empty string up to ${MAX_KEY_LEN} chars` };

      const entry = await prisma.aiMemory.findUnique({
        where: { userId_key: { userId: user.id, key } },
        select: { key: true, type: true, value: true, createdAt: true, updatedAt: true },
      });
      if (!entry) return { found: false, key };

      return {
        found: true,
        key: entry.key,
        type: entry.type,
        value: entry.value,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };
    },
  },

  {
    name: 'write_memory',
    description:
      'Create or overwrite a memory entry for the current user. `key` identifies the entry; calling write_memory again with the same key replaces the value. Optional `type` categorizes the entry (user|project|feedback|reference|general).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: `Memory key (max ${MAX_KEY_LEN} chars)` },
        value: { type: 'string', description: `Memory value / payload (max ${MAX_VALUE_LEN} chars)` },
        type: {
          type: 'string',
          enum: [...ALLOWED_TYPES],
          description: 'Category for the entry. Defaults to "general".',
        },
      },
      required: ['key', 'value'],
    },
    adminOnly: false,
    handler: async (input, user) => {
      const key = asKey(input.key);
      if (!key) return { error: `key must be a non-empty string up to ${MAX_KEY_LEN} chars` };

      if (typeof input.value !== 'string') return { error: 'value must be a string' };
      if (input.value.length > MAX_VALUE_LEN) {
        return { error: `value exceeds ${MAX_VALUE_LEN} chars` };
      }

      let type: MemoryType = 'general';
      if (input.type !== undefined) {
        if (typeof input.type !== 'string' || !ALLOWED_TYPES.includes(input.type as MemoryType)) {
          return { error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` };
        }
        type = input.type as MemoryType;
      }

      const entry = await prisma.aiMemory.upsert({
        where: { userId_key: { userId: user.id, key } },
        create: { userId: user.id, key, type, value: input.value },
        update: { type, value: input.value },
        select: { key: true, type: true, createdAt: true, updatedAt: true },
      });

      return {
        ok: true,
        key: entry.key,
        type: entry.type,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      };
    },
  },
];
