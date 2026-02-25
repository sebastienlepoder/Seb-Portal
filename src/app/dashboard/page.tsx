'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth, useServices, useFavorites, useStatuses, useApiCall } from '@/hooks/usePortal';
import { ServiceTile } from '@/components/dashboard/ServiceTile';
import { SearchBar } from '@/components/ui/SearchBar';
import { VpnBadge, VpnBanner } from '@/components/ui/VpnBadge';
import { WeatherWidget } from '@/components/widgets/WeatherWidget';
import { TailscaleWidget } from '@/components/widgets/TailscaleWidget';
import { MarketsWidget } from '@/components/widgets/MarketsWidget';
import { UrgentInboxWidget } from '@/components/widgets/UrgentInboxWidget';
import OneNoteWidget from '@/components/widgets/OneNoteWidget';
import OutlookWidget from '@/components/widgets/OutlookWidget';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { IframeModal } from '@/components/dashboard/IframeModal';
import MainSidebar from '@/components/layout/MainSidebar';
import type { ServiceData } from '@/hooks/usePortal';
import type { StatusColor } from '@/types';
import {
  Settings,
  BarChart3,
  Sparkles,
  Shield,
  Menu,
  X,
  Star,
  ChevronDown,
  Mail,
  Wrench,
  Plus,
  Save,
  Brain,
  Calculator,
  TrendingUp,
  Briefcase,
  Terminal,
  Home,
  Heart,
  Globe,
  Layers,
  Database,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { services, loading: svcLoading, refetch: refetchServices } = useServices();
  const { favoriteIds, toggleFavorite } = useFavorites(user?.csrfToken);
  const { statuses, vpnStatus } = useStatuses();
  const apiCall = useApiCall(user?.csrfToken);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [editingService, setEditingService] = useState<ServiceData | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [iframeModal, setIframeModal] = useState<{ url: string; title: string } | null>(null);
  const [showMcpPanel, setShowMcpPanel] = useState(false);

  // Redirect to login
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  // Compute sections
  const sections = useMemo(() => {
    const sectionSet = new Set<string>();
    services.forEach((s) => sectionSet.add(s.section));
    return Array.from(sectionSet);
  }, [services]);

  // Filter services
  const filtered = useMemo(() => {
    if (activeSection === 'all') return services;
    if (activeSection === 'favorites') return services.filter((s) => favoriteIds.has(s.id));
    return services.filter((s) => s.section === activeSection);
  }, [services, activeSection, favoriteIds]);

  // Group by section for "all" view
  const groupedBySection = useMemo(() => {
    const map = new Map<string, ServiceData[]>();
    filtered.forEach((s) => {
      const section = activeSection === 'all' || activeSection === 'favorites' ? s.section : s.category;
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(s);
    });
    return map;
  }, [filtered, activeSection]);

  const favorites = useMemo(
    () => services.filter((s) => favoriteIds.has(s.id)),
    [services, favoriteIds]
  );

  const openService = (service: ServiceData) => {
    // Record click
    fetch(`/api/services/${service.id}`, { method: 'POST' }).catch(() => {});

    if (service.openMode === 'iframe' || service.openMode === 'modal') {
      setIframeModal({ url: service.url, title: service.name });
    } else if (service.openMode === 'sidepanel') {
      setShowAiPanel(true);
    } else {
      window.open(service.url, '_blank');
    }
  };

  const handleDelete = async (svcId: string) => {
    if (!confirm('Supprimer ce service ?')) return;
    await apiCall(`/api/services/${svcId}`, { method: 'DELETE' });
    refetchServices();
  };

  const handleRegenerateIcon = async (svcId: string) => {
    await apiCall('/api/icons/regenerate', {
      method: 'POST',
      body: JSON.stringify({ serviceId: svcId }),
    });
    refetchServices();
  };

  const handleAiSuggest = async (url: string) => {
    const data = await apiCall('/api/ai/suggest', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return data.ok ? data.data : null;
  };

  if (authLoading || svcLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar
        user={user}
        onLogout={logout}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        sections={sections}
        favoritesCount={favorites.length}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <SearchBar services={services} onSelect={openService} />

            <div className="flex items-center gap-2 ml-auto">
              <VpnBadge status={vpnStatus} />

              {/* Email quick access */}
              <EmailDropdown services={services} />

              {/* MCP Tools */}
              <button
                onClick={() => setShowMcpPanel(!showMcpPanel)}
                className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"
                title="MCP Tools"
              >
                <Wrench className="h-4 w-4" />
              </button>

              {/* AI toggle */}
              <button
                onClick={() => setShowAiPanel(!showAiPanel)}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  showAiPanel
                    ? 'bg-portal-accent/10 text-portal-accent'
                    : 'text-portal-muted hover:text-portal-text hover:bg-portal-card'
                )}
                title="AI Hub"
              >
                <Sparkles className="h-4 w-4" />
              </button>

              {/* User */}
              <div className="text-xs text-portal-muted">
                {user.displayName || user.email}
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* Inline iframe — replaces the grid when active, sidebar stays visible */}
          {iframeModal && (
            <IframeModal
              url={iframeModal.url}
              title={iframeModal.title}
              onClose={() => setIframeModal(null)}
              inline
            />
          )}

          {/* Dashboard content — hidden while iframe is open */}
          <div className={cn('flex-1 overflow-y-auto p-4 lg:p-6', iframeModal && 'hidden')}>
            <VpnBanner status={vpnStatus} />

            {/* Widgets Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <WeatherWidget />
              <MarketsWidget />
              <UrgentInboxWidget csrfToken={user.csrfToken} />
              <OutlookWidget />
              <OneNoteWidget />
              <TailscaleWidget />
            </div>

            {/* Favorites Bar */}
            {activeSection === 'all' && favorites.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-portal-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-amber-400" />
                  Favorites
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {favorites.map((svc) => (
                    <ServiceTile
                      key={svc.id}
                      service={svc}
                      status={(statuses[svc.id] as StatusColor) || 'gray'}
                      isFavorite={true}
                      isAdmin={user.role === 'admin'}
                      vpnConnected={vpnStatus?.connected ?? true}
                      csrfToken={user.csrfToken}
                      onToggleFavorite={() => toggleFavorite(svc.id)}
                      onOpenService={() => openService(svc)}
                      onEdit={() => setEditingService(svc)}
                      onDelete={() => handleDelete(svc.id)}
                      onRegenerateIcon={() => handleRegenerateIcon(svc.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Services Grid */}
            {Array.from(groupedBySection.entries()).map(([section, svcs]) => (
              <div key={section} className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-portal-muted uppercase tracking-wider">
                    {section}
                  </h2>
                  {user.role === 'admin' && (
                    <a
                      href="/admin/services"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-portal-accent hover:bg-portal-accent/10 rounded-md transition-colors border border-portal-accent/20"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {svcs.map((svc) => (
                    <ServiceTile
                      key={svc.id}
                      service={svc}
                      status={(statuses[svc.id] as StatusColor) || 'gray'}
                      isFavorite={favoriteIds.has(svc.id)}
                      isAdmin={user.role === 'admin'}
                      vpnConnected={vpnStatus?.connected ?? true}
                      csrfToken={user.csrfToken}
                      onToggleFavorite={() => toggleFavorite(svc.id)}
                      onOpenService={() => openService(svc)}
                      onEdit={() => setEditingService(svc)}
                      onDelete={() => handleDelete(svc.id)}
                      onRegenerateIcon={() => handleRegenerateIcon(svc.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-portal-muted">
                <p className="text-lg">Aucun service trouvé</p>
                {user.role === 'admin' && (
                  <a
                    href="/admin/services"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un service
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Floating admin button */}
          {user.role === 'admin' && !showAiPanel && !showMcpPanel && !iframeModal && (
            <a
              href="/admin/services"
              className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-full shadow-lg shadow-portal-accent/20 transition-all hover:shadow-portal-accent/40 z-30"
              title="Gérer les services"
            >
              <Plus className="h-5 w-5" />
              <span className="text-sm font-medium">Nouveau service</span>
            </a>
          )}

          {/* AI Side Panel */}
          {showAiPanel && !iframeModal && (
            <div className="w-80 xl:w-96 flex-shrink-0 animate-fade-in">
              <AiChatPanel csrfToken={user.csrfToken} onClose={() => setShowAiPanel(false)} />
            </div>
          )}

          {/* MCP Tools Panel */}
          {showMcpPanel && !iframeModal && (
            <McpToolsPanel
              csrfToken={user.csrfToken}
              isAdmin={user.role === 'admin'}
              onClose={() => setShowMcpPanel(false)}
            />
          )}
        </div>
      </main>

      {/* Service Editor Modal */}
      {editingService && (
        <ServiceEditorModal
          service={editingService}
          csrfToken={user.csrfToken}
          onClose={() => setEditingService(null)}
          onSaved={() => { setEditingService(null); refetchServices(); }}
          onAiSuggest={handleAiSuggest}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

/** Maps section names (case-insensitive keywords) to a Lucide icon. */
function getSectionIcon(section: string): React.ReactNode {
  const s = section.toLowerCase();
  if (/\bai\b|ml\b|intelligence|gpt|llm/.test(s)) return <Brain className="h-3.5 w-3.5" />;
  if (/account|compt|finance|fiscal|budget/.test(s)) return <Calculator className="h-3.5 w-3.5" />;
  if (/bank|market|invest|trading|bourse/.test(s)) return <TrendingUp className="h-3.5 w-3.5" />;
  if (/business|work|projet|company/.test(s)) return <Briefcase className="h-3.5 w-3.5" />;
  if (/dev|infra|code|tech|git|server/.test(s)) return <Terminal className="h-3.5 w-3.5" />;
  if (/email|mail|message/.test(s)) return <Mail className="h-3.5 w-3.5" />;
  if (/home|maison|domotique|automat/.test(s)) return <Home className="h-3.5 w-3.5" />;
  if (/loisir|personal|perso|media|music|sport/.test(s)) return <Heart className="h-3.5 w-3.5" />;
  if (/remote|access|vpn|network|tunnel/.test(s)) return <Globe className="h-3.5 w-3.5" />;
  if (/storage|backup|nas|data/.test(s)) return <Database className="h-3.5 w-3.5" />;
  if (/monitor|status|alert|uptime/.test(s)) return <Activity className="h-3.5 w-3.5" />;
  return <Layers className="h-3.5 w-3.5" />;
}

function EmailDropdown({ services }: { services: ServiceData[] }) {
  const [open, setOpen] = useState(false);
  const emailServices = services.filter((s) => s.type === 'email');

  if (emailServices.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors"
      >
        <Mail className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-portal-card border border-portal-border rounded-lg shadow-xl z-50 py-1 animate-fade-in">
          {emailServices.map((svc) => (
            <a
              key={svc.id}
              href={svc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-xs text-portal-text hover:bg-portal-card-hover transition-colors"
              onClick={() => setOpen(false)}
            >
              {svc.name}
            </a>
          ))}
        </div>
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
  service: ServiceData;
  csrfToken?: string;
  onClose: () => void;
  onSaved: () => void;
  onAiSuggest: (url: string) => Promise<Record<string, unknown> | null>;
}) {
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
      <div className="bg-portal-card border border-portal-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-portal-border">
          <h3 className="text-sm font-semibold text-portal-text">Edit Service</h3>
          <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <EditorField label="URL" value={form.url} onChange={(v) => setForm({ ...form, url: v })} placeholder="https://..." />
          <button
            onClick={handleAiSuggestClick}
            disabled={suggesting || !form.url}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-accent/10 text-portal-accent rounded-lg hover:bg-portal-accent/20 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {suggesting ? 'AI analyse...' : 'AI Suggest Fields'}
          </button>
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

function McpToolsPanel({
  csrfToken,
  isAdmin,
  onClose,
}: {
  csrfToken?: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<{ name: string; description: string; inputSchema: Record<string, unknown> }[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/mcp/tools')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setTools(data.data);
      })
      .catch(() => {});
  }, []);

  const executeTool = async () => {
    if (!selectedTool) return;
    setLoading(true);
    setResult(null);

    const input: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(inputValues)) {
      try {
        input[key] = JSON.parse(value);
      } catch {
        input[key] = value;
      }
    }

    try {
      const res = await fetch('/api/mcp/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({ toolName: selectedTool, input }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data.ok ? data.data : data, null, 2));
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const tool = tools.find((t) => t.name === selectedTool);
  const properties = (tool?.inputSchema as { properties?: Record<string, { type?: string; description?: string }> })?.properties || {};

  return (
    <div className="w-80 xl:w-96 flex-shrink-0 bg-portal-bg border-l border-portal-border flex flex-col animate-fade-in">
      <div className="flex items-center justify-between p-3 border-b border-portal-border">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-portal-accent" />
          <span className="text-sm font-semibold text-portal-text">MCP Tools</span>
        </div>
        <button onClick={onClose} className="p-1 text-portal-muted hover:text-portal-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tools.map((t) => (
          <button
            key={t.name}
            onClick={() => {
              setSelectedTool(t.name);
              setInputValues({});
              setResult(null);
            }}
            className={cn(
              'w-full text-left p-3 rounded-lg border text-xs transition-colors',
              selectedTool === t.name
                ? 'border-portal-accent/30 bg-portal-accent/5'
                : 'border-portal-border hover:border-portal-accent/20'
            )}
          >
            <div className="font-mono font-medium text-portal-text">{t.name}</div>
            <div className="text-portal-muted mt-0.5">{t.description}</div>
          </button>
        ))}

        {tool && (
          <div className="space-y-2 pt-3 border-t border-portal-border">
            {Object.entries(properties).map(([key, schema]) => (
              <div key={key}>
                <label className="text-[10px] text-portal-muted">{key}: {schema.description}</label>
                <input
                  type="text"
                  value={inputValues[key] || ''}
                  onChange={(e) => setInputValues({ ...inputValues, [key]: e.target.value })}
                  className="w-full bg-portal-card border border-portal-border rounded px-2 py-1 text-xs text-portal-text"
                  placeholder={schema.type}
                />
              </div>
            ))}
            <button
              onClick={executeTool}
              disabled={loading}
              className="w-full py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Executing...' : 'Execute'}
            </button>
          </div>
        )}

        {result && (
          <pre className="bg-portal-card border border-portal-border rounded-lg p-3 text-xs text-portal-text font-mono overflow-x-auto whitespace-pre-wrap">
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}
