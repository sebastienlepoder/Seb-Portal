'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  X,
  Sparkles,
  Plus,
  MessageSquare,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { AiMessage, AiProvider } from '@/types';

interface AiChatPanelProps {
  csrfToken?: string;
  onClose?: () => void;
}

interface ThreadSummary {
  id: string;
  title: string | null;
  provider: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PendingQuestion {
  question: string;
  options: string[];
}

const STORAGE_KEY = 'ai-hub:active-thread';

export function AiChatPanel({ csrfToken, onClose }: AiChatPanelProps) {
  const provider: AiProvider = 'anthropic';
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [lastToolEvents, setLastToolEvents] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Load thread list
  const fetchThreads = useCallback(() => {
    fetch('/api/ai/threads?limit=50')
      .then((r) => r.json())
      .then((d) => d.ok && setThreads(d.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // On mount: load threadId from localStorage and hydrate messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setThreadId(stored);
      void loadThread(stored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThread(id: string) {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/ai/threads/${id}`);
      const data = await res.json();
      if (data.ok) {
        setMessages(data.data.messages || []);
        setThreadId(id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, id);
        }
      } else if (res.status === 404) {
        // Thread no longer exists — clear stored id
        if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
        setThreadId(undefined);
        setMessages([]);
      }
    } finally {
      setLoadingThread(false);
    }
  }

  function newChat() {
    setMessages([]);
    setThreadId(undefined);
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    setInput('');
  }

  async function deleteThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this conversation? Cannot be undone.')) return;
    const res = await fetch(`/api/ai/threads/${id}`, {
      method: 'DELETE',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
    if (res.ok) {
      if (id === threadId) newChat();
      fetchThreads();
    }
  }

  /** Send `text` as a user message. Used both by the input field and by
   *  the multi-choice question buttons. */
  async function sendText(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: AiMessage = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    // Clear any pending question — the user has answered it.
    setPendingQuestion(null);
    setLastToolEvents([]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          provider,
          messages: [...messages, userMsg],
          threadId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.data.reply }]);
        if (data.data.threadId && data.data.threadId !== threadId) {
          setThreadId(data.data.threadId);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, data.data.threadId);
          }
        }
        if (data.data.question) {
          setPendingQuestion(data.data.question as PendingQuestion);
        }
        if (Array.isArray(data.data.toolEvents) && data.data.toolEvents.length > 0) {
          setLastToolEvents(data.data.toolEvents as string[]);
        }
        // Refresh sidebar so new thread appears / titles update
        fetchThreads();
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to connect to AI API.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const sendMessage = () => sendText(input);

  return (
    <div className="flex h-full bg-portal-bg border-l border-portal-border">
      {/* Thread sidebar */}
      <div className="w-60 shrink-0 border-r border-portal-border flex flex-col bg-portal-card/30">
        <div className="p-2 border-b border-portal-border">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {threads.length === 0 ? (
            <div className="text-xs text-portal-muted text-center py-6 px-3">
              No conversations yet.
              <br />
              Start one below.
            </div>
          ) : (
            threads.map((t) => {
              const isActive = t.id === threadId;
              return (
                <button
                  key={t.id}
                  onClick={() => loadThread(t.id)}
                  className={cn(
                    'group w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors',
                    isActive
                      ? 'bg-portal-accent/10 text-portal-accent'
                      : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
                  )}
                  title={t.title ?? 'Untitled'}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {t.title ?? 'Untitled'}
                    </div>
                    <div className="text-[10px] text-portal-muted">
                      {t.messageCount} msg · {formatRelativeTime(t.updatedAt)}
                    </div>
                  </div>
                  <span
                    onClick={(e) => deleteThread(t.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-portal-muted hover:text-red-300 rounded transition-opacity"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-portal-border">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-portal-accent" />
            <span className="text-sm font-semibold text-portal-text">
              {threadId ? threads.find((t) => t.id === threadId)?.title ?? 'AI Hub' : 'AI Hub'}
            </span>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {loadingThread ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-portal-accent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-portal-muted text-sm py-8">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Start a conversation with Claude</p>
              <p className="text-xs mt-1 text-portal-muted">
                Or ask me to dispatch a task to one of your agents.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-2',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {msg.role === 'assistant' && (
                  <Bot className="h-5 w-5 text-portal-accent flex-shrink-0 mt-1" />
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-portal-accent text-white'
                      : 'bg-portal-card border border-portal-border text-portal-text'
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
                {msg.role === 'user' && (
                  <User className="h-5 w-5 text-portal-muted flex-shrink-0 mt-1" />
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-2 items-center text-portal-muted text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>

        {/* Tool event chips (last response only) */}
        {lastToolEvents.length > 0 && !pendingQuestion && (
          <div className="px-3 pb-1 flex flex-wrap gap-1">
            {lastToolEvents.map((ev, i) => {
              const isDispatch = ev === 'dispatch_to_project';
              return (
                <span
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 border',
                    isDispatch
                      ? 'bg-portal-accent/10 text-portal-accent border-portal-accent/30'
                      : 'bg-portal-card border-portal-border text-portal-muted'
                  )}
                >
                  {isDispatch && '✓'} {ev}
                  {isDispatch && (
                    <Link
                      href="/agents"
                      className="ml-1 underline hover:text-portal-text"
                      title="View task on the Agents page"
                    >
                      view
                    </Link>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Pending question buttons */}
        {pendingQuestion && (
          <div className="px-3 pb-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-portal-muted px-1">
              Pick an option:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pendingQuestion.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => sendText(opt)}
                  disabled={loading}
                  className="text-xs px-3 py-1.5 bg-portal-accent/10 border border-portal-accent/30 text-portal-accent hover:bg-portal-accent/20 rounded-md transition-colors disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
              <button
                onClick={() => setPendingQuestion(null)}
                disabled={loading}
                className="text-xs px-3 py-1.5 bg-portal-card border border-portal-border text-portal-muted hover:text-portal-text rounded-md transition-colors disabled:opacity-50"
                title="Or type your own answer below"
              >
                None of these
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-portal-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={
                pendingQuestion
                  ? 'Pick an option above, or type a custom answer…'
                  : 'Ask anything, or dispatch a task…'
              }
              className="flex-1 bg-portal-card border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
