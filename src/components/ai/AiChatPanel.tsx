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
  Pencil,
  Check,
  PanelLeftOpen,
  PanelLeftClose,
} from 'lucide-react';
import Link from 'next/link';
import { cn, formatRelativeTime, extractPastedImages } from '@/lib/utils';
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

// Per-conversation state — keeps messages, loading, and ephemeral UI state
// scoped to each thread so switching conversations never cross-contaminates them.
interface ConvState {
  messages: AiMessage[];
  loading: boolean;
  pendingQuestion: PendingQuestion | null;
  lastToolEvents: string[];
}

const EMPTY_CONV: ConvState = {
  messages: [],
  loading: false,
  pendingQuestion: null,
  lastToolEvents: [],
};

// Key used for the per-conversation map when a new chat hasn't been saved yet.
const NEW_CHAT_KEY = '__new__';

const STORAGE_KEY = 'ai-hub:active-thread';
const SIDEBAR_WIDTH_KEY = 'ai-hub:sidebar-width';
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 260;
const CHAT_MIN = 320;

export function AiChatPanel({ csrfToken, onClose }: AiChatPanelProps) {
  const provider: AiProvider = 'anthropic';

  // All per-conversation state lives in one map keyed by threadId (or NEW_CHAT_KEY).
  // This ensures in-flight responses from conversation A are never applied to
  // conversation B when the user switches mid-stream.
  const [convStates, setConvStates] = useState<Map<string, ConvState>>(new Map());
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Derive the displayed conversation's state from the active key.
  const activeKey = threadId ?? NEW_CHAT_KEY;
  const activeConv = convStates.get(activeKey) ?? EMPTY_CONV;
  const messages = activeConv.messages;
  const loading = activeConv.loading;
  const pendingQuestion = activeConv.pendingQuestion;
  const lastToolEvents = activeConv.lastToolEvents;

  // Update per-conversation state without touching any other conversation's state.
  const updateConv = useCallback(
    (key: string, updater: (prev: ConvState) => ConvState) => {
      setConvStates((prev) => {
        const next = new Map(prev);
        next.set(key, updater(next.get(key) ?? EMPTY_CONV));
        return next;
      });
    },
    [],
  );

  // Track viewport for mobile drawer behavior
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileSidebarOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Load saved sidebar width
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) {
        setSidebarWidth(n);
      }
    }
  }, []);

  // Persist sidebar width
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // Drag-to-resize listeners
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (clientX: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left;
      const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, rect.width - CHAT_MIN));
      setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(max, x)));
    };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX);
    };
    const stop = () => setIsResizing(false);
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
  }, [isResizing]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Focus and select rename input when entering rename mode
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

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
    // If this thread already has an in-flight request, just switch to it without
    // re-fetching — the pending response will arrive and update its own state.
    if (convStates.get(id)?.loading) {
      setThreadId(id);
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id);
      if (isMobile) setMobileSidebarOpen(false);
      return;
    }

    setLoadingThread(true);
    try {
      const res = await fetch(`/api/ai/threads/${id}`);
      const data = await res.json();
      if (data.ok) {
        setConvStates((prev) => {
          const next = new Map(prev);
          // Guard: don't overwrite a conversation that became in-flight while we fetched.
          if (!next.get(id)?.loading) {
            next.set(id, { ...EMPTY_CONV, messages: data.data.messages || [] });
          }
          return next;
        });
        setThreadId(id);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, id);
        }
      } else if (res.status === 404) {
        // Thread no longer exists — clear stored id
        if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
        setThreadId(undefined);
        setConvStates((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      }
    } finally {
      setLoadingThread(false);
      if (isMobile) setMobileSidebarOpen(false);
    }
  }

  function newChat() {
    setThreadId(undefined);
    // Reset the draft conversation slot so the new chat starts fresh.
    setConvStates((prev) => {
      const next = new Map(prev);
      next.delete(NEW_CHAT_KEY);
      return next;
    });
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    setInput('');
    setPastedImages([]);
    setPasteError(null);
    if (isMobile) setMobileSidebarOpen(false);
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
      // Clean up cached state for the deleted thread.
      setConvStates((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      fetchThreads();
    }
  }

  function startRename(t: ThreadSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(t.id);
    setRenameValue(t.title ?? '');
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function commitRename(id: string) {
    const original = threads.find((t) => t.id === id)?.title ?? '';
    const next = renameValue.trim();
    if (next === original.trim()) {
      cancelRename();
      return;
    }
    setRenameSaving(true);
    // Optimistic update
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, title: next || null } : t))
    );
    try {
      const res = await fetch(`/api/ai/threads/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchThreads();
      }
    } catch {
      fetchThreads();
    } finally {
      setRenameSaving(false);
      setRenamingId(null);
      setRenameValue('');
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    if (!e.clipboardData) return;
    const { items, error, hadImage } = await extractPastedImages(
      e.clipboardData,
      pastedImages.length,
    );
    if (hadImage) e.preventDefault();
    if (items.length > 0) {
      setPastedImages((prev) => [...prev, ...items.map((it) => it.dataUri)]);
    }
    setPasteError(error);
  }

  function removePastedImage(idx: number) {
    setPastedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Send `text` as a user message. Used both by the input field and by
   *  the multi-choice question buttons. */
  async function sendText(text: string) {
    if ((!text.trim() && pastedImages.length === 0) || loading) return;
    const images = pastedImages.length ? pastedImages : undefined;
    const userMsg: AiMessage = { role: 'user', content: text.trim(), images };

    // Snapshot the current messages BEFORE this send for the API request body.
    const preSendMessages = messages;

    // Determine the conversation key for this send (before thread creation).
    let convKey = threadId ?? NEW_CHAT_KEY;

    // Immediately add the user message and set loading on the originating conversation.
    updateConv(convKey, (prev) => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      loading: true,
      pendingQuestion: null,
      lastToolEvents: [],
    }));

    setInput('');
    setPastedImages([]);
    setPasteError(null);

    let currentThreadId = threadId;

    // Optimistically create a thread for new conversations so the sidebar
    // entry appears before the AI response completes.
    if (!currentThreadId) {
      const placeholderTitle = text.trim().slice(0, 60) || 'New chat';
      try {
        const createRes = await fetch('/api/ai/threads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify({ title: placeholderTitle, provider }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          if (createData.ok && createData.data?.id) {
            const summary = createData.data as ThreadSummary;
            currentThreadId = summary.id;

            // Migrate the draft conversation state from NEW_CHAT_KEY to the real thread ID
            // so all subsequent updates (including the in-flight response) target the correct key.
            setConvStates((prev) => {
              const next = new Map(prev);
              const draftState = next.get(NEW_CHAT_KEY) ?? EMPTY_CONV;
              next.set(summary.id, draftState);
              next.delete(NEW_CHAT_KEY);
              return next;
            });

            convKey = summary.id;
            setThreadId(summary.id);
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(STORAGE_KEY, summary.id);
            }
            const optimistic: ThreadSummary = {
              ...summary,
              messageCount: 1,
              updatedAt: new Date().toISOString(),
            };
            setThreads((prev) => [optimistic, ...prev.filter((t) => t.id !== summary.id)]);
          }
        }
      } catch {
        // Silently fall back — the chat endpoint will create the thread server-side.
      }
    }

    // `originatingKey` is the stable conversation key for this request.
    // All response state is routed here regardless of which conversation the
    // user navigates to while the request is in flight.
    const originatingKey = convKey;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          provider,
          messages: [...preSendMessages, userMsg],
          threadId: currentThreadId,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        // Route the response to the originating conversation — not the currently
        // visible one — so switching chats mid-stream never corrupts another thread.
        updateConv(originatingKey, (prev) => ({
          ...prev,
          messages: [...prev.messages, { role: 'assistant', content: data.data.reply }],
          loading: false,
          pendingQuestion: (data.data.question as PendingQuestion) ?? null,
          lastToolEvents: Array.isArray(data.data.toolEvents)
            ? (data.data.toolEvents as string[])
            : [],
        }));

        if (data.data.threadId && data.data.threadId !== currentThreadId) {
          // Server assigned a new thread ID — migrate the conversation state.
          const newId = data.data.threadId as string;
          setConvStates((prev) => {
            const next = new Map(prev);
            const s = next.get(originatingKey) ?? EMPTY_CONV;
            next.set(newId, s);
            if (originatingKey !== newId) next.delete(originatingKey);
            return next;
          });
          // Only update the visible threadId if the user is still on the originating thread.
          setThreadId((cur) => (cur === currentThreadId ? newId : cur));
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(STORAGE_KEY, newId);
          }
        }
        // Refresh sidebar so new thread appears / titles update
        fetchThreads();
      } else {
        updateConv(originatingKey, (prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { role: 'assistant', content: `Error: ${data.error}` },
          ],
          loading: false,
        }));
      }
    } catch {
      updateConv(originatingKey, (prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          { role: 'assistant', content: 'Failed to connect to AI API.' },
        ],
        loading: false,
      }));
    }
  }

  const sendMessage = () => sendText(input);

  const canSend = !loading && (input.trim().length > 0 || pastedImages.length > 0);

  const activeThread = threadId ? threads.find((t) => t.id === threadId) : undefined;

  const onResizeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSidebarWidth((w) => Math.max(SIDEBAR_MIN, w - 16));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSidebarWidth((w) => Math.min(SIDEBAR_MAX, w + 16));
    }
  };

  return (
    <div ref={containerRef} className="flex h-full bg-portal-bg relative">
      {/* Mobile drawer backdrop */}
      {isMobile && mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Close conversations"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 cursor-pointer"
        />
      )}

      {/* Thread sidebar */}
      <aside
        style={!isMobile ? { width: `${sidebarWidth}px` } : undefined}
        className={cn(
          'shrink-0 border-r border-portal-border flex flex-col bg-portal-card/30',
          isMobile && [
            'fixed inset-y-0 left-0 z-40 w-[80vw] max-w-xs bg-portal-card shadow-2xl transition-transform duration-200',
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full',
          ],
        )}
        aria-label="Conversation list"
      >
        <div className="p-2 border-b border-portal-border flex items-center gap-2">
          <button
            onClick={newChat}
            className="flex-1 flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
          >
            <Plus className="h-4 w-4" />
            New chat
          </button>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close conversations"
              className="p-2 text-portal-muted hover:text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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
              const isRenaming = renamingId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => !isRenaming && loadThread(t.id)}
                  className={cn(
                    'group w-full flex items-start gap-2 px-2 py-2 rounded-md text-left transition-colors',
                    !isRenaming && 'cursor-pointer',
                    isActive
                      ? 'bg-portal-accent/10 text-portal-accent'
                      : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
                  )}
                  title={isRenaming ? undefined : t.title ?? 'Untitled'}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <>
                        <label htmlFor={`rename-${t.id}`} className="sr-only">
                          Rename conversation
                        </label>
                        <input
                          ref={renameInputRef}
                          id={`rename-${t.id}`}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void commitRename(t.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          onBlur={() => {
                            if (!renameSaving) void commitRename(t.id);
                          }}
                          maxLength={200}
                          disabled={renameSaving}
                          placeholder="Conversation name"
                          className="w-full bg-portal-bg border border-portal-accent/50 rounded px-1.5 py-0.5 text-xs text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent disabled:opacity-60"
                        />
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-medium truncate">
                          {t.title ?? 'Untitled'}
                        </div>
                        <div className="text-[10px] text-portal-muted">
                          {t.messageCount} msg · {formatRelativeTime(t.updatedAt)}
                        </div>
                      </>
                    )}
                  </div>
                  {isRenaming ? (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // Prevent blur from firing before click
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void commitRename(t.id);
                      }}
                      disabled={renameSaving}
                      aria-label="Save name"
                      title="Save"
                      className="p-0.5 text-portal-accent hover:text-portal-text rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent disabled:opacity-50"
                    >
                      {renameSaving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => startRename(t, e)}
                        aria-label="Rename conversation"
                        title="Rename conversation"
                        className="p-0.5 text-portal-muted hover:text-portal-text rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => deleteThread(t.id, e)}
                        aria-label="Delete conversation"
                        title="Delete conversation"
                        className="p-0.5 text-portal-muted hover:text-red-300 rounded transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Resize handle (desktop only) */}
      {!isMobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize conversation list"
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
          onTouchStart={() => setIsResizing(true)}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT)}
          title="Drag to resize · Double-click to reset"
          className={cn(
            'group relative w-1 shrink-0 cursor-col-resize bg-portal-border hover:bg-portal-accent/50 transition-colors focus:outline-none focus:bg-portal-accent',
            isResizing && 'bg-portal-accent',
          )}
        >
          {/* Wider hit area for easier grabbing */}
          <span aria-hidden="true" className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-portal-border gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileSidebarOpen((o) => !o)}
                aria-label={mobileSidebarOpen ? 'Hide conversations' : 'Show conversations'}
                aria-expanded={mobileSidebarOpen}
                className="p-1.5 text-portal-muted hover:text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
              >
                {mobileSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </button>
            )}
            <Sparkles className="h-4 w-4 text-portal-accent shrink-0" />
            {activeThread && renamingId === activeThread.id ? (
              <span className="text-sm font-semibold text-portal-text truncate">
                {renameValue || 'Untitled'}
              </span>
            ) : activeThread ? (
              <button
                type="button"
                onClick={() => startRename(activeThread, { stopPropagation: () => {} } as React.MouseEvent)}
                className="group flex items-center gap-1.5 min-w-0 text-sm font-semibold text-portal-text hover:text-portal-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded px-1 -mx-1"
                title="Click to rename"
              >
                <span className="truncate">{activeThread.title ?? 'Untitled'}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ) : (
              <span className="text-sm font-semibold text-portal-text">AI Hub</span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="p-1 text-portal-muted hover:text-portal-text cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent rounded transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl space-y-3">
            {loadingThread ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-portal-accent" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-portal-muted text-sm py-12">
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
                      'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-portal-accent text-white'
                        : 'bg-portal-card border border-portal-border text-portal-text'
                    )}
                  >
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.images.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={j}
                            src={src}
                            alt="Pasted screenshot"
                            className="max-h-48 max-w-full rounded-md object-contain"
                          />
                        ))}
                      </div>
                    )}
                    {msg.content && (
                      <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                    )}
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
        </div>

        {/* Tool event chips (last response only) */}
        {lastToolEvents.length > 0 && !pendingQuestion && (
          <div className="px-4 sm:px-6 lg:px-8 pb-1">
            <div className="mx-auto w-full max-w-4xl flex flex-wrap gap-1">
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
                    {isDispatch && <Check className="h-2.5 w-2.5" />} {ev}
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
          </div>
        )}

        {/* Pending question buttons */}
        {pendingQuestion && (
          <div className="px-4 sm:px-6 lg:px-8 pb-2">
            <div className="mx-auto w-full max-w-4xl space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-portal-muted px-1">
                Pick an option:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pendingQuestion.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => sendText(opt)}
                    disabled={loading}
                    className="text-xs px-3 py-1.5 bg-portal-accent/10 border border-portal-accent/30 text-portal-accent hover:bg-portal-accent/20 rounded-md transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  >
                    {opt}
                  </button>
                ))}
                <button
                  onClick={() =>
                    updateConv(activeKey, (prev) => ({ ...prev, pendingQuestion: null }))
                  }
                  disabled={loading}
                  className="text-xs px-3 py-1.5 bg-portal-card border border-portal-border text-portal-muted hover:text-portal-text rounded-md transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  title="Or type your own answer below"
                >
                  None of these
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 py-3 sm:px-6 lg:px-8 border-t border-portal-border">
          {pastedImages.length > 0 && (
            <div className="mx-auto w-full max-w-4xl mb-2 flex flex-wrap gap-2">
              {pastedImages.map((src, i) => (
                <div
                  key={i}
                  className="relative h-16 w-16 rounded-md overflow-hidden bg-portal-card border border-portal-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt="Pasted screenshot preview"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePastedImage(i)}
                    aria-label="Remove pasted image"
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {pasteError && (
            <div className="mx-auto w-full max-w-4xl mb-2 text-xs text-red-300">
              {pasteError}
            </div>
          )}
          <div className="mx-auto w-full max-w-4xl flex gap-2">
            <label htmlFor="ai-chat-input" className="sr-only">
              Message
            </label>
            <input
              id="ai-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) sendMessage();
                }
              }}
              placeholder={
                pendingQuestion
                  ? 'Pick an option above, or type a custom answer…'
                  : 'Ask anything, paste a screenshot, or dispatch a task…'
              }
              className="flex-1 min-w-0 bg-portal-card border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:ring-2 focus:ring-portal-accent focus:border-portal-accent/50"
            />
            <button
              onClick={sendMessage}
              disabled={!canSend}
              aria-label="Send message"
              className="px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
