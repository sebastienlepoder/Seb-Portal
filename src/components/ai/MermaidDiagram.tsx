'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid(): Promise<typeof import('mermaid').default> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return m;
    });
  }
  return mermaidLoader;
}

let idCounter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++idCounter}`;

    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled || !containerRef.current) return;
        try {
          const { svg } = await mermaid.render(id, code);
          if (cancelled || !containerRef.current) return;
          containerRef.current.innerHTML = svg;
          setRendered(true);
          setError(null);
        } catch (e) {
          setError((e as Error).message);
        }
      })
      .catch((e) => setError((e as Error).message));

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-2 border border-red-500/30 bg-red-500/5 text-red-400 rounded p-2 text-xs flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Mermaid render failed</div>
          <div className="text-portal-muted font-mono mt-0.5 break-all">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2">
      {!rendered && (
        <div className="text-portal-muted text-xs flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Rendering diagram…
        </div>
      )}
      <div ref={containerRef} className="overflow-x-auto" />
    </div>
  );
}
