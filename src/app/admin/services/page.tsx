'use client';

import { useState, useEffect } from 'react';
import { useAuth, useApiCall } from '@/hooks/usePortal';
import { cn } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  ArrowLeft,
  Sparkles,
  Save,
  X,
  Shield,
  HelpCircle,
} from 'lucide-react';

interface Service {
  id: string;
  slug: string;
  name: string;
  url: string;
  type: string;
  description: string | null;
  tags: string[];
  section: string;
  category: string;
  openMode: string;
  requiresVPN: boolean;
  statusCheckUrl: string | null;
  favoriteDefault: boolean;
  icon: string | null;
  credentialsHint: string | null;
  enabled: boolean;
  sortOrder: number;
}

export default function AdminServicesPage() {
  const { user, loading: authLoading } = useAuth();
  const apiCall = useApiCall(user?.csrfToken);
  const [services, setServices] = useState<Service[]>([]);
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      window.location.href = '/dashboard';
      return;
    }
    fetchServices();
  }, [authLoading, user]);

  const fetchServices = async () => {
    const data = await apiCall('/api/services');
    if (data.ok) setServices(data.data);
  };

  const deleteService = async (id: string) => {
    if (!confirm('Delete this service?')) return;
    await apiCall(`/api/services/${id}`, { method: 'DELETE' });
    fetchServices();
  };

  const regenerateIcon = async (id: string) => {
    await apiCall('/api/icons/regenerate', {
      method: 'POST',
      body: JSON.stringify({ serviceId: id }),
    });
    fetchServices();
  };

  const aiSuggest = async (url: string) => {
    const data = await apiCall('/api/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return data.ok ? data.data : null;
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-portal-bg p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div>
              <h1 className="text-xl font-bold text-portal-text">Service Management</h1>
              <p className="text-xs text-portal-muted">{services.length} services configured</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/admin/backup?format=json"
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </a>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </button>
          </div>
        </div>

        {/* Service List */}
        <div className="space-y-2">
          {services.map((svc) => (
            <div
              key={svc.id}
              className="bg-portal-card border border-portal-border rounded-lg p-4 flex items-center gap-4 hover:border-portal-accent/20 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-portal-accent/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {svc.icon ? (
                  <img src={svc.icon} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-xs font-bold text-portal-accent">
                    {svc.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-portal-text">{svc.name}</div>
                <div className="text-xs text-portal-muted truncate">
                  {svc.section} · {svc.url}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {svc.requiresVPN && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    VPN
                  </span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-portal-border text-portal-muted">
                  {svc.type}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditing(svc)}
                  className="p-1.5 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => regenerateIcon(svc.id)}
                  className="p-1.5 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded transition-colors"
                  title="Regenerate icon"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteService(svc.id)}
                  className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit/Create Modal */}
      {(editing || creating) && (
        <ServiceEditorModal
          service={editing}
          csrfToken={user.csrfToken}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            fetchServices();
          }}
          onAiSuggest={aiSuggest}
        />
      )}
    </div>
  );
}

