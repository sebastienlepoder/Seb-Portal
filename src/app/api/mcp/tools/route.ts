import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getMcpTools } from '@/server/mcp/registry';

/**
 * MCP Tools Registry — lists available tools.
 */
export async function GET() {
  try {
    const user = await requireApiAuth();
    const tools = getMcpTools(user.role === 'admin');

    return NextResponse.json({
      ok: true,
      data: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        adminOnly: t.adminOnly,
      })),
    });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
