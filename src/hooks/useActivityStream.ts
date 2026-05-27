'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityEvent } from '@/lib/event-bus';

export type { ActivityEvent };

export function useActivityStream(opts?: {
  initialLimit?: number;
  bufferSize?: number;
  typePrefix?: string;
}) {
  const initialLimit = opts?.initialLimit ?? 50;
  const bufferSize = opts?.bufferSize ?? 200;
  const typePrefix = opts?.typePrefix;

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial history load
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: String(initialLimit) });
    if (typePrefix) params.set('type', typePrefix);
    fetch(`/api/activity?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data?.ok) return;
        setEvents(data.data as ActivityEvent[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialLimit, typePrefix]);

  // Live SSE subscription with exponential-backoff reconnect
  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;

    const connect = () => {
      es = new EventSource('/api/events');

      es.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      es.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data);
          if (payload?.type === 'connected') return;
          if (typePrefix && typeof payload?.type === 'string' && !payload.type.startsWith(typePrefix)) {
            return;
          }
          setEvents((prev) => [payload as ActivityEvent, ...prev].slice(0, bufferSize));
        } catch {
          /* malformed line */
        }
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();
        es = null;
        if (stopped) return;
        const delay = Math.min(1000 * 2 ** retryRef.current, 30_000);
        retryRef.current += 1;
        retryTimerRef.current = setTimeout(() => {
          if (!stopped) connect();
        }, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      es?.close();
    };
  }, [bufferSize, typePrefix]);

  return { events, connected };
}