function ServiceEditorModal({
  service,
  csrfToken,
  onClose,
  onSaved,
  onAiSuggest,
}: {
  service: Service | null;
  csrfToken?: string;
  onClose: () => void;
  onSaved: () => void;
  onAiSuggest: (url: string) => Promise<Record<string, unknown> | null>;
}) {
  const [form, setForm] = useState({
    slug: service?.slug || '',
    name: service?.name || '',
    url: service?.url || '',
    type: service?.type || 'external',
    description: service?.description || '',
    tags: service?.tags?.join(', ') || '',
    section: service?.section || 'General',
    category: service?.category || 'Uncategorized',
    openMode: service?.openMode || 'new_tab',
    requiresVPN: service?.requiresVPN || false,
    statusCheckUrl: service?.statusCheckUrl || '',
    favoriteDefault: service?.favoriteDefault || false,
    credentialsHint: service?.credentialsHint || '',
    sortOrder: service?.sortOrder || 0,
  });
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const handleAiSuggest = async () => {
    if (!form.url) return;
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
    const body = {
      ...form,
      tags,
      slug: form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    };

    const url = service ? `/api/services/${service.id}` : '/api/services';
    const method = service ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
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
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-portal-border">
          <h3 className="text-sm font-semibold text-portal-text">
            {service ? 'Edit Service' : 'New Service'}
          </h3>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field
            label="URL"
            value={form.url}
            onChange={(v) => setForm({ ...form, url: v })}
            placeholder="https://..."
            required
            tooltip="The service URL. This is the main link used to access the service."
          />
          <button
            onClick={handleAiSuggest}
            disabled={suggesting || !form.url}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-accent/10 text-portal-accent rounded-lg hover:bg-portal-accent/20 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggesting ? 'AI analyzing...' : 'AI Suggest Fields'}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Slug"
              value={form.slug}
              onChange={(v) => setForm({ ...form, slug: v })}
              placeholder="my-service"
              tooltip="Unique identifier for URLs (e.g. my-service). Auto-generated if left empty."
            />
            <Field
              label="Name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              required
              tooltip="Display name as it will appear in the portal."
            />
          </div>
          <Field
            label="Description"
            value={form.description}
            onChange={(v) => setForm({ ...form, description: v })}
            tooltip="Short description shown on tile hover."
          />
          <Field
            label="Tags (comma-separated)"
            value={form.tags}
            onChange={(v) => setForm({ ...form, tags: v })}
            tooltip="Keywords for search (e.g. monitoring, devops, infra). Separate with commas."
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Section"
              value={form.section}
              onChange={(v) => setForm({ ...form, section: v })}
              required
              tooltip="Main group for organizing in the dashboard (e.g. Infrastructure, DevOps)."
            />
            <Field
              label="Category"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              tooltip="Sub-category for finer sorting within the section."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Type"
              value={form.type}
              options={['internal', 'external', 'github', 'email', 'remote', 'bookmark', 'tool', 'ai']}
              onChange={(v) => setForm({ ...form, type: v })}
              required
              tooltip="Service type: internal (self-hosted), external (third-party), github, email, remote (SSH), bookmark, tool, ai."
            />
            <SelectField
              label="Open Mode"
              value={form.openMode}
              options={['new_tab', 'iframe', 'modal', 'sidepanel']}
              onChange={(v) => setForm({ ...form, openMode: v })}
              tooltip="How to open: new_tab, iframe (embedded), modal (popup), sidepanel."
            />
          </div>
          <Field
            label="Status Check URL"
            value={form.statusCheckUrl}
            onChange={(v) => setForm({ ...form, statusCheckUrl: v })}
            placeholder="https://..."
            tooltip="URL to check if service is online. Leave empty to use main URL."
          />
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
          <Field
            label="Credentials Hint"
            value={form.credentialsHint}
            onChange={(v) => setForm({ ...form, credentialsHint: v })}
            tooltip="Credential hints (admin-only). NEVER store real passwords here."
          />
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

function Field({ label, value, onChange, placeholder, required, tooltip }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; tooltip?: string }) {
  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 text-[10px] font-medium text-portal-muted mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
        {tooltip && (
          <span className="group relative">
            <HelpCircle className="h-3 w-3 text-portal-muted hover:text-portal-accent cursor-help" />
            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block w-48 p-2 text-[10px] text-portal-text bg-portal-card border border-portal-border rounded-lg shadow-lg z-[9999] whitespace-normal">
              {tooltip}
            </span>
          </span>
        )}
      </label>
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

function SelectField({ label, value, options, onChange, required, tooltip }: { label: string; value: string; options: string[]; onChange: (v: string) => void; required?: boolean; tooltip?: string }) {
  return (
    <div className="relative">
      <label className="flex items-center gap-1.5 text-[10px] font-medium text-portal-muted mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
        {tooltip && (
          <span className="group relative">
            <HelpCircle className="h-3 w-3 text-portal-muted hover:text-portal-accent cursor-help" />
            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block w-48 p-2 text-[10px] text-portal-text bg-portal-card border border-portal-border rounded-lg shadow-lg z-[9999] whitespace-normal">
              {tooltip}
            </span>
          </span>
        )}
      </label>
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
