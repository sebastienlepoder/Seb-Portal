'use client';

import { useState } from 'react';
import { Save, Shield, Sparkles, X } from 'lucide-react';
import type { ServiceData } from '@/hooks/usePortal';

export interface ServiceEditorModalProps {
  service: ServiceData;
  csrfToken?: string;
  onClose: () => void;
  onSaved: () => void;
  onAiSuggest?: (url: string) => Promise<Record<string, unknown> | null>;
}

export function ServiceEditorModal({
  service,
  csrfToken,
  onClose,
  onSaved,
  onAiSuggest,
}: ServiceEditorModalProps) {
  const [form, setForm] = useState({
    slug: service.slug || '',
    name: service.name || '',
    url: service.url || '',
    type: service.type || 'external',
    description: service.description || '',
    tags: service.tags?.join(', ') || '',
    section: service.section || 'General',
    category: service.category || 'Uncategorized',
    openMode: service.openMode || 'new_tab',
    requiresVPN: service.requiresVPN || false,
    statusCheckUrl: service.statusCheckUrl || '',
    favoriteDefault: service.favoriteDefault || false,
    credentialsHint: service.credentialsHint || '',
    sortOrder: service.sortOrder || 0,
  });
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const handleAiSuggestClick = async () => {
    if (!form.url || !onAiSuggest) return;
    setSuggesting(true);
    const suggestion = await onAiSuggest(form.url);
    if (suggestion) {
      setForm((prev) => ({
        ...prev,
        name: (suggestion.name as string) || prev.name,
        description: (suggestion.description as string) || prev.description,
        tags: Array.isArray(suggestion.tags) ? suggestion.tags.join(', ') : prev.tags,
        section: (suggestion.section as string) || prev.section,
        category: (suggestion.category as string) || prev.category,
        statusCheckUrl: (suggestion.statusCheckUrl as string) || prev.statusCheckUrl,
      }));
    }
    setSuggesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const body = { ...form, tags };
    const res = await fetch(`/api/services/${service.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) onSaved();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between p-4 border-b border-portal-border">
          <h3 className="text-sm font-semibold text-portal-text">Edit Service</h3>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <EditorField label="URL" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="https://..." />
          {onAiSuggest && (
            <button
              onClick={handleAiSuggestClick}
              disabled={suggesting || !form.url}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-accent/10 text-portal-accent rounded-lg hover:bg-portal-accent/20 transition-colors disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {suggesting ? 'AI analyse...' : 'AI Suggest Fields'}
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <EditorField label="Slug" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
            <EditorField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </div>
          <EditorField label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          <EditorField label="Tags (comma-separated)" value={form.tags} onChange={(v) => setForm({ ...form, tags: v })} />
          <div className="grid grid-cols-2 gap-3">
            <EditorField label="Section" value={form.section} onChange={(v) => setForm({ ...form, section: v })} />
            <EditorField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditorSelect label="Type" value={form.type} options={['internal', 'external', 'github', 'email', 'remote', 'bookmark', 'tool', 'ai']} onChange={(v) => setForm({ ...form, type: v })} />
            <EditorSelect label="Open Mode" value={form.openMode} options={['new_tab', 'iframe', 'modal', 'sidepanel']} onChange={(v) => setForm({ ...form, openMode: v })} />
          </div>
          <EditorField label="Status Check URL" value={form.statusCheckUrl} onChange={(v) => setForm({ ...form, statusCheckUrl: v })} placeholder="https://..." />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-portal-text">
              <input
                type="checkbox"
                checked={form.openMode === 'iframe' || form.openMode === 'modal'}
                onChange={(e) => setForm({ ...form, openMode: e.target.checked ? 'iframe' : 'new_tab' })}
                className="rounded"
              />
              Ouvrir dans une iframe
            </label>
            <label className="flex items-center gap-2 text-xs text-portal-text">
              <input type="checkbox" checked={form.requiresVPN} onChange={(e) => setForm({ ...form, requiresVPN: e.target.checked })} className="rounded" />
              Requires VPN
            </label>
            <label className="flex items-center gap-2 text-xs text-portal-text">
              <input type="checkbox" checked={form.favoriteDefault} onChange={(e) => setForm({ ...form, favoriteDefault: e.target.checked })} className="rounded" />
              Default Favorite
            </label>
          </div>
          {form.credentialsHint !== undefined && (
            <EditorField label="Credentials Hint (admin-only)" value={form.credentialsHint} onChange={(v) => setForm({ ...form, credentialsHint: v })} />
          )}
          {form.credentialsHint && (
            <div className="text-[10px] text-amber-400 flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Warning: Do NOT store real passwords or secrets here.
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-portal-border">
          <button onClick={onClose} className="px-4 py-2 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-portal-accent text-white rounded-lg hover:bg-portal-accent-dark disabled:opacity-50">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-portal-muted mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-xs text-portal-text focus:outline-none focus:border-portal-accent/50"
      />
    </div>
  );
}

function EditorSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-portal-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-xs text-portal-text focus:outline-none focus:border-portal-accent/50"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
