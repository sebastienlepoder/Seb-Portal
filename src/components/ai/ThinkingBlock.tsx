'use client';

import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';

export function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
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
        <Brain className="h-3 w-3 text-purple-400 shrink-0" />
        <span className="text-portal-muted italic">Thinking</span>
      </button>
      {open && (
        <pre className="px-2.5 pb-2 text-[11px] text-portal-muted whitespace-pre-wrap font-sans italic max-h-48 overflow-y-auto">
          {text}
        </pre>
      )}
    </div>
  );
}
