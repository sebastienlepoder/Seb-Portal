'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IframeModalProps {
  url: string;
  title: string;
  onClose: () => void;
  /** When true, fills its parent container instead of covering the full screen */
  inline?: boolean;
}

export function IframeModal({ url, title, onClose, inline = false }: IframeModalProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Reset state when URL changes
    setBlocked(false);
    setLoading(true);
  }, [url]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setBlocked(true);
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleLoad = () => setLoading(false);
  const handleError = () => { setBlocked(true); setLoading(false); };

  if (blocked) {
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
          <p className="text-sm text-portal-text-dim mb-4">
            <strong>{title}</strong> blocks iframe embedding (X-Frame-Options or CSP).
          </p>
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
      {/* Iframe */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-portal-bg">
            <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
          </div>
        )}
        <iframe
          src={url}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          onError={handleError}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          title={title}
        />
      </div>
    </div>
  );
}
