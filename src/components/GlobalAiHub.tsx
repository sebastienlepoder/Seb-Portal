'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '@/hooks/usePortal';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { cn } from '@/lib/utils';

const OPEN_KEY = 'ai-hub:global-open';
const WIDTH_KEY = 'ai-hub:global-width';
const MIN_WIDTH = 340;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 460;

/**
 * App-wide AI Hub. Mounted once at the layout level so the conversation
 * persists across navigation. A floating top-right button toggles a
 * non-modal docked panel (resizable from its left edge) — the page stays
 * fully interactive while it's open. Hidden on /login and on the dedicated
 * /ai page (which already renders the chat full-screen).
 */
export function GlobalAiHub() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const w = Number(window.localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(w) && w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w);
      setOpen(window.localStorage.getItem(OPEN_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open, mounted]);

  // Drag-to-resize from the panel's left edge.
  const widthRef = useRef(width);
  widthRef.current = width;
  useEffect(() => {
    if (!resizing) return;
    const onMove = (clientX: number) => {
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - clientX));
      setWidth(next);
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const stop = () => {
      setResizing(false);
      try {
        window.localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizing]);

  if (!mounted || loading || !user) return null;
  // The /ai page and /login render their own (or no) chat — skip there.
  if (pathname === '/ai' || pathname === '/login') return null;

  const csrfToken = (user as { csrfToken?: string }).csrfToken;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI Hub"
          title="AI Hub"
          className="fixed top-2.5 right-2.5 z-[60] inline-flex items-center justify-center h-9 w-9 rounded-full bg-portal-accent text-white shadow-lg shadow-portal-accent/30 hover:bg-portal-accent-dark transition-colors focus:outline-none focus:ring-2 focus:ring-portal-accent"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      )}

      {open && (
        <aside
          className="fixed top-0 right-0 bottom-0 z-[60] bg-portal-bg border-l border-portal-border shadow-2xl flex animate-fade-in"
          style={{ width: `min(100vw, ${width}px)` }}
          aria-label="AI Hub panel"
        >
          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(e) => {
              e.preventDefault();
              setResizing(true);
            }}
            onTouchStart={() => setResizing(true)}
            className="w-1 cursor-col-resize bg-transparent hover:bg-portal-accent/40 shrink-0"
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-3 h-10 border-b border-portal-border shrink-0">
              <span className="text-xs font-semibold text-portal-text flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-portal-accent" />
                AI Hub
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close AI Hub"
                className="p-1 text-portal-muted hover:text-portal-text rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <AiChatPanel csrfToken={csrfToken} />
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
