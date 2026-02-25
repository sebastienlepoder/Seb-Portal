'use client';

import { useEffect } from 'react';
import { useMicrosoftStatus, useOneNote } from '@/hooks/useMicrosoft';
import { BookOpen, ExternalLink, Plus, RefreshCw, Link2 } from 'lucide-react';

export default function OneNoteWidget() {
  const { status, loading: statusLoading, connect } = useMicrosoftStatus();
  const { notebooks, loading, error, fetchNotebooks } = useOneNote();

  useEffect(() => {
    if (status?.connected) {
      fetchNotebooks();
    }
  }, [status?.connected, fetchNotebooks]);

  if (statusLoading) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="animate-pulse h-32 bg-portal-border/50 rounded-lg" />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-portal-text">OneNote</h3>
        </div>
        <p className="text-xs text-portal-muted mb-3">Connect your Microsoft account to view notes</p>
        <button
          onClick={connect}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
        >
          <Link2 className="h-3 w-3" />
          Connect Microsoft
        </button>
      </div>
    );
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-portal-text">OneNote</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchNotebooks}
            className="p-1 text-portal-muted hover:text-portal-text transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="/onenote"
            className="p-1 text-portal-muted hover:text-portal-text transition-colors"
            title="Open OneNote"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}

      <div className="space-y-2">
        {notebooks.slice(0, 3).map((notebook) => (
          <a
            key={notebook.id}
            href={notebook.links.oneNoteWebUrl.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-2 bg-portal-bg rounded-lg hover:bg-portal-border/50 transition-colors group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BookOpen className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
              <span className="text-xs text-portal-text truncate">{notebook.displayName}</span>
            </div>
            <ExternalLink className="h-3 w-3 text-portal-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}

        {notebooks.length === 0 && !loading && (
          <p className="text-xs text-portal-muted text-center py-2">No notebooks found</p>
        )}

        {notebooks.length > 3 && (
          <a
            href="/onenote"
            className="block text-xs text-center text-portal-accent hover:underline py-1"
          >
            View all {notebooks.length} notebooks →
          </a>
        )}
      </div>

      <a
        href="/onenote"
        className="flex items-center justify-center gap-1.5 mt-3 px-3 py-1.5 text-xs bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-colors"
      >
        <Plus className="h-3 w-3" />
        Create Note
      </a>
    </div>
  );
}
