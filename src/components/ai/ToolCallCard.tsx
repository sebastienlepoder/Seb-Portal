'use client';

import { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCall } from '@/types';

export function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);

  const status = call.error
    ? { Icon: XCircle, tone: 'text-red-400' }
    : call.pending
    ? { Icon: Loader2, tone: 'text-amber-400 animate-spin' }
    : { Icon: CheckCircle2, tone: 'text-emerald-400' };

  const inputStr = (() => {
    try {
      return JSON.stringify(call.input, null, 2);
    } catch {
      return String(call.input);
    }
  })();

  const resultStr = call.error ?? call.result ?? '';

  return (
    <div className="border border-portal-border rounded-md bg-portal-bg/40 my-1.5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-portal-card-hover transition-colors text-xs"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-portal-muted shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-portal-muted shrink-0" />
        )}
        <Wrench className="h-3 w-3 text-portal-accent shrink-0" />
        <span className="font-mono text-portal-text">{call.name}</span>
        <status.Icon className={cn('h-3 w-3 ml-auto shrink-0', status.tone)} />
      </button>

      {open && (
        <div className="px-2.5 pb-2 space-y-1.5 text-[11px] font-mono">
          <div>
            <div className="text-portal-muted mb-0.5">input:</div>
            <pre className="bg-portal-card border border-portal-border rounded p-1.5 text-portal-text whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {inputStr}
            </pre>
          </div>
          {resultStr && (
            <div>
              <div className={cn('mb-0.5', call.error ? 'text-red-400' : 'text-portal-muted')}>
                {call.error ? 'error:' : 'result:'}
              </div>
              <pre className="bg-portal-card border border-portal-border rounded p-1.5 text-portal-text whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {resultStr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
