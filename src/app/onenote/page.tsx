'use client';

import { useState, useEffect } from 'react';
import { useMicrosoftStatus, useOneNote } from '@/hooks/useMicrosoft';
import {
  BookOpen,
  Folder,
  FileText,
  ExternalLink,
  Plus,
  ArrowLeft,
  RefreshCw,
  ChevronRight,
  Link2,
  X,
} from 'lucide-react';

export default function OneNotePage() {
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

  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageContent, setNewPageContent] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status?.connected) {
      fetchNotebooks();
    }
  }, [status?.connected, fetchNotebooks]);

  const handleNotebookClick = (notebookId: string) => {
    setSelectedNotebook(notebookId);
    setSelectedSection(null);
    fetchSections(notebookId);
  };

  const handleSectionClick = (sectionId: string) => {
    setSelectedSection(sectionId);
    fetchPages(sectionId);
  };

  const handleBack = () => {
    if (selectedSection) {
      setSelectedSection(null);
    } else if (selectedNotebook) {
      setSelectedNotebook(null);
    }
  };

  const handleCreatePage = async () => {
    if (!selectedSection || !newPageTitle.trim()) return;
    setCreating(true);
    const result = await createPage(selectedSection, newPageTitle, newPageContent);
    if (result.ok) {
      setShowCreateModal(false);
      setNewPageTitle('');
      setNewPageContent('');
      fetchPages(selectedSection);
    }
    setCreating(false);
  };

  if (statusLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
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
    );
  }

  const selectedNotebookData = notebooks.find((n) => n.id === selectedNotebook);

  return (
    <div className="min-h-screen bg-portal-bg">
      {/* Header */}
      <div className="border-b border-portal-border bg-portal-card">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a
                href="/dashboard"
                className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </a>
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-400" />
                <h1 className="text-lg font-bold text-portal-text">OneNote</h1>
              </div>
            </div>
            <button
              onClick={() => {
                fetchNotebooks();
                if (selectedNotebook) fetchSections(selectedNotebook);
                if (selectedSection) fetchPages(selectedSection);
              }}
              className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 mt-2 text-xs text-portal-muted">
            <button
              onClick={() => { setSelectedNotebook(null); setSelectedSection(null); }}
              className="hover:text-portal-text"
            >
              Notebooks
            </button>
            {selectedNotebook && (
              <>
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => setSelectedSection(null)}
                  className="hover:text-portal-text"
                >
                  {selectedNotebookData?.displayName}
                </button>
              </>
            )}
            {selectedSection && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="text-portal-text">
                  {sections.find((s) => s.id === selectedSection)?.displayName}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Notebooks View */}
        {!selectedNotebook && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {notebooks.map((notebook) => (
              <button
                key={notebook.id}
                onClick={() => handleNotebookClick(notebook.id)}
                className="flex items-start gap-3 p-4 bg-portal-card border border-portal-border rounded-xl hover:border-purple-500/50 transition-colors text-left"
              >
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <BookOpen className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-portal-text truncate">
                    {notebook.displayName}
                  </h3>
                  <p className="text-xs text-portal-muted mt-1">
                    Modified {new Date(notebook.lastModifiedDateTime).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-portal-muted flex-shrink-0 mt-1" />
              </button>
            ))}
          </div>
        )}

        {/* Sections View */}
        {selectedNotebook && !selectedSection && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                className="flex items-start gap-3 p-4 bg-portal-card border border-portal-border rounded-xl hover:border-purple-500/50 transition-colors text-left"
              >
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Folder className="h-5 w-5 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-portal-text truncate">
                    {section.displayName}
                  </h3>
                </div>
                <ChevronRight className="h-4 w-4 text-portal-muted flex-shrink-0 mt-1" />
              </button>
            ))}

            {sections.length === 0 && !loading && (
              <p className="text-sm text-portal-muted col-span-full text-center py-8">
                No sections in this notebook
              </p>
            )}
          </div>
        )}

        {/* Pages View */}
        {selectedSection && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-portal-muted">
                {pages.length} pages
              </h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New Page
              </button>
            </div>

            <div className="space-y-2">
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
                <p className="text-sm text-portal-muted text-center py-8">
                  No pages in this section
                </p>
              )}
            </div>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
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
