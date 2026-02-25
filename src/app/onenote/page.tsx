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
    fetchSections(notebook.id);
  };

  const handleSectionSelect = (section: { id: string; displayName: string }) => {
    setSelectedSection({ id: section.id, name: section.displayName });
    fetchPages(section.id);
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
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-portal-bg flex">
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
            {/* Notebooks Sidebar */}
            <div className="w-56 bg-portal-card border-r border-portal-border flex-shrink-0 flex flex-col">
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
                  <div key={notebook.id} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleNotebookSelect(notebook)}
                        className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left ${
                          selectedNotebook?.id === notebook.id
                            ? 'bg-purple-500/10 text-purple-400'
                            : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                        }`}
                      >
                        <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{notebook.displayName}</span>
                      </button>
                      <a
                        href={notebook.links.oneNoteWebUrl.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-portal-muted hover:text-purple-400 transition-colors"
                        title="Open in OneNote"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {/* Sections under selected notebook */}
                    {selectedNotebook?.id === notebook.id && sections.length > 0 && (
                      <div className="ml-4 space-y-0.5">
                        {sections.map((section) => (
                          <button
                            key={section.id}
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
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>

            {/* Pages Content */}
            <div className="flex-1 flex flex-col">
              {/* Header */}
              <div className="border-b border-portal-border bg-portal-card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-purple-400" />
                    <div>
                      <h1 className="text-lg font-bold text-portal-text">
                        {selectedSection?.name || selectedNotebook?.name || 'OneNote'}
                      </h1>
                      {selectedNotebook && !selectedSection && (
                        <p className="text-xs text-portal-muted">Select a section to view pages</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedNotebook && (
                      <a
                        href={selectedNotebook.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in OneNote
                      </a>
                    )}
                    {selectedSection && (
                      <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        New Page
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Pages List */}
              <div className="flex-1 overflow-y-auto p-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
                    {error}
                  </div>
                )}

                {!selectedNotebook && (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                    <p className="text-sm text-portal-muted">Select a notebook to get started</p>
                  </div>
                )}

                {selectedNotebook && !selectedSection && sections.length === 0 && !loading && (
                  <div className="text-center py-12">
                    <Folder className="h-12 w-12 text-portal-muted mx-auto mb-3" />
                    <p className="text-sm text-portal-muted">No sections in this notebook</p>
                  </div>
                )}

                {selectedSection && (
                  <div className="grid gap-3">
                    {pages.map((page) => (
                      <a
                        key={page.id}
                        href={page.links.oneNoteWebUrl.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-portal-card border border-portal-border rounded-xl hover:border-purple-500/50 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-purple-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <h3 className="text-sm font-medium text-portal-text truncate">
                              {page.title}
                            </h3>
                            <p className="text-xs text-portal-muted">
                              Modified {new Date(page.lastModifiedDateTime).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-portal-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    ))}

                    {pages.length === 0 && !loading && (
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
                    )}
                  </div>
                )}

                {loading && (
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
    </div>
  );
}
