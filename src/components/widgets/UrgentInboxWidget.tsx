'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Check, ExternalLink, Inbox } from 'lucide-react';
import { cn, formatRelativeTime, priorityColor } from '@/lib/utils';

interface UrgentItem {
  id: string;
  title: string;
  snippet: string | null;
  priority: string;
  actionUrl: string | null;
  done: boolean;
  createdAt: string;
  source: string;
}

export function UrgentInboxWidget({ csrfToken }: { csrfToken?: string }) {
  const [items, setItems] = useState<UrgentItem[]>([]);

  useEffect(() => {
    fetch('/api/webhook/urgent')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setItems(data.data);
      })
      .catch(() => {});
  }, []);

  const markDone = async (id: string) => {
    await fetch('/api/webhook/urgent', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ id, done: true }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (items.length === 0) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-portal-muted text-sm">
          <Inbox className="h-4 w-4" />
          <span>No urgent items</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/20 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-portal-muted uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Urgent Inbox
        </div>
        <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className={cn(
              'border rounded-lg p-2.5 text-xs',
              priorityColor(item.priority)
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{item.title}</div>
                {item.snippet && (
                  <div className="text-portal-muted mt-0.5 line-clamp-2">{item.snippet}</div>
                )}
                <div className="text-portal-muted mt-1 text-[10px]">
                  {formatRelativeTime(item.createdAt)} · {item.source}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {item.actionUrl && (
                  <a
                    href={item.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  onClick={() => markDone(item.id)}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                  title="Mark done"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
