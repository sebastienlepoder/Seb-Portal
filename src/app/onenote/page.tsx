'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { useMicrosoftStatus, useOneNote } from '@/hooks/useMicrosoft';
import PortalSidebar from '@/components/layout/PortalSidebar';
import {
  BookOpen,
  Folder,
  FileText,
  ExternalLink,
  Plus,
  RefreshCw,
  Link2,
  X,
  ArrowLeft,
} from 'lucide-react';

export default function OneNotePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { status, loading: statusLoading, connect } = useMicrosoftStatus();
  const {
    notebooks,
    sections,
    pages,
    loading,
    error,
    fetchNotebooks,
    fetchSections,
    fetchPages,
    createPage,
  } = useOneNote();

  const [selectedNotebook, setSelectedNotebook] = useState<{ id: string; name: string; url: string } | null>(null);
  const [selectedSection, setSelectedSection] = useState<{ id: string; name: string } | null>(null);
  const [selectedPage, setSelectedPage] = useState<{ id: string; title: string; url: string } | null>(null);
  const [pageContent, setPageContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageContent, setNewPageContent] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (status?.connected) {
      fetchNotebooks();
    }
  }, [status?.connected, fetchNotebooks]);

  const handleNotebookSelect = (notebook: { id: string; displayName: string; links: { oneNoteWebUrl: { href: string } } }) => {
    setSelectedNotebook({ id: notebook.id, name: notebook.displayName, url: notebook.links.oneNoteWebUrl.href });
    setSelectedSection(null);
    setSelectedPage(null);
    setPageContent(null);
    fetchSections(notebook.id);
  };

  const handleSectionSelect = (section: { id: string; displayName: string }) => {
    setSelectedSection({ id: section.id, name: section.displayName });
    setSelectedPage(null);
    setPageContent(null);
    fetchPages(section.id);
  };

  const handlePageSelect = async (page: { id: string; title: string; links: { oneNoteWebUrl: { href: string } } }) => {
    setSelectedPage({ id: page.id, title: page.title, url: page.links.oneNoteWebUrl.href });
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/microsoft/onenote?type=content&pageId=${page.id}`);
      const data = await res.json();
      if (data.ok) {
        setPageContent(data.data.content);
      }
    } catch (e) {
      console.error('Failed to load page content:', e);
    }
    setLoadingContent(false);
  };

  const handleCreatePage = async () => {
    if (!selectedSection || !newPageTitle.trim()) return;
    setCreating(true);
    const result = await createPage(selectedSection.id, newPageTitle, newPageContent);
    if (result.ok) {
      setShowCreateModal(false);
      setNewPageTitle('');
      setNewPageContent('');
      fetchPages(selectedSection.id);
    }
    setCreating(false);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      {/* Portal Sidebar */}
      <PortalSidebar user={user} onLogout={logout} />

      {/* Main Content */}
      <div className="flex-1 flex">
        {statusLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : !status?.connected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <BookOpen className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-portal-text mb-2">OneNote</h1>
              <p className="text-sm text-portal-muted mb-4">Connect your Microsoft account to access OneNote</p>
              <button
                onClick={connect}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors mx-auto"
              >
                <Link2 className="h-4 w-4" />
                Connect Microsoft Account
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Notebooks/Sections/Pages Sidebar */}
            <div className="w-64 bg-portal-card border-r border-portal-border flex-shrink-0 flex flex-col">
              <div className="p-3 border-b border-portal-border">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-portal-muted uppercase tracking-wider">Notebooks</h2>
                  <button
                    onClick={fetchNotebooks}
                    className="p-1 text-portal-muted hover:text-portal-text transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading && !selectedNotebook ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                {notebooks.map((notebook) => (
                  <div key={notebook.id} className="space-y-0.5">
                    <button
                      onClick={() => handleNotebookSelect(notebook)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                        selectedNotebook?.id === notebook.id
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{notebook.displayName}</span>
                    </button>

                    {/* Sections under selected notebook */}
                    {selectedNotebook?.id === notebook.id && sections.length > 0 && (
                      <div className="ml-3 pl-2 border-l border-portal-border space-y-0.5">
                        {sections.map((section) => (
                          <div key={section.id}>
                            <button
                              onClick={() => handleSectionSelect(section)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors text-left ${
                                selectedSection?.id === section.id
                                  ? 'bg-purple-500/10 text-purple-400'
                                  : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                              }`}
                            >
                              <Folder className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{section.displayName}</span>
                            </button>

                            {/* Pages under selected section */}
                            {selectedSection?.id === section.id && pages.length > 0 && (
                              <div className="ml-3 pl-2 border-l border-portal-border space-y-0.5 mt-0.5">
                                {pages.map((page) => (
                                  <button
                                    key={page.id}
                                    onClick={() => handlePageSelect(page)}
                                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-colors text-left ${
                                      selectedPage?.id === page.id
                                        ? 'bg-purple-500/10 text-purple-400'
                                        : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                                    }`}
                                  >
                                    <FileText className="h-2.5 w-2.5 flex-shrink-0" />
                                    <span className="truncate">{page.title}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>

              {selectedSection && (
                <div className="p-2 border-t border-portal-border">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    New Page
                  </button>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="border-b border-portal-border bg-portal-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                    <div>
                      <h1 className="text-lg font-bold text-portal-text">
                        {selectedPage?.title || selectedSection?.name || selectedNotebook?.name || 'OneNote'}
                      </h1>
                      {selectedNotebook && !selectedPage && (
                        <p className="text-xs text-portal-muted">
                          {selectedSection ? `${pages.length} pages` : `${sections.length} sections`}
                        </p>
                      )}
                    </div>
                  </div>
                  {selectedPage && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSelectedPage(null); setPageContent(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
                      >
                        <ArrowLeft className="h-3 w-3" />
                        Back to list
                      </button>
                      <a
                        href={selectedPage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Edit in OneNote
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {error && (
                  <div className="m-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 text-sm">
                    {error}
                  </div>
                )}

                {/* Page Content View */}
                {selectedPage && (
                  loadingContent ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
                    </div>
                  ) : pageContent ? (
                    <div className="p-6">
                      <div
                        className="prose prose-sm prose-invert max-w-none onenote-content"
                        dangerouslySetInnerHTML={{ __html: pageContent }}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-portal-muted">Failed to load page content</p>
                    </div>
                  )
                )}

                {/* Pages List (when section selected but no page) */}
                {selectedSection && !selectedPage && (
                  <div className="p-4">
                    {pages.length > 0 ? (
                      <div className="grid gap-2">
                        {pages.map((page) => (
                          <button
                            key={page.id}
                            onClick={() => handlePageSelect(page)}
                            className="flex items-center gap-3 p-4 bg-portal-card border border-portal-border rounded-xl hover:border-purple-500/50 transition-colors text-left group"
                          >
                            <FileText className="h-5 w-5 text-purple-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-portal-text truncate">
                                {page.title}
                              </h3>
                              <p className="text-xs text-portal-muted">
                                Modified {new Date(page.lastModifiedDateTime).toLocaleDateString()}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : !loading ? (
                      <div className="text-center py-12">
                        <FileText className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                        <p className="text-sm text-portal-muted">No pages in this section</p>
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="mt-4 flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors mx-auto"
                        >
                          <Plus className="h-4 w-4" />
                          Create First Page
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Sections List (when notebook selected but no section) */}
                {selectedNotebook && !selectedSection && (
                  <div className="p-4">
                    {sections.length > 0 ? (
                      <div className="grid gap-2">
                        {sections.map((section) => (
                          <button
                            key={section.id}
                            onClick={() => handleSectionSelect(section)}
                            className="flex items-center gap-3 p-4 bg-portal-card border border-portal-border rounded-xl hover:border-purple-500/50 transition-colors text-left"
                          >
                            <Folder className="h-5 w-5 text-purple-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-portal-text">{section.displayName}</span>
                          </button>
                        ))}
                      </div>
                    ) : !loading ? (
                      <div className="text-center py-12">
                        <Folder className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                        <p className="text-sm text-portal-muted">No sections in this notebook</p>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Welcome state */}
                {!selectedNotebook && !loading && (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                    <p className="text-sm text-portal-muted">Select a notebook to get started</p>
                  </div>
                )}

                {loading && !selectedPage && (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Page Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-portal-border">
              <h3 className="text-sm font-semibold text-portal-text">Create New Page</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-portal-muted hover:text-portal-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Title</label>
                <input
                  type="text"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  placeholder="Page title..."
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-purple-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-muted mb-1">Content (HTML)</label>
                <textarea
                  value={newPageContent}
                  onChange={(e) => setNewPageContent(e.target.value)}
                  placeholder="<p>Your content here...</p>"
                  rows={6}
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-sm text-portal-text focus:outline-none focus:border-purple-500/50 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-portal-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs text-portal-text bg-portal-bg border border-portal-border rounded-lg hover:bg-portal-border"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePage}
                disabled={creating || !newPageTitle.trim()}
                className="px-4 py-2 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Page'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .onenote-content img {
          max-width: 100%;
          height: auto;
        }
        .onenote-content table {
          border-collapse: collapse;
          width: 100%;
        }
        .onenote-content td, .onenote-content th {
          border: 1px solid #374151;
          padding: 8px;
        }
      `}</style>
    </div>
  );
}
