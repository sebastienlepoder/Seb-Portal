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
  Edit2,
  RefreshCw,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Tag,
  Search,
  Download,
  Upload,
  Cpu,
  ChevronDown,
  FolderGit2,
  MoreHorizontal,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { cn, formatRelativeTime, extractPastedImages } from '@/lib/utils';
import type { AiMessage, AiProvider, ToolCall } from '@/types';
import { AssistantMessage } from './AssistantMessage';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { THEMES, applyTheme, isValidTheme } from '@/lib/themes';

interface AiChatPanelProps {
  csrfToken?: string;
  onClose?: () => void;
}

interface ThreadSummary {
  id: string;
  title: string | null;
  provider: string;
  messageCount: number;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
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
const MODEL_STORAGE_KEY = 'ai-hub:model';
const PROJECT_STORAGE_KEY = 'ai-hub:project';
const SIDEBAR_WIDTH_KEY = 'ai-hub:sidebar-width';

interface SlashCommand {
  cmd: string;
  description: string;
}
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/help', description: 'List available commands' },
  { cmd: '/new', description: 'Start a new conversation' },
  { cmd: '/clear', description: 'Start a new conversation' },
  { cmd: '/model', description: 'Switch the model (e.g. /model opus)' },
  { cmd: '/search', description: 'Search conversations (e.g. /search invoices)' },
  { cmd: '/archive', description: 'Toggle the archived view' },
  { cmd: '/theme', description: 'Switch theme (e.g. /theme catppuccin)' },
];
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
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [threadSearch, setThreadSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [models, setModels] = useState<{ id: string; label: string; provider: string; supportsTools: boolean }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-6');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  // Per-conversation actions dropdown (⋯). Rendered via a portal so the
  // sidebar's overflow doesn't clip it. `top`/`bottom` are mutually exclusive
  // so the menu can flip above the trigger when near the viewport bottom.
  const [menuState, setMenuState] = useState<
    { id: string; left: number; top?: number; bottom?: number } | null
  >(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close the per-conversation actions menu on outside click, scroll, resize,
  // or Escape. The trigger button stops mousedown propagation so re-clicking it
  // toggles cleanly instead of closing-then-reopening.
  useEffect(() => {
    if (!menuState) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuState(null);
    };
    const onClose = () => setMenuState(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuState(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [menuState]);

  // Load thread list (honours search / archived / tag filters)
  const fetchThreads = useCallback(() => {
    const params = new URLSearchParams({ limit: '80' });
    if (showArchived) params.set('archived', '1');
    if (threadSearch.trim()) params.set('search', threadSearch.trim());
    if (tagFilter) params.set('tag', tagFilter);
    fetch(`/api/ai/threads?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => d.ok && setThreads(d.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, threadSearch, tagFilter]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Load available models + restore the last-used selection.
  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setModels(d.data.models);
        const stored =
          typeof window !== 'undefined' ? window.localStorage.getItem(MODEL_STORAGE_KEY) : null;
        const valid = d.data.models.find((m: { id: string }) => m.id === stored);
        setSelectedModel(valid ? stored! : d.data.defaultModel || d.data.models[0]?.id || 'claude-sonnet-4-6');
      })
      .catch(() => {});
  }, []);

  // Load projects for the conversation project selector.
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setProjects(d.data.map((p: { id: string; slug: string; name: string }) => ({ id: p.id, slug: p.slug, name: p.name })));
        const stored =
          typeof window !== 'undefined' ? window.localStorage.getItem(PROJECT_STORAGE_KEY) : null;
        if (stored && d.data.some((p: { slug: string }) => p.slug === stored)) {
          setSelectedProject(stored);
        }
      })
      .catch(() => {});
  }, []);

  function chooseProject(slug: string) {
    setSelectedProject(slug);
    if (typeof window !== 'undefined') {
      if (slug) window.localStorage.setItem(PROJECT_STORAGE_KEY, slug);
      else window.localStorage.removeItem(PROJECT_STORAGE_KEY);
    }
  }

  function chooseModel(id: string) {
    setSelectedModel(id);
    setModelMenuOpen(false);
    if (typeof window !== 'undefined') window.localStorage.setItem(MODEL_STORAGE_KEY, id);
  }

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

  async function patchThread(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/ai/threads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
      body: JSON.stringify(patch),
    });
    fetchThreads();
  }

  async function togglePin(t: ThreadSummary, e: React.MouseEvent) {
    e.stopPropagation();
    await patchThread(t.id, { pinned: !t.pinned });
  }

  async function toggleArchive(t: ThreadSummary, e: React.MouseEvent) {
    e.stopPropagation();
    await patchThread(t.id, { archived: !t.archived });
    if (t.id === threadId) newChat();
  }

  async function editTags(t: ThreadSummary, e: React.MouseEvent) {
    e.stopPropagation();
    const next = window.prompt('Tags (comma-separated):', (t.tags ?? []).join(', '));
    if (next === null) return;
    const tags = next.split(',').map((s) => s.trim()).filter(Boolean);
    await patchThread(t.id, { tags });
  }

  function exportThread(id: string, format: 'md' | 'json', e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`/api/ai/threads/${id}/export?format=${format}`, '_blank');
  }

  // Toggle the actions dropdown for a conversation row, anchoring it to the
  // trigger button and flipping it above when there isn't room below.
  const MENU_WIDTH = 184;
  const MENU_HEIGHT = 260;
  function toggleMenu(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (menuState?.id === id) {
      setMenuState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT && rect.top > MENU_HEIGHT;
    setMenuState({
      id,
      left,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }

  // Run an action handler then dismiss the menu.
  function runMenuAction(action: (e: React.MouseEvent) => void, e: React.MouseEvent) {
    action(e);
    setMenuState(null);
  }

  async function importThreadFile(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch('/api/ai/threads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || 'Import failed');
        return;
      }
      fetchThreads();
      if (data.data?.id) void loadThread(data.data.id);
    } catch {
      alert('Could not read that file as JSON.');
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

  /** Streaming send: posts to /api/ai/chat (SSE) and updates the last
   *  assistant message in place as text/tool_use/tool_result events arrive.
   *  When `replaceFromIndex` is set, the messages array is truncated to
   *  that index before sending (used by edit/regenerate). */
  async function sendText(text: string, replaceFromIndex?: number) {
    if ((!text.trim() && pastedImages.length === 0) || loading) return;
    const images = pastedImages.length ? pastedImages : undefined;
    const userMsg: AiMessage = { role: 'user', content: text.trim(), images };

    // routeKey is the conversation this request belongs to. It survives a
    // mid-flight thread switch (responses are routed here, not to whatever
    // conversation is on screen) and is re-pointed if the thread id changes.
    let routeKey = threadId ?? NEW_CHAT_KEY;

    // Base messages for the API body. When regenerating/editing, slice off
    // everything from the edit point onward.
    const existing = (convStates.get(routeKey) ?? EMPTY_CONV).messages;
    const baseMessages =
      typeof replaceFromIndex === 'number' ? existing.slice(0, replaceFromIndex) : existing;
    // Index of the empty assistant placeholder we stream into.
    const assistantIndex = baseMessages.length + 1;

    updateConv(routeKey, (prev) => ({
      ...prev,
      messages: [...baseMessages, userMsg, { role: 'assistant', content: '' }],
      loading: true,
      pendingQuestion: null,
      lastToolEvents: [],
    }));

    setInput('');
    setPastedImages([]);
    setPasteError(null);

    let currentThreadId = threadId;

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

            // Migrate the draft conversation state from NEW_CHAT_KEY to the
            // real thread id so streamed updates target the right key.
            setConvStates((prev) => {
              const next = new Map(prev);
              const draftState = next.get(routeKey) ?? EMPTY_CONV;
              next.set(summary.id, draftState);
              if (routeKey !== summary.id) next.delete(routeKey);
              return next;
            });

            routeKey = summary.id;
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
        /* fall back to server-side thread creation */
      }
    }

    // Patch the streaming assistant message within the originating conversation.
    const patchAssistant = (patch: (m: AiMessage) => AiMessage) => {
      updateConv(routeKey, (prev) => {
        const copy = prev.messages.slice();
        const current = copy[assistantIndex];
        if (current && current.role === 'assistant') {
          copy[assistantIndex] = patch(current);
        }
        return { ...prev, messages: copy };
      });
    };

    const toolEventNames: string[] = [];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          provider,
          model: selectedModel,
          projectSlug: selectedProject || undefined,
          messages: [...baseMessages, userMsg],
          threadId: currentThreadId,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        patchAssistant((m) => ({ ...m, content: `Error: ${res.status} ${errText.slice(0, 200)}` }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE frames separated by blank lines.
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf('\n\n');

          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload) as {
                type: string;
                delta?: string;
                text?: string;
                id?: string;
                name?: string;
                input?: unknown;
                content?: string;
                success?: boolean;
                question?: string;
                options?: string[];
                threadId?: string;
                error?: string;
              };
              if (evt.type === 'text' && typeof evt.delta === 'string') {
                patchAssistant((m) => ({ ...m, content: m.content + evt.delta }));
              } else if (evt.type === 'thinking' && typeof evt.text === 'string') {
                patchAssistant((m) => ({ ...m, thinking: evt.text }));
              } else if (evt.type === 'tool_use' && evt.id && evt.name) {
                const call: ToolCall = {
                  id: evt.id,
                  name: evt.name,
                  input: evt.input,
                  pending: true,
                };
                toolEventNames.push(evt.name);
                patchAssistant((m) => ({
                  ...m,
                  toolCalls: [...(m.toolCalls ?? []), call],
                }));
              } else if (evt.type === 'tool_result' && evt.id) {
                patchAssistant((m) => ({
                  ...m,
                  toolCalls: (m.toolCalls ?? []).map((c) =>
                    c.id === evt.id
                      ? {
                          ...c,
                          pending: false,
                          ...(evt.success === false
                            ? { error: evt.content ?? 'tool error' }
                            : { result: evt.content ?? '' }),
                        }
                      : c
                  ),
                }));
              } else if (evt.type === 'question' && evt.question && Array.isArray(evt.options)) {
                const q = { question: evt.question, options: evt.options };
                updateConv(routeKey, (prev) => ({ ...prev, pendingQuestion: q }));
              } else if (evt.type === 'done') {
                if (evt.threadId && evt.threadId !== currentThreadId) {
                  const newId = evt.threadId;
                  setConvStates((prev) => {
                    const next = new Map(prev);
                    const s = next.get(routeKey) ?? EMPTY_CONV;
                    next.set(newId, s);
                    if (routeKey !== newId) next.delete(routeKey);
                    return next;
                  });
                  setThreadId((cur) => (cur === currentThreadId ? newId : cur));
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(STORAGE_KEY, newId);
                  }
                  routeKey = newId;
                  currentThreadId = newId;
                }
                fetchThreads();
              } else if (evt.type === 'error') {
                patchAssistant((m) => ({ ...m, content: `Error: ${evt.error}` }));
              }
            } catch {
              /* malformed frame */
            }
          }
        }
      }
    } catch {
      patchAssistant((m) => ({ ...m, content: 'Failed to connect to AI API.' }));
    } finally {
      updateConv(routeKey, (prev) => ({
        ...prev,
        loading: false,
        lastToolEvents: toolEventNames.length ? toolEventNames : prev.lastToolEvents,
      }));
    }
  }

  /** Returns true if the text was a slash command and was handled
   *  locally (so it should NOT be sent to the model). */
  function handleSlashCommand(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return false;
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ').trim();

    // Append a local-only assistant note to the active conversation
    // (slash-command feedback never goes to the model).
    const note = (content: string) =>
      updateConv(threadId ?? NEW_CHAT_KEY, (prev) => ({
        ...prev,
        messages: [...prev.messages, { role: 'assistant', content }],
      }));

    switch (cmd) {
      case '/new':
      case '/clear':
        newChat();
        setInput('');
        return true;
      case '/archive':
        setShowArchived((v) => !v);
        setInput('');
        return true;
      case '/search':
        setThreadSearch(arg);
        setInput('');
        return true;
      case '/model': {
        if (!arg) {
          setModelMenuOpen(true);
          setInput('');
          return true;
        }
        const match = models.find(
          (m) => m.id === arg || m.label.toLowerCase().includes(arg.toLowerCase())
        );
        if (match) {
          chooseModel(match.id);
        } else {
          note(`No model matches "${arg}". Available: ${models.map((m) => m.label).join(', ')}`);
        }
        setInput('');
        return true;
      }
      case '/theme': {
        if (!arg) {
          note(`Available themes: ${THEMES.map((t) => t.id).join(', ')}`);
        } else if (isValidTheme(arg)) {
          applyTheme(arg);
        } else {
          note(`No theme "${arg}". Available: ${THEMES.map((t) => t.id).join(', ')}`);
        }
        setInput('');
        return true;
      }
      case '/help':
        note(
          '**Slash commands**\n\n' +
            SLASH_COMMANDS.map((c) => `- \`${c.cmd}\` — ${c.description}`).join('\n')
        );
        setInput('');
        return true;
      default:
        return false;
    }
  }

  const sendMessage = () => {
    if (handleSlashCommand(input)) return;
    void sendText(input);
  };

  const slashMatches =
    input.startsWith('/') && !input.includes(' ')
      ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(input.toLowerCase()))
      : [];

  function startEditMessage(index: number) {
    const msg = messages[index];
    if (!msg || msg.role !== 'user' || loading) return;
    setEditingMsgIndex(index);
    setEditValue(msg.content);
  }

  function cancelEditMessage() {
    setEditingMsgIndex(null);
    setEditValue('');
  }

  function commitEditMessage() {
    if (editingMsgIndex === null) return;
    const text = editValue.trim();
    if (!text) {
      cancelEditMessage();
      return;
    }
    const idx = editingMsgIndex;
    setEditingMsgIndex(null);
    setEditValue('');
    void sendText(text, idx);
  }

  function regenerateFromUser(index: number) {
    const msg = messages[index];
    if (!msg || msg.role !== 'user' || loading) return;
    void sendText(msg.content, index);
  }

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
        <div className="p-2 border-b border-portal-border space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={newChat}
              className="flex-1 flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg text-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
            >
              <Plus className="h-4 w-4" />
              New chat
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              aria-label="Import conversation"
              title="Import conversation (JSON)"
              className="p-2 text-portal-muted hover:text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors"
            >
              <Upload className="h-4 w-4" />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importThreadFile(file);
                e.target.value = '';
              }}
            />
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

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-portal-muted" />
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full bg-portal-bg border border-portal-border rounded-md pl-7 pr-2 py-1.5 text-xs text-portal-text focus:outline-none focus:border-portal-accent/40"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors',
                showArchived
                  ? 'bg-portal-accent/10 text-portal-accent border-portal-accent/30'
                  : 'border-portal-border text-portal-muted hover:text-portal-text'
              )}
            >
              <Archive className="h-3 w-3" />
              {showArchived ? 'Archived' : 'Active'}
            </button>
            {tagFilter && (
              <button
                onClick={() => setTagFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-portal-accent/10 text-portal-accent border border-portal-accent/30"
                title="Clear tag filter"
              >
                <Tag className="h-3 w-3" />
                {tagFilter}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
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
                  {t.pinned ? (
                    <Pin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-portal-accent" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  )}
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
                        {t.tags && t.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {t.tags.map((tag) => (
                              <button
                                key={tag}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTagFilter(tag);
                                }}
                                className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-portal-bg border border-portal-border text-portal-muted hover:text-portal-accent hover:border-portal-accent/30"
                              >
                                <Tag className="h-2 w-2" />
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
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
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => toggleMenu(t.id, e)}
                      aria-label="Conversation actions"
                      aria-haspopup="menu"
                      aria-expanded={menuState?.id === t.id}
                      title="Actions"
                      className={cn(
                        'shrink-0 mt-0.5 p-1 rounded-md text-portal-muted hover:text-portal-text hover:bg-portal-card-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
                        menuState?.id === t.id
                          ? 'opacity-100 text-portal-text bg-portal-card-hover'
                          : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Per-conversation actions dropdown — portaled to <body> so the sidebar's
          overflow can't clip it. */}
      {menuState &&
        typeof document !== 'undefined' &&
        (() => {
          const t = threads.find((th) => th.id === menuState.id);
          if (!t) return null;
          const itemClass =
            'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-portal-text hover:bg-portal-card-hover transition-colors cursor-pointer focus:outline-none focus:bg-portal-card-hover';
          return createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Conversation actions"
              style={{
                position: 'fixed',
                left: menuState.left,
                width: MENU_WIDTH,
                ...(menuState.top !== undefined
                  ? { top: menuState.top }
                  : { bottom: menuState.bottom }),
              }}
              className="z-[70] py-1 bg-portal-card border border-portal-border rounded-lg shadow-xl overflow-hidden"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => togglePin(t, ev), e)}
                className={itemClass}
              >
                {t.pinned ? <PinOff className="h-3.5 w-3.5 shrink-0" /> : <Pin className="h-3.5 w-3.5 shrink-0" />}
                {t.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => startRename(t, ev), e)}
                className={itemClass}
              >
                <Pencil className="h-3.5 w-3.5 shrink-0" />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => editTags(t, ev), e)}
                className={itemClass}
              >
                <Tag className="h-3.5 w-3.5 shrink-0" />
                Edit Tags
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => exportThread(t.id, 'md', ev), e)}
                className={itemClass}
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                Export as .md
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => toggleArchive(t, ev), e)}
                className={itemClass}
              >
                {t.archived ? (
                  <ArchiveRestore className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Archive className="h-3.5 w-3.5 shrink-0" />
                )}
                {t.archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="my-1 border-t border-portal-border" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={(e) => runMenuAction((ev) => deleteThread(t.id, ev), e)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer focus:outline-none focus:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                Delete
              </button>
            </div>,
            document.body,
          );
        })()}

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
              messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const isLastAssistantStreaming =
                  !isUser && loading && i === messages.length - 1;
                const isEditing = editingMsgIndex === i;

                return (
                  <div
                    key={i}
                    className={cn('group flex gap-2', isUser ? 'justify-end' : 'justify-start')}
                  >
                    {!isUser && (
                      <Bot className="h-5 w-5 text-portal-accent flex-shrink-0 mt-1" />
                    )}

                    {isUser && !isEditing && (
                      <div className="flex flex-col items-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                        <button
                          onClick={() => regenerateFromUser(i)}
                          disabled={loading}
                          className="p-1 text-portal-muted hover:text-portal-text rounded-md disabled:opacity-50"
                          title="Regenerate from this message"
                          aria-label="Regenerate"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => startEditMessage(i)}
                          disabled={loading}
                          className="p-1 text-portal-muted hover:text-portal-text rounded-md disabled:opacity-50"
                          title="Edit and regenerate"
                          aria-label="Edit"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                        isUser
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

                      {isEditing ? (
                        <div className="space-y-2 min-w-[200px]">
                          <textarea
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            rows={Math.min(8, Math.max(2, editValue.split('\n').length))}
                            className="w-full bg-portal-accent-dark text-white border border-white/20 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:border-white/40"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                commitEditMessage();
                              } else if (e.key === 'Escape') {
                                cancelEditMessage();
                              }
                            }}
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={cancelEditMessage}
                              className="px-2 py-0.5 text-xs rounded bg-white/10 hover:bg-white/20 text-white"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={commitEditMessage}
                              className="px-2 py-0.5 text-xs rounded bg-white text-portal-accent font-medium hover:bg-white/90"
                            >
                              Save & regenerate
                            </button>
                          </div>
                        </div>
                      ) : isUser ? (
                        msg.content && (
                          <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                        )
                      ) : (
                        <>
                          {msg.thinking && <ThinkingBlock text={msg.thinking} />}
                          {msg.toolCalls?.map((c) => (
                            <ToolCallCard key={c.id} call={c} />
                          ))}
                          {msg.content ? (
                            <AssistantMessage content={msg.content} />
                          ) : isLastAssistantStreaming ? (
                            <span className="inline-flex items-center gap-1 text-portal-muted">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="text-xs">…</span>
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>

                    {isUser && (
                      <User className="h-5 w-5 text-portal-muted flex-shrink-0 mt-1" />
                    )}
                  </div>
                );
              })
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
          <div className="mx-auto w-full max-w-4xl relative">
            {/* Slash command autocomplete */}
            {slashMatches.length > 0 && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-portal-card border border-portal-border rounded-lg shadow-xl overflow-hidden z-10">
                {slashMatches.map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => setInput(c.cmd + ' ')}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-portal-card-hover"
                  >
                    <span className="font-mono text-portal-accent">{c.cmd}</span>
                    <span className="text-portal-muted">{c.description}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
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
                    // If a single slash command is matched, run it.
                    if (slashMatches.length === 1 && input === slashMatches[0].cmd) {
                      sendMessage();
                    } else if (canSend || input.trim().startsWith('/')) {
                      sendMessage();
                    }
                  }
                }}
                placeholder={
                  pendingQuestion
                    ? 'Pick an option above, or type a custom answer…'
                    : 'Ask anything, / for commands, paste a screenshot…'
                }
                className="flex-1 min-w-0 bg-portal-card border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:ring-2 focus:ring-portal-accent focus:border-portal-accent/50"
              />
              <button
                onClick={sendMessage}
                disabled={!canSend && !input.trim().startsWith('/')}
                aria-label="Send message"
                className="px-4 py-2 bg-portal-accent hover:bg-portal-accent/80 text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            {/* Composer footer: model picker */}
            <div className="flex items-center gap-2 mt-2">
              <div className="relative">
                <button
                  onClick={() => setModelMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-portal-muted hover:text-portal-text px-2 py-1 rounded-md border border-portal-border bg-portal-card"
                >
                  <Cpu className="h-3 w-3" />
                  {models.find((m) => m.id === selectedModel)?.label ?? selectedModel}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {modelMenuOpen && (
                  <div className="absolute bottom-full mb-1 left-0 min-w-[200px] bg-portal-card border border-portal-border rounded-lg shadow-xl overflow-hidden z-20">
                    {models.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] text-portal-muted">No models configured</div>
                    ) : (
                      models.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => chooseModel(m.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-portal-card-hover',
                            m.id === selectedModel ? 'text-portal-accent' : 'text-portal-text'
                          )}
                        >
                          <span className="flex-1">{m.label}</span>
                          {m.supportsTools && (
                            <span className="text-[9px] text-portal-muted" title="Supports tools">
                              tools
                            </span>
                          )}
                          {m.id === selectedModel && <Check className="h-3 w-3" />}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {/* Project context selector */}
              {projects.length > 0 && (
                <label className="inline-flex items-center gap-1 text-[11px] text-portal-muted px-2 py-1 rounded-md border border-portal-border bg-portal-card">
                  <FolderGit2 className="h-3 w-3" />
                  <select
                    value={selectedProject}
                    onChange={(e) => chooseProject(e.target.value)}
                    className="bg-transparent text-[11px] text-portal-text focus:outline-none max-w-[140px]"
                    title="Project context — loads its MEMORY.md"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.slug}>{p.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {!models.find((m) => m.id === selectedModel)?.supportsTools && (
                <span className="text-[10px] text-portal-muted">text-only (no tools)</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
