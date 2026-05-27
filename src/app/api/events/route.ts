import { NextRequest } from 'next/server';
import { activityBus, type ActivityEvent } from '@/lib/event-bus';
import { getApiUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getApiUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // client gone — cleanup() will be called by cancel/abort
        }
      };

      send({ type: 'connected', timestamp: Date.now() });

      const handler = (event: ActivityEvent) => send(event);
      activityBus.on('activity', handler);

      // Comment-line heartbeat keeps proxies (NPM, nginx) from
      // closing the idle connection.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      cleanup = () => {
        activityBus.off('activity', handler);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  request.signal.addEventListener('abort', () => cleanup?.(), { once: true });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
