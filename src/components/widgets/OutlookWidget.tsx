'use client';

import { useEffect } from 'react';
import { useMicrosoftStatus, useOutlookMail } from '@/hooks/useMicrosoft';
import { Mail, ExternalLink, RefreshCw, Link2, Paperclip } from 'lucide-react';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

export default function OutlookWidget() {
  const { status, loading: statusLoading, connect } = useMicrosoftStatus();
  const { messages, loading, error, unreadCount, fetchMessages } = useOutlookMail();

  useEffect(() => {
    if (status?.connected) {
      fetchMessages('inbox', 5);
    }
  }, [status?.connected, fetchMessages]);

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
          <Mail className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-portal-text">Outlook</h3>
        </div>
        <p className="text-xs text-portal-muted mb-3">Connect your Microsoft account to view emails</p>
        <button
          onClick={connect}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
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
          <Mail className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-portal-text">Outlook</h3>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchMessages('inbox', 5)}
            className="p-1 text-portal-muted hover:text-portal-text transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="/mail"
            className="p-1 text-portal-muted hover:text-portal-text transition-colors"
            title="Open Mail"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}

      <div className="space-y-1">
        {messages.slice(0, 5).map((msg) => (
          <a
            key={msg.id}
            href={msg.webLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`block p-2 rounded-lg transition-colors ${
              msg.isRead 
                ? 'bg-portal-bg hover:bg-portal-border/50' 
                : 'bg-blue-500/10 hover:bg-blue-500/20 border-l-2 border-blue-500'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className={`text-[11px] truncate ${msg.isRead ? 'text-portal-muted' : 'text-portal-text font-medium'}`}>
                {msg.from.emailAddress.name || msg.from.emailAddress.address}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                {msg.hasAttachments && <Paperclip className="h-2.5 w-2.5 text-portal-muted" />}
                <span className="text-[10px] text-portal-muted">{formatTime(msg.receivedDateTime)}</span>
              </div>
            </div>
            <p className={`text-xs truncate ${msg.isRead ? 'text-portal-muted' : 'text-portal-text'}`}>
              {msg.subject || '(no subject)'}
            </p>
          </a>
        ))}

        {messages.length === 0 && !loading && (
          <p className="text-xs text-portal-muted text-center py-2">No messages</p>
        )}
      </div>

      <a
        href="/mail"
        className="flex items-center justify-center gap-1.5 mt-3 px-3 py-1.5 text-xs bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"
      >
        Open Inbox →
      </a>
    </div>
  );
}
