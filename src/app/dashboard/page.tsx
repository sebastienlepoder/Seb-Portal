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
import { ActivityFeedWidget } from '@/components/widgets/ActivityFeedWidget';
import OneNoteWidget from '@/components/widgets/OneNoteWidget';
import OutlookWidget from '@/components/widgets/OutlookWidget';
import { IframeModal } from '@/components/dashboard/IframeModal';import { ServiceEditorModal } from '@/components/dashboard/ServiceEditorModal';
import MainSidebar from '@/components/layout/MainSidebar';
import type { ServiceData } from '@/hooks/usePortal';
import type { StatusColor, VpnStatus } from '@/types';
import {
  X,
  Star,
  ChevronDown,
  Mail,
  Wrench,
  Plus,
  Layers,
  Shield,
  ShieldOff,
  MoreVertical,
  ChevronRight,
  Sparkles,
  CheckSquare,
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
      window.dispatchEvent(new CustomEvent('aihub:open'));
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
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const userLabel = user.displayName || user.email;
  const userInitial = (userLabel || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/85 backdrop-blur-lg border-b border-portal-border">
          {/* Mobile: row 1 — title + status + overflow */}
          <div className="flex items-center gap-2 px-4 h-14 pl-14 sm:hidden">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-portal-muted leading-none">
                Dashboard
              </div>
              <div className="text-sm font-semibold text-portal-text truncate mt-0.5">
                {userLabel}
              </div>
            </div>
            <CompactVpnIndicator status={vpnStatus} />
            <MobileActionsMenu
              services={services}
              userLabel={userLabel}
              userInitial={userInitial}
              vpnStatus={vpnStatus}
              onOpenMcp={() => setShowMcpPanel(true)}
            />
          </div>

          {/* Mobile: row 2 — full-width search */}
          <div className="px-4 pb-3 sm:hidden">
            <SearchBar services={services} onSelect={openService} />
          </div>

          {/* Desktop: single bar */}
          <div className="hidden sm:flex items-center gap-3 px-4 py-3">
            <SearchBar services={services} onSelect={openService} />

            <div className="flex items-center gap-2 ml-auto">
              <VpnBadge status={vpnStatus} />
              <EmailDropdown services={services} />
              <button
                onClick={() => setShowMcpPanel(!showMcpPanel)}
                className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                title="MCP Tools"
                aria-label="MCP Tools"
              >
                <Wrench className="h-4 w-4" />
              </button>
              <div className="text-xs text-portal-muted truncate max-w-[180px]">
                {userLabel}
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
          <div
            className={cn(
              'flex-1 overflow-y-auto px-4 py-4 lg:px-6 lg:py-6',
              iframeModal && 'hidden'
            )}
          >
            <VpnBanner status={vpnStatus} />

            {/* Filter chips — horizontal scroll on mobile, wrap on desktop */}
            <div
              className={cn(
                'flex sm:flex-wrap items-center gap-2 mb-5 sm:mb-6',
                '-mx-4 px-4 sm:mx-0 sm:px-0',
                'overflow-x-auto sm:overflow-visible scrollbar-hide pb-1 sm:pb-0'
              )}
            >
              <FilterChip
                active={activeSection === 'all'}
                onClick={() => setActiveSection('all')}
                icon={<Layers className="h-3.5 w-3.5" />}
                label="All"
              />
              <FilterChip
                active={activeSection === 'favorites'}
                onClick={() => setActiveSection('favorites')}
                icon={<Star className="h-3.5 w-3.5" />}
                label="Favorites"
                count={favorites.length || undefined}
              />
              {sections.length > 0 && (
                <div className="h-5 w-px bg-portal-border mx-1 shrink-0" aria-hidden />
              )}
              {sections.map((s) => (
                <FilterChip
                  key={s}
                  active={activeSection === s}
                  onClick={() => setActiveSection(s)}
                  label={s}
                />
              ))}
            </div>

            {/* Widgets — stacked on mobile, 2-col tablet, 3-col desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-5 sm:mb-6">
              <WeatherWidget />
              <MarketsWidget />
              <UrgentInboxWidget csrfToken={user.csrfToken} />
              <ActivityFeedWidget />
              <OutlookWidget />
              <OneNoteWidget />
              <TailscaleWidget />
            </div>

            {/* Favorites Bar */}
            {activeSection === 'all' && favorites.length > 0 && (
              <div className="mb-5 sm:mb-6">
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
              <div key={section} className="mb-5 sm:mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-semibold text-portal-muted uppercase tracking-wider">
                    {section}
                  </h2>
                  {user.role === 'admin' && (
                    <a
                      href="/admin/services"
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-portal-accent hover:bg-portal-accent/10 rounded-md transition-colors duration-200 border border-portal-accent/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
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
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent min-h-[44px]"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un service
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Floating admin button — icon-only on mobile, labeled on desktop */}
          {user.role === 'admin' && !showMcpPanel && !iframeModal && (
            <a
              href="/admin/services"
              className={cn(
                'fixed z-30 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-full shadow-lg shadow-portal-accent/30 transition-all duration-200 hover:shadow-portal-accent/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent focus:ring-offset-2 focus:ring-offset-portal-bg',
                'bottom-5 right-5 h-14 w-14 flex items-center justify-center',
                'sm:bottom-6 sm:right-6 sm:h-auto sm:w-auto sm:px-4 sm:py-3 sm:gap-2 sm:rounded-full'
              )}
              title="Nouveau service"
              aria-label="Nouveau service"
            >
              <Plus className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline text-sm font-medium">Nouveau service</span>
            </a>
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

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
        active
          ? 'bg-portal-accent text-white'
          : 'bg-portal-card border border-portal-border text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
      )}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className="text-[10px] opacity-70">({count})</span>
      )}
    </button>
  );
}

/** Compact icon-only VPN indicator for the mobile header. */
function CompactVpnIndicator({ status }: { status: VpnStatus | null }) {
  if (!status) return null;
  const ok = status.connected;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-9 w-9 rounded-lg border',
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border-red-500/20'
      )}
      title={`Tailscale ${ok ? 'connected' : 'disconnected'}`}
      aria-label={`Tailscale ${ok ? 'connected' : 'disconnected'}`}
    >
      {ok ? <Shield className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
    </span>
  );
}

