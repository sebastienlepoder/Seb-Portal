'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  X,
  MessageSquare,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiMessage, AiProvider } from '@/types';

interface AiChatPanelProps {
  csrfToken?: string;
  onClose?: () => void;
}

export function AiChatPanel({ csrfToken, onClose }: AiChatPanelProps) {
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [mode, setMode] = useState<'chat' | 'launcher'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: AiMessage = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

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
        if (data.data.threadId) setThreadId(data.data.threadId);
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
  };

  return (
    <div className="flex flex-col h-full bg-portal-bg border-l border-portal-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-portal-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-portal-accent" />
          <span className="text-sm font-semibold text-portal-text">AI Hub</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === 'chat' ? 'launcher' : 'chat')}
            className="text-xs px-2 py-1 rounded bg-portal-card border border-portal-border text-portal-text-dim hover:text-portal-text transition-colors"
          >
            {mode === 'chat' ? 'Launcher' : 'Chat'}
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {mode === 'launcher' ? (
        <LauncherMode />
      ) : (
        <>
          {/* Provider Tabs */}
          <div className="flex border-b border-portal-border">
            {(['openai', 'anthropic'] as AiProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setProvider(p);
                  setMessages([]);
                  setThreadId(undefined);
                }}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  provider === p
                    ? 'text-portal-accent border-b-2 border-portal-accent'
                    : 'text-portal-muted hover:text-portal-text'
                )}
              >
                {p === 'openai' ? 'ChatGPT' : 'Claude'}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-portal-muted text-sm py-8">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Start a conversation with {provider === 'openai' ? 'ChatGPT' : 'Claude'}</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-2 animate-slide-up',
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
            ))}
            {loading && (
              <div className="flex gap-2 items-center text-portal-muted text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-portal-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Ask anything..."
                className="flex-1 bg-portal-card border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function LauncherMode() {
  const launchers = [
    { name: 'ChatGPT', url: 'https://chatgpt.com', icon: '🤖' },
    { name: 'Claude', url: 'https://claude.ai', icon: '🧠' },
  ];

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-portal-muted">
        Open AI assistants in a new tab, or use the Chat mode for API-based conversations.
      </p>
      {launchers.map((l) => (
        <a
          key={l.name}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-3 bg-portal-card border border-portal-border rounded-lg hover:border-portal-accent/30 transition-all"
        >
          <span className="text-xl">{l.icon}</span>
          <div className="flex-1">
            <div className="text-sm font-medium text-portal-text">{l.name}</div>
            <div className="text-xs text-portal-muted">{l.url}</div>
          </div>
          <ExternalLink className="h-4 w-4 text-portal-muted" />
        </a>
      ))}
      <div className="mt-4 pt-4 border-t border-portal-border">
        <div className="flex items-center gap-2 text-xs text-portal-muted mb-2">
          <MessageSquare className="h-3.5 w-3.5" />
          Quick Notes
        </div>
        <p className="text-xs text-portal-text-dim">
          Save prompts and AI answers in the Notes section (AI &gt; Notes in nav).
        </p>
      </div>
    </div>
  );
}
