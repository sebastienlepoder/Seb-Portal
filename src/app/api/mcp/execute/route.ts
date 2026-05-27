import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import { executeMcpToolWithAudit } from '@/lib/mcp/audit';

/**
 * Execute an MCP tool action with input parameters. Wrapped in
 * executeMcpToolWithAudit so every call lands in McpCallLog with
 * duration, success/failure, and a secret-scrubbed payload.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireApiAuth();
  } catch {
    return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!(await verifyCsrf(request))) {
    return NextResponse.json({ ok: false, error: 'CSRF validation failed' }, { status: 403 });
  }

  const { toolName, input } = (await request.json()) as {
    toolName: string;
    input: Record<string, unknown>;
  };

  if (!toolName) {
    return NextResponse.json({ ok: false, error: 'toolName required' }, { status: 400 });
  }

  try {
    const result = await executeMcpToolWithAudit(toolName, input, user, { callerKind: 'user' });

    await auditLog({
      userId: user.id,
      action: 'mcp_execute',
      details: { toolName, input },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'TOOL_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: 'Tool not found' }, { status: 404 });
    }
    if (msg === 'ADMIN_ONLY') {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }
    console.error('MCP execute error:', e);
    return NextResponse.json({ ok: false, error: 'Execution failed' }, { status: 500 });
  }
}
