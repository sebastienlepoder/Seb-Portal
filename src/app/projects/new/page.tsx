'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import { ArrowLeft, FolderPlus, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NewProjectPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [icon, setIcon] = useState('📁');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) window.location.href = '/login';
    if (!loading && user && user.role?.toLowerCase() !== 'admin') {
      router.push('/projects');
    }
  }, [loading, user, router]);

  // Auto-generate slug from name
  useEffect(() => {
    const generated = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(generated);
  }, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: JSON.stringify({
          name,
          slug,
          description: description || null,
          repoUrl: repoUrl || null,
          icon,
        }),
      });

      const data = await res.json();
      
      if (data.ok) {
        router.push(`/projects/${slug}`);
      } else {
        setError(data.error || 'Failed to create project');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-portal-bg p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link 
            href="/projects" 
            className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-portal-text flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-portal-accent" />
              Nouveau projet
            </h1>
            <p className="text-sm text-portal-muted">Créer un nouveau projet à documenter</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-portal-card border border-portal-border rounded-xl p-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Icon + Name */}
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-portal-text mb-2">
                  Icône
                </label>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="w-16 h-10 text-center text-2xl bg-portal-bg border border-portal-border rounded-lg focus:outline-none focus:border-portal-accent/50"
                  maxLength={2}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-portal-text mb-2">
                  Nom du projet *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Mon Super Projet"
                  className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2 text-portal-text focus:outline-none focus:border-portal-accent/50"
                  required
                />
              </div>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-portal-text mb-2">
                Slug (URL) *
              </label>
              <div className="flex items-center gap-2">
                <span className="text-portal-muted text-sm">/projects/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="mon-super-projet"
                  className="flex-1 bg-portal-bg border border-portal-border rounded-lg px-4 py-2 text-portal-text font-mono text-sm focus:outline-none focus:border-portal-accent/50"
                  required
                  pattern="[a-z0-9-]+"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-portal-text mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Une brève description du projet..."
                rows={3}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2 text-portal-text focus:outline-none focus:border-portal-accent/50 resize-none"
              />
            </div>

            {/* Repo URL */}
            <div>
              <label className="block text-sm font-medium text-portal-text mb-2">
                Repository GitHub
              </label>
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/username/repo"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2 text-portal-text focus:outline-none focus:border-portal-accent/50"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-portal-border">
            <Link
              href="/projects"
              className="px-4 py-2 text-sm text-portal-muted hover:text-portal-text transition-colors"
            >
              Annuler
            </Link>
            <button
              type="submit"
              disabled={saving || !name || !slug}
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4" />
                  Créer le projet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
