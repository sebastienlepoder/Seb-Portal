import { NextResponse } from 'next/server';

// The custom server (server.js at repo root) intercepts HTTP upgrades for
// this path and hands them to the Claude CLI WebSocket bridge. A plain HTTP
// GET reaches Next only when the request isn't a WebSocket upgrade — most
// commonly a dev hitting the URL in a browser tab.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Upgrade Required',
      message: 'This endpoint requires a WebSocket upgrade.',
    },
    { status: 426, headers: { Upgrade: 'websocket', Connection: 'Upgrade' } }
  );
}
