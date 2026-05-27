import prisma from '../db';
import { writeActivity } from '../activity';
import { executeMcpTool } from '@/server/mcp/registry';
import { redactSecretsInObject, redactSecrets } from '../security/secret-scanner';
import type { SessionUser } from '@/types';

const MAX_INPUT_BYTES = 2048;
const MAX_RESULT_BYTES = 500;

export type CallerKind = 'user' | 'scheduler' | 'api';

export interface ExecOptions {
  callerKind?: CallerKind;
}

/**
 * Run an MCP tool with full audit/trust logging.
 *
 * - Sanitises input through the secret scrubber before persistence
 * - Captures duration, success/failure, and a result preview
 * - Writes an Activity event so the live feed shows the call
 * - Re-throws on tool failure so callers' existing error paths work
 */
export async function executeMcpToolWithAudit(
  toolName: string,
  input: Record<string, unknown>,
  user: SessionUser,
  opts: ExecOptions = {}
): Promise<unknown> {
  const startedAt = Date.now();
  let success = false;
  let result: unknown = undefined;
  let errorMessage: string | undefined;

  try {
    result = await executeMcpTool(toolName, input, user);
    success = true;
    return result;
  } catch (e) {
    errorMessage = (e as Error).message ?? 'unknown error';
    throw e;
  } finally {
    const durationMs = Date.now() - startedAt;
    try {
      const sanitisedInput = clampJson(redactSecretsInObject(input), MAX_INPUT_BYTES);
      const sanitisedPreview =
        result === undefined
          ? null
          : clampString(redactSecrets(safeStringify(result)), MAX_RESULT_BYTES);

      await prisma.mcpCallLog.create({
        data: {
          toolName,
          callerId: user.id,
          callerKind: opts.callerKind ?? 'user',
          success,
          durationMs,
          inputJson: sanitisedInput,
          resultPreview: sanitisedPreview,
          error: success ? null : (errorMessage ?? null),
        },
      });

      await writeActivity({
        type: success ? 'mcp.executed' : 'mcp.failed',
        description: success
          ? `MCP tool "${toolName}" executed (${durationMs}ms)`
          : `MCP tool "${toolName}" failed: ${errorMessage}`,
        entityType: 'tool',
        entityId: toolName,
        actor: user.id,
        data: { durationMs, success },
      });
    } catch (logErr) {
      console.error('McpCallLog write failed:', logErr);
    }
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampString(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  return s.slice(0, maxBytes) + '…';
}

function clampJson(value: unknown, maxBytes: number): string {
  const s = safeStringify(value);
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  return s.slice(0, maxBytes) + '…';
}
