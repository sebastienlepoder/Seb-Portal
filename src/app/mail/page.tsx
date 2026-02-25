'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { useMicrosoftStatus, useOutlookMail } from '@/hooks/useMicrosoft';
import PortalSidebar from '@/components/layout/PortalSidebar';
import {
  Mail,
  Send,
  Inbox,
  Archive,
  Trash2,
  RefreshCw,
  Paperclip,
  ExternalLink,
  X,
  Link2,
  Search,
  FileText,
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
} from 'lucide-react';

interface FullMessage {
  id: string;
  subject: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  webLink: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export default function MailPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { status, loading: statusLoading, connect } = useMicrosoftStatus();
  const { messages, loading, error, unreadCount, fetchMessages, sendMail } = useOutlookMail();

  const [folder, setFolder] = useState('inbox');
  const [selectedMessage, setSelectedMessage] = useState<FullMessage | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (status?.connected) {
      fetchMessages(folder, 50);
    }
  }, [status?.connected, folder, fetchMessages]);

  const handleSelectMessage = async (messageId: string) => {
    setLoadingMessage(true);
    try {
      const res = await fetch(`/api/microsoft/mail?messageId=${messageId}`);
      const data = await res.json();
      if (data.ok) {
        setSelectedMessage(data.data);
      }
    } catch (e) {
      console.error('Failed to load message:', e);
    }
    setLoadingMessage(false);
  };

  const handleSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) return;
    setSending(true);
    const result = await sendMail(
      composeTo.split(',').map((e) => e.trim()),
      composeSubject,
      composeBody
    );
    if (result.ok) {
      setShowCompose(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      fetchMessages(folder, 50);
    }
    setSending(false);
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setComposeTo(selectedMessage.from.emailAddress.address);
    setComposeSubject(`Re: ${selectedMessage.subject}`);
    setComposeBody(`\n\n---\nOn ${formatFullDate(selectedMessage.receivedDateTime)}, ${selectedMessage.from.emailAddress.name} wrote:\n> ${selectedMessage.body.content.replace(/<[^>]*>/g, '').substring(0, 500)}...`);
    setShowCompose(true);
  };

  const filteredMessages = searchQuery
    ? messages.filter(
        (m) =>
          m.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.from.emailAddress.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.from.emailAddress.address?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const folders = [
    { id: 'inbox', label: 'Inbox', icon: Inbox, count: unreadCount },
    { id: 'sentitems', label: 'Sent', icon: Send },
    { id: 'drafts', label: 'Drafts', icon: FileText },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'deleteditems', label: 'Trash', icon: Trash2 },
  ];

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      {/* Portal Sidebar */}
      <PortalSidebar user={user} onLogout={logout} />

      {/* Main Content */}
      <div className="flex-1 flex">
        {statusLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : !status?.connected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail className="h-12 w-12 text-blue-400 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-portal-text mb-2">Outlook Mail</h1>
              <p className="text-sm text-portal-muted mb-4">Connect your Microsoft account to access email</p>
              <button
                onClick={connect}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors mx-auto"
              >
                <Link2 className="h-4 w-4" />
                Connect Microsoft Account
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mail Folders Sidebar */}
            <div className="w-48 bg-portal-card border-r border-portal-border flex-shrink-0 flex flex-col">
              <div className="p-3">
                <button
                  onClick={() => setShowCompose(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                >
                  <Send className="h-4 w-4" />
                  Compose
                </button>
              </div>

              <nav className="px-2 flex-1">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setFolder(f.id); setSelectedMessage(null); }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      folder === f.id
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <f.icon className="h-4 w-4" />
                      {f.label}
                    </div>
                    {f.count && f.count > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500 text-white rounded-full">
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="p-3 border-t border-portal-border">
                <p className="text-[10px] text-portal-muted truncate">{status.email}</p>
              </div>
            </div>

            {/* Messages List */}
            <div className={`${selectedMessage ? 'w-80' : 'flex-1'} flex flex-col border-r border-portal-border`}>
              {/* Header */}
              <div className="border-b border-portal-border bg-portal-card px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5 text-blue-400" />
                    <h1 className="text-lg font-bold text-portal-text capitalize">{folder.replace('items', '')}</h1>
                  </div>
                  <button
                    onClick={() => fetchMessages(folder, 50)}
                    className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..."
                    className="w-full bg-portal-bg border border-portal-border rounded-lg pl-9 pr-3 py-2 text-sm text-portal-text focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                {error && (
                  <div className="m-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 text-sm">
                    {error}
                  </div>
                )}

                {filteredMessages.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 border-b border-portal-border hover:bg-portal-card transition-colors text-left ${
                      selectedMessage?.id === msg.id ? 'bg-blue-500/10' : !msg.isRead ? 'bg-blue-500/5' : ''
                    }`}
                  >
                    <div className="flex-shrink-0 mt-1 w-2">
                      {!msg.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-sm truncate ${!msg.isRead ? 'font-semibold text-portal-text' : 'text-portal-muted'}`}>
                          {msg.from.emailAddress.name || msg.from.emailAddress.address}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {msg.hasAttachments && <Paperclip className="h-3 w-3 text-portal-muted" />}
                          <span className="text-[10px] text-portal-muted">{formatDate(msg.receivedDateTime)}</span>
                        </div>
                      </div>
                      <p className={`text-xs truncate ${!msg.isRead ? 'text-portal-text' : 'text-portal-muted'}`}>
                        {msg.subject || '(no subject)'}
                      </p>
                      {!selectedMessage && (
                        <p className="text-[11px] text-portal-muted truncate mt-0.5">
                          {msg.bodyPreview}
                        </p>
                      )}
                    </div>
                  </button>
                ))}

                {filteredMessages.length === 0 && !loading && (
                  <p className="text-sm text-portal-muted text-center py-12">
                    {searchQuery ? 'No matching messages' : 'No messages'}
                  </p>
                )}

                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                )}
              </div>
            </div>

            {/* Message Reading Pane */}
            {selectedMessage && (
              <div className="flex-1 flex flex-col bg-portal-bg">
                {loadingMessage ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                  </div>
                ) : (
                  <>
                    {/* Message Header */}
                    <div className="border-b border-portal-border bg-portal-card p-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <h2 className="text-lg font-semibold text-portal-text mb-1">
                            {selectedMessage.subject || '(no subject)'}
                          </h2>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-portal-text">
                              {selectedMessage.from.emailAddress.name || selectedMessage.from.emailAddress.address}
                            </span>
                            <span className="text-portal-muted">
                              &lt;{selectedMessage.from.emailAddress.address}&gt;
                            </span>
                          </div>
                          <p className="text-xs text-portal-muted mt-1">
                            To: {selectedMessage.toRecipients.map(r => r.emailAddress.address).join(', ')}
                          </p>
                          <p className="text-xs text-portal-muted">
                            {formatFullDate(selectedMessage.receivedDateTime)}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedMessage(null)}
                          className="p-1.5 text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleReply}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-portal-text bg-portal-bg border border-portal-border rounded-lg hover:bg-portal-border transition-colors"
                        >
                          <Reply className="h-3 w-3" />
                          Reply
                        </button>
                        <a
                          href={selectedMessage.webLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open in Outlook
                        </a>
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <div
                        className="prose prose-sm prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedMessage.body.content }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-4 border-b border-portal-border">
              <h3 className="text-sm font-semibold text-portal-text">New Message</h3>
              <button
                onClick={() => setShowCompose(false)}
                className="p-1 text-portal-muted hover:text-portal-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">To</label>
                <input
                  type="text"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Subject</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Message</label>
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your message..."
                  rows={10}
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-portal-border">
              <button
                onClick={() => setShowCompose(false)}
                className="px-4 py-2 text-xs text-portal-text bg-portal-bg border border-portal-border rounded-lg hover:bg-portal-border"
              >
                Discard
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !composeTo.trim() || !composeSubject.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                <Send className="h-3 w-3" />
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
