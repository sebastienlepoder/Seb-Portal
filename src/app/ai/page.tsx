'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import {
  ArrowLeft,
  Sparkles,
  StickyNote,
  Plus,
  Search,
  Download,
  Trash2,
  X,
  Save,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiNote {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export default function AiPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<'chat' | 'notes' | 'iframe'>('chat');
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [editingNote, setEditingNote] = useState<AiNote | null>(null);
  const [newNote, setNewNote] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
  }, [loading, user]);

  useEffect(() => {
    if (tab === 'notes') fetchNotes();
  }, [tab, noteSearch]);

  const fetchNotes = async () => {
    const q = noteSearch ? `?q=${encodeURIComponent(noteSearch)}` : '';
    const res = await fetch(`/api/ai/notes${q}`);
    const data = await res.json();
    if (data.ok) setNotes(data.data);
  };

  const saveNote = async (note: { title?: string; content: string; tags?: string[] }) => {
    await fetch('/api/ai/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
      },
      body: JSON.stringify(note),
    });
    setNewNote(false);
    fetchNotes();
  };

  const exportNotes = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-notes-${Date.now()}.json`;
    a.click();
  };

  const tryIframe = (url: string) => {
    setIframeUrl(url);
    setIframeBlocked(false);
    setTimeout(() => {
      if (iframeUrl) setIframeBlocked(true);
    }, 5000);
  };

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-portal-bg flex flex-col">
      {/* Header */}
      <div className="border-b border-portal-border bg-portal-card">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-3">
          <a href="/dashboard" className="ml-10 sm:ml-0 p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </a>
          <Sparkles className="h-5 w-5 text-portal-accent" />
          <span className="text-sm font-semibold text-portal-text">AI Hub</span>
          <div className="flex ml-auto gap-1">
            {(['chat', 'notes', 'iframe'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-colors',
                  tab === t ? 'bg-portal-accent text-white' : 'text-portal-muted hover:text-portal-text hover:bg-portal-card-hover'
                )}
              >
                {t === 'chat' ? 'API Chat' : t === 'notes' ? 'Notes' : 'Iframe'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {tab === 'chat' && (
          <div className="w-full max-w-6xl mx-auto h-[calc(100vh-60px)]">
            <AiChatPanel csrfToken={user.csrfToken} />
          </div>
        )}

        {tab === 'notes' && (
          <div className="w-full max-w-4xl mx-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                <input
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search notes..."
                  className="w-full bg-portal-card border border-portal-border rounded-lg pl-10 pr-4 py-2 text-sm text-portal-text"
                />
              </div>
              <button onClick={() => setNewNote(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-accent text-white rounded-lg">
                <Plus className="h-3.5 w-3.5" /> New Note
              </button>
              <button onClick={exportNotes} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg">
                <Download className="h-3.5 w-3.5" /> Export JSON
              </button>
            </div>

            {newNote && (
              <NoteEditor onSave={saveNote} onCancel={() => setNewNote(false)} />
            )}

            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="bg-portal-card border border-portal-border rounded-lg p-4">
                  {note.title && <h4 className="text-sm font-medium text-portal-text mb-1">{note.title}</h4>}
                  <pre className="text-xs text-portal-text-dim whitespace-pre-wrap font-sans">{note.content}</pre>
                  {note.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {note.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-portal-border text-portal-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'iframe' && (
          <div className="w-full p-4">
            <div className="max-w-2xl mx-auto mb-4 space-y-2">
              <p className="text-xs text-portal-muted">Try embedding ChatGPT or Claude (most will block iframe). Fallback: opens in new tab.</p>
              <div className="flex gap-2">
                <button onClick={() => tryIframe('https://chatgpt.com')} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover">
                  Try ChatGPT Iframe
                </button>
                <button onClick={() => tryIframe('https://claude.ai')} className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover">
                  Try Claude Iframe
                </button>
                <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-accent text-white rounded-lg">
                  <ExternalLink className="h-3.5 w-3.5" /> Open ChatGPT
                </a>
                <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-accent text-white rounded-lg">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Claude
                </a>
              </div>
            </div>
            {iframeUrl && (
              <div className="border border-portal-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
                <iframe
                  src={iframeUrl}
                  className="w-full h-full border-0"
                  onError={() => setIframeBlocked(true)}
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>
            )}
            {iframeBlocked && (
              <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-400">
                This site blocks iframe embedding. Use the &quot;Open&quot; buttons above or switch to API Chat mode.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ onSave, onCancel }: { onSave: (note: { title?: string; content: string; tags?: string[] }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  return (
    <div className="bg-portal-card border border-portal-border rounded-lg p-4 mb-4 animate-fade-in">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="w-full bg-portal-bg border border-portal-border rounded px-3 py-2 text-sm text-portal-text mb-2" />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Note content..." rows={5} className="w-full bg-portal-bg border border-portal-border rounded px-3 py-2 text-sm text-portal-text mb-2 resize-y" />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma-separated)" className="w-full bg-portal-bg border border-portal-border rounded px-3 py-2 text-xs text-portal-text mb-3" />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg">Cancel</button>
        <button
          onClick={() => onSave({ title: title || undefined, content, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })}
          disabled={!content.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-portal-accent text-white rounded-lg disabled:opacity-50"
        >
          <Save className="h-3 w-3" /> Save
        </button>
      </div>
    </div>
  );
}
