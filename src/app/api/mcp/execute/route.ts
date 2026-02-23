import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { verifyCsrf } from '@/lib/csrf';
import { auditLog, getClientIp } from '@/lib/audit';
import { executeMcpTool } from '@/server/mcp/registry';

/**
 * Execute an MCP tool action with input parameters.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiAuth();
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

    const result = await executeMcpTool(toolName, input, user);

    await auditLog({
      userId: user.id,
      action: 'mcp_execute',
      details: { toolName, input },
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    if ((e as Error).message === 'TOOL_NOT_FOUND') {
      return NextResponse.json({ ok: false, error: 'Tool not found' }, { status: 404 });
    }
    if ((e as Error).message === 'ADMIN_ONLY') {
      return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
    }
    console.error('MCP execute error:', e);
    return NextResponse.json({ ok: false, error: 'Execution failed' }, { status: 500 });
  }
}