/** Bottom-sheet menu used in the mobile header to surface secondary actions
 * (email shortcuts, MCP tools, account info) without crowding the top bar. */
function MobileActionsMenu({
  services,
  userLabel,
  userInitial,
  vpnStatus,
  onOpenMcp,
}: {
  services: ServiceData[];
  userLabel: string;
  userInitial: string;
  vpnStatus: VpnStatus | null;
  onOpenMcp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const emailServices = services.filter((s) => s.type === 'email');

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-portal-muted hover:text-portal-text hover:bg-portal-card transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
        aria-label="More actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
            onClick={close}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Actions menu"
            className="fixed inset-x-0 bottom-0 z-50 bg-portal-card border-t border-portal-border rounded-t-2xl pb-[env(safe-area-inset-bottom)] animate-slide-up"
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <span className="h-1 w-10 rounded-full bg-portal-border" aria-hidden />
            </div>

            {/* Account header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-portal-border">
              <div className="h-10 w-10 rounded-full bg-portal-accent/15 border border-portal-accent/30 flex items-center justify-center text-portal-accent font-semibold">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-portal-text truncate">{userLabel}</div>
                <div className="text-[11px] text-portal-muted truncate flex items-center gap-1">
                  {vpnStatus?.connected ? (
                    <><Shield className="h-3 w-3 text-emerald-400" /> Tailscale connected</>
                  ) : vpnStatus ? (
                    <><ShieldOff className="h-3 w-3 text-red-400" /> Tailscale offline</>
                  ) : (
                    'Signed in'
                  )}
                </div>
              </div>
              <button
                onClick={close}
                className="p-2 -mr-1 text-portal-muted hover:text-portal-text rounded-md transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Email shortcuts */}
            {emailServices.length > 0 && (
              <div className="px-2 py-2 border-b border-portal-border">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-portal-muted">
                  Email
                </div>
                {emailServices.map((svc) => (
                  <a
                    key={svc.id}
                    href={svc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-portal-text hover:bg-portal-card-hover transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent min-h-[44px]"
                  >
                    <Mail className="h-4 w-4 text-portal-accent shrink-0" />
                    <span className="flex-1 truncate">{svc.name}</span>
                    <ChevronRight className="h-4 w-4 text-portal-muted shrink-0" />
                  </a>
                ))}
              </div>
            )}

            {/* Tools */}
            <div className="px-2 py-2">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-portal-muted">
                Tools
              </div>
              <button
                onClick={() => {
                  close();
                  window.dispatchEvent(new CustomEvent('quicktodo:open'));
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-portal-text hover:bg-portal-card-hover transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent min-h-[44px]"
              >
                <CheckSquare className="h-4 w-4 text-portal-accent shrink-0" />
                <span className="flex-1 text-left">Quick Todo</span>
                <ChevronRight className="h-4 w-4 text-portal-muted shrink-0" />
              </button>
              <button
                onClick={() => {
                  close();
                  window.dispatchEvent(new CustomEvent('aihub:open'));
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-portal-text hover:bg-portal-card-hover transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent min-h-[44px]"
              >
                <Sparkles className="h-4 w-4 text-portal-accent shrink-0" />
                <span className="flex-1 text-left">AI Hub</span>
                <ChevronRight className="h-4 w-4 text-portal-muted shrink-0" />
              </button>
              <button
                onClick={() => {
                  close();
                  onOpenMcp();
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-portal-text hover:bg-portal-card-hover transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent min-h-[44px]"
              >
                <Wrench className="h-4 w-4 text-portal-accent shrink-0" />
                <span className="flex-1 text-left">MCP Tools</span>
                <ChevronRight className="h-4 w-4 text-portal-muted shrink-0" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
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
        className="flex items-center gap-1 p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card rounded-lg transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
        aria-label="Email services"
        aria-expanded={open}
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
              className="block px-3 py-2 text-xs text-portal-text hover:bg-portal-card-hover transition-colors duration-200"
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
