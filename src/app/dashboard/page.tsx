'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth, useServices, useFavorites, useStatuses } from '@/hooks/usePortal';
import { ServiceTile } from '@/components/dashboard/ServiceTile';
import { SearchBar } from '@/components/ui/SearchBar';
import { VpnBadge, VpnBanner } from '@/components/ui/VpnBadge';
import { WeatherWidget } from '@/components/widgets/WeatherWidget';
import { MarketsWidget } from '@/components/widgets/MarketsWidget';
import { UrgentInboxWidget } from '@/components/widgets/UrgentInboxWidget';
import { AiChatPanel } from '@/components/ai/AiChatPanel';
import { IframeModal } from '@/components/dashboard/IframeModal';
import type { ServiceData } from '@/hooks/usePortal';
import type { StatusColor } from '@/types';
import {
  LogOut,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { services, loading: svcLoading } = useServices();
  const { favoriteIds, toggleFavorite } = useFavorites(user?.csrfToken);
  const { statuses, vpnStatus } = useStatuses();
  const [activeSection, setActiveSection] = useState<string>('all');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [iframeModal, setIframeModal] = useState<{ url: string; title: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-portal-card border-r border-portal-border flex flex-col transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="p-4 border-b border-portal-border">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-portal-accent" />
            <span className="text-lg font-bold text-portal-text">LEPODER</span>
          </div>
          <div className="text-xs text-portal-muted mt-0.5">Personal Portal</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          <SidebarButton
            active={activeSection === 'all'}
            onClick={() => { setActiveSection('all'); setSidebarOpen(false); }}
            label="All Services"
          />
          <SidebarButton
            active={activeSection === 'favorites'}
            onClick={() => { setActiveSection('favorites'); setSidebarOpen(false); }}
            label="Favorites"
            icon={<Star className="h-3.5 w-3.5" />}
            badge={favorites.length || undefined}
          />

          <div className="px-3 pt-4 pb-1">
            <div className="text-[10px] font-semibold text-portal-muted uppercase tracking-wider">
              Sections
            </div>
          </div>
          {sections.map((section) => (
            <SidebarButton
              key={section}
              active={activeSection === section}
              onClick={() => { setActiveSection(section); setSidebarOpen(false); }}
              label={section}
              badge={services.filter((s) => s.section === section).length}
            />
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-portal-border p-3 space-y-1">
          {user.role === 'admin' && (
            <a
              href="/admin/services"
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-portal-accent bg-portal-accent/10 hover:bg-portal-accent/20 rounded-lg transition-colors border border-portal-accent/20"
            >
              <Settings className="h-3.5 w-3.5" />
              Gérer les services
            </a>
          )}
          <a
            href="/settings"
            className="flex items-center gap-2 px-3 py-2 text-xs text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover rounded-lg transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </a>
          <a
            href="/admin/reports"
            className="flex items-center gap-2 px-3 py-2 text-xs text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover rounded-lg transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Reports
          </a>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 text-portal-muted hover:text-portal-text"
            >
              <Menu className="h-5 w-5" />
            </button>

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
          {/* Dashboard content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <VpnBanner status={vpnStatus} />

            {/* Widgets Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <WeatherWidget />
              <MarketsWidget />
              <UrgentInboxWidget csrfToken={user.csrfToken} />
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
          {user.role === 'admin' && !showAiPanel && !showMcpPanel && (
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
          {showAiPanel && (
            <div className="w-80 xl:w-96 flex-shrink-0 animate-fade-in">
              <AiChatPanel csrfToken={user.csrfToken} onClose={() => setShowAiPanel(false)} />
            </div>
          )}

          {/* MCP Tools Panel */}
          {showMcpPanel && (
            <McpToolsPanel
              csrfToken={user.csrfToken}
              isAdmin={user.role === 'admin'}
              onClose={() => setShowMcpPanel(false)}
            />
          )}
        </div>
      </main>

      {/* Iframe Modal */}
      {iframeModal && (
        <IframeModal
          url={iframeModal.url}
          title={iframeModal.title}
          onClose={() => setIframeModal(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function SidebarButton({
  active,
  onClick,
  label,
  icon,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-xs transition-colors',
        active
          ? 'bg-portal-accent/10 text-portal-accent font-medium'
          : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] bg-portal-border px-1.5 py-0.5 rounded">{badge}</span>
      )}
    </button>
  );
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
