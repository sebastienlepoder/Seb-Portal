'use client';

import { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IframeModalProps {
  url: string;
  title: string;
  onClose: () => void;
  /** When true, fills its parent container instead of covering the full screen */
  inline?: boolean;
}

type Phase = 'checking' | 'loading' | 'blocked' | 'ready';

export function IframeModal({ url, title, onClose, inline = false }: IframeModalProps) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [blockReason, setBlockReason] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const confirmedRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPhase('checking');
    setBlockReason('');
    confirmedRef.current = false;
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    const controller = new AbortController();

    // Server-side pre-check: inspect X-Frame-Options / CSP headers before loading iframe.
    // This avoids the client-side ambiguity where chrome-error:// pages also throw
    // SecurityError when accessed via contentWindow.location, making them
    // indistinguishable from legitimate cross-origin loads.
    fetch(`/api/check-embed?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { canEmbed: boolean | null; reason?: string }) => {
        if (data.canEmbed === false) {
          // Server confirmed blocking headers — skip iframe entirely
          setBlockReason(data.reason ?? '');
          setPhase('blocked');
        } else {
          // canEmbed=true or canEmbed=null (unreachable → try anyway)
          setPhase('loading');
          fallbackTimerRef.current = setTimeout(() => {
            if (!confirmedRef.current) setPhase('blocked');
          }, 5000);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPhase('loading');
          fallbackTimerRef.current = setTimeout(() => {
            if (!confirmedRef.current) setPhase('blocked');
          }, 5000);
        }
      });

    return () => {
      controller.abort();
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, [url]);

  const handleLoad = () => {
    // Server pre-check already passed (canEmbed=true or null).
    // SecurityError → cross-origin page loaded successfully.
    // Real URL     → same-origin success.
    // about:blank  → spurious initial event, ignore.
    try {
      const href = iframeRef.current?.contentWindow?.location.href ?? '';
      if (href === '' || href === 'about:blank') return;
      confirmedRef.current = true;
      setPhase('ready');
    } catch {
      // SecurityError: cross-origin content loaded — trust the server pre-check
      confirmedRef.current = true;
      setPhase('ready');
    }
  };

  const handleError = () => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    setPhase('blocked');
  };

  // ── Blocked ───────────────────────────────────────────────────────────────
  if (phase === 'blocked') {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center p-6',
        inline ? 'flex-1' : 'fixed inset-0 bg-black/60 z-50 animate-fade-in'
      )}>
        <div className="bg-portal-card border border-portal-border rounded-xl p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <h3 className="text-lg font-semibold text-portal-text">Cannot Embed</h3>
          </div>
          <p className="text-sm text-portal-muted mb-1">
            <strong className="text-portal-text">{title}</strong> bloque l&apos;intégration en iframe.
          </p>
          {blockReason ? (
            <p className="text-xs text-portal-muted/70 font-mono mb-4">{blockReason}</p>
          ) : (
            <p className="text-xs text-portal-muted mb-4">(X-Frame-Options ou CSP)</p>
          )}
          <div className="flex gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </a>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-portal-card border border-portal-border text-portal-text rounded-lg text-sm hover:bg-portal-card-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Checking / Loading / Ready ────────────────────────────────────────────
  return (
    <div className={cn(
      'flex flex-col',
      inline ? 'flex-1 overflow-hidden' : 'fixed inset-0 bg-black/60 z-50 animate-fade-in'
    )}>
      {/* Title bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-portal-card border-b border-portal-border">
        <span className="text-sm font-medium text-portal-text truncate">{title}</span>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        {/* Spinner while verifying headers or iframe loading */}
        {(phase === 'checking' || phase === 'loading') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-portal-bg z-10">
            <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
            <span className="text-xs text-portal-muted">
              {phase === 'checking' ? `Checking ${title}…` : `Loading ${title}…`}
            </span>
          </div>
        )}
        {/* Iframe is only mounted after server pre-check passes */}
        {phase !== 'checking' && (
          <iframe
            ref={iframeRef}
            src={url}
            className="w-full h-full border-0"
            onLoad={handleLoad}
            onError={handleError}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            title={title}
          />
        )}
      </div>
    </div>
  );
}
