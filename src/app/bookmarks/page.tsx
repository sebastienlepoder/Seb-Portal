'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth, useApiCall } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  Bookmark as BookmarkIcon, Plus, Trash2, Search, Upload, X,
  ExternalLink, RefreshCw, FolderOpen, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Bookmark {
  id: string;
  title: string;
  url: string;
  folder: string | null;
  icon: string | null;
  tags: string[];
  createdAt: string;
}

const UNFILED = 'Unfiled';

/** Derive a favicon URL for a bookmark, preferring a stored icon. */
function faviconFor(bm: Bookmark): string | null {
  if (bm.icon) return bm.icon;
  try {
    const host = new URL(bm.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return null;
  }
}

export default function BookmarksPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const apiCall = useApiCall(user?.csrfToken);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) window.location.href = '/login';
  }, [authLoading, user]);

  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks');
      const result = await res.json();
      if (result.ok) setBookmarks(result.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Client-side search keeps the experience instant; the data set is small.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookmarks.filter((b) => {
      if (folderFilter && (b.folder || UNFILED) !== folderFilter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [bookmarks, search, folderFilter]);

  const folders = useMemo(() => {
    const set = new Map<string, number>();
    bookmarks.forEach((b) => {
      const f = b.folder || UNFILED;
      set.set(f, (set.get(f) || 0) + 1);
    });
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [bookmarks]);

  const grouped = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    filtered.forEach((b) => {
      const f = b.folder || UNFILED;
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(b);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const addBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    // Normalise a bare host into a URL so the favicon + link work.
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const title = newTitle.trim() || (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();
    const result = await apiCall('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ bookmarks: [{ title, url, folder: newFolder.trim() || undefined }] }),
    });
    setAdding(false);
    if (result.ok) {
      setNewTitle(''); setNewUrl(''); setNewFolder('');
      setShowAddForm(false);
      fetchBookmarks();
    }
  };

  const deleteBookmark = async (id: string) => {
    if (!confirm('Delete this bookmark?')) return;
    const result = await apiCall(`/api/bookmarks?id=${id}`, { method: 'DELETE' });
    if (result.ok) setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const importHtml = async (file: File) => {
    setImportMsg(null);
    const text = await file.text();
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: text,
      });
      const result = await res.json();
      if (result.ok) {
        setImportMsg(`Imported ${result.data.imported} of ${result.data.total} bookmarks.`);
        fetchBookmarks();
      } else {
        setImportMsg(result.error || 'Import failed.');
      }
    } catch {
      setImportMsg('Import failed.');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (authLoading || (loading && bookmarks.length === 0)) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 border-b border-portal-border bg-portal-card px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="pl-10 sm:pl-0 flex items-center gap-3 flex-1 min-w-0">
              <BookmarkIcon className="h-5 w-5 text-portal-accent flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-portal-text">Bookmarks</h1>
                <p className="text-xs text-portal-muted">
                  {bookmarks.length} saved · {folders.length} folder{folders.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchBookmarks}
              className="p-2 text-portal-muted hover:text-portal-text rounded-lg transition-colors flex-shrink-0"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 pl-10 sm:pl-0">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xs:inline">Add Bookmark</span>
              <span className="xs:hidden">Add</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 bg-portal-card border border-portal-border hover:bg-portal-card-hover text-portal-text rounded-lg transition-colors text-sm whitespace-nowrap"
              title="Import a Chrome/Firefox bookmarks HTML export"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import HTML</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,text/html"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importHtml(f);
              }}
            />
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {importMsg && (
            <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-portal-accent/10 border border-portal-accent/20 rounded-lg text-sm text-portal-text">
              <span>{importMsg}</span>
              <button onClick={() => setImportMsg(null)} className="text-portal-muted hover:text-portal-text">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Add form */}
          {showAddForm && (
            <form
              onSubmit={addBookmark}
              className="mb-4 p-4 bg-portal-card border border-portal-border rounded-lg space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  autoFocus
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="URL (e.g. example.com)"
                  className="px-3 py-2 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
                />
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="px-3 py-2 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Folder (optional)"
                  list="bookmark-folders"
                  className="flex-1 px-3 py-2 text-sm bg-portal-bg border border-portal-border rounded-lg text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
                />
                <datalist id="bookmark-folders">
                  {folders.map(([f]) => <option key={f} value={f === UNFILED ? '' : f} />)}
                </datalist>
                <button
                  type="submit"
                  disabled={adding || !newUrl.trim()}
                  className="px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {adding ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-2 text-portal-muted hover:text-portal-text rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Search + folder filter */}
          {bookmarks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bookmarks…"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-portal-card border border-portal-border rounded-lg text-portal-text focus:outline-none focus:ring-2 focus:ring-portal-accent"
                />
              </div>
              <div className="flex gap-2 items-center">
                <FolderOpen className="h-4 w-4 text-portal-muted flex-shrink-0" />
                <select
                  value={folderFilter}
                  onChange={(e) => setFolderFilter(e.target.value)}
                  className="px-2 py-2 text-sm bg-portal-card border border-portal-border rounded-lg text-portal-text focus:outline-none max-w-[180px]"
                >
                  <option value="">All folders</option>
                  {folders.map(([f, count]) => (
                    <option key={f} value={f}>{f} ({count})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Empty state */}
          {bookmarks.length === 0 && (
            <div className="text-center py-16 text-portal-muted">
              <BookmarkIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-lg text-portal-text">No bookmarks yet</p>
              <p className="text-sm mt-1">
                Add one above, or import your Chrome/Firefox bookmarks HTML export.
              </p>
            </div>
          )}

          {bookmarks.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 text-portal-muted">
              <p>No bookmarks match your search.</p>
            </div>
          )}

          {/* Grouped grid */}
          {grouped.map(([folder, items]) => (
            <div key={folder} className="mb-6">
              <h2 className="text-xs font-semibold text-portal-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                {folder}
                <span className="text-portal-muted/60">({items.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map((bm) => {
                  const favicon = faviconFor(bm);
                  return (
                    <div
                      key={bm.id}
                      className="group relative flex items-center gap-3 p-3 bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover hover:border-portal-accent/30 transition-colors"
                    >
                      <a
                        href={bm.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 min-w-0 flex-1"
                      >
                        <span className="h-8 w-8 rounded-md bg-portal-bg border border-portal-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {favicon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={favicon} alt="" className="h-5 w-5" loading="lazy" />
                          ) : (
                            <Globe className="h-4 w-4 text-portal-muted" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-portal-text truncate">{bm.title}</span>
                          <span className="block text-xs text-portal-muted truncate">{bm.url}</span>
                        </span>
                      </a>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <a
                          href={bm.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-portal-muted hover:text-portal-text rounded-md"
                          aria-label="Open"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <button
                          onClick={() => deleteBookmark(bm.id)}
                          className="p-1.5 text-portal-muted hover:text-red-400 rounded-md"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
