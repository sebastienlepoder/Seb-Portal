'use client';

import { useState, useEffect } from 'react';
import { X, ExternalLink, AlertTriangle } from 'lucide-react';

interface IframeModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function IframeModal({ url, title, onClose }: IframeModalProps) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Timeout: if iframe doesn't load in 5s, likely blocked
    const timer = setTimeout(() => {
      if (loading) {
        setBlocked(true);
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setBlocked(true);
    setLoading(false);
  };

  if (blocked) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-portal-card border border-portal-border rounded-xl p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            <h3 className="text-lg font-semibold text-portal-text">Cannot Embed</h3>
          </div>
          <p className="text-sm text-portal-text-dim mb-4">
            <strong>{title}</strong> blocks iframe embedding (X-Frame-Options or CSP).
            Opening in a new tab instead.
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
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col animate-fade-in">
      <div className="flex items-center justify-between p-3 bg-portal-card border-b border-portal-border">
        <span className="text-sm font-medium text-portal-text">{title}</span>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-portal-muted hover:text-portal-text transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="p-1.5 text-portal-muted hover:text-portal-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
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
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
          title={title}
        />
      </div>
    </div>
  );
}
