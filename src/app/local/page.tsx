'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAuth, useServices, useFavorites, useStatuses } from '@/hooks/usePortal';
import { ServiceTile } from '@/components/dashboard/ServiceTile';
import { VpnBanner } from '@/components/ui/VpnBadge';
import { IframeModal } from '@/components/dashboard/IframeModal';
import MainSidebar from '@/components/layout/MainSidebar';
import type { ServiceData } from '@/hooks/usePortal';
import {
  HardDrive,
  RefreshCw,
  Wifi,
  WifiOff,
  Shield,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOCAL_HOST_PATTERNS = [
  /\.local(?::|\/|$)/i,
  /(?:^|\/\/)(?:localhost|127\.0\.0\.1)(?::|\/|$)/i,
  /(?:^|\/\/)(?:10\.\d+\.\d+\.\d+)(?::|\/|$)/,
  /(?:^|\/\/)(?:192\.168\.\d+\.\d+)(?::|\/|$)/,
  /(?:^|\/\/)(?:172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)(?::|\/|$)/,
  // Tailscale 100.x.y.z (CGNAT range used by Tailscale)
  /(?:^|\/\/)(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)(?::|\/|$)/,
];

function isLocalUrl(url: string): boolean {
  return LOCAL_HOST_PATTERNS.some((re) => re.test(url));
}

function isLocalService(service: ServiceData): boolean {
  return service.requiresVPN || service.type === 'internal' || isLocalUrl(service.url);
}

function getHostname(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function LocalServicesPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const { services, loading: svcLoading, refetch: refetchServices } = useServices();
  const { favoriteIds, toggleFavorite } = useFavorites(user?.csrfToken);
  const { statuses, vpnStatus, refetch: refetchStatuses } = useStatuses();
  const [search, setSearch] = useState('');
  const [iframeModal, setIframeModal] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  const localServices = useMemo(
    () => services.filter(isLocalService),
    [services]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localServices;
    return localServices.filter((s) => {
      const haystack = [
        s.name,
        s.description ?? '',
        s.url,
        s.category,
        s.section,
        ...(s.tags || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [localServices, search]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ServiceData[]>();
    filtered.forEach((s) => {
      const key = s.category || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    // Sort each group by sortOrder, then name
    map.forEach((arr) => {
      arr.sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
      );
    });
    // Sort categories alphabetically with a sensible bias for infrastructure first
    return new Map(
      [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
  }, [filtered]);

  const stats = useMemo(() => {
    const total = localServices.length;
    const vpnRequired = localServices.filter((s) => s.requiresVPN).length;
    const online = localServices.filter((s) => statuses[s.id] === 'green').length;
    const offline = localServices.filter((s) => statuses[s.id] === 'red').length;
    return { total, vpnRequired, online, offline };
  }, [localServices, statuses]);

  const openService = (service: ServiceData) => {
    fetch(`/api/services/${service.id}`, { method: 'POST' }).catch(() => {});

    if (service.openMode === 'iframe' || service.openMode === 'modal') {
      setIframeModal({ url: service.url, title: service.name });
    } else {
      window.open(service.url, '_blank');
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const vpnConnected = vpnStatus?.connected ?? false;

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 pl-12 sm:pl-0 min-w-0">
              <HardDrive className="h-6 w-6 text-emerald-400" />
              <div>
                <h1 className="text-xl font-bold text-portal-text">Local Services</h1>
                <p className="text-sm text-portal-muted">
                  Devices and services on your local network (Synology, D-Backup, NAS, IoT…)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border',
                  vpnConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                )}
              >
                {vpnConnected ? (
                  <Wifi className="h-3.5 w-3.5" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5" />
                )}
                {vpnConnected ? 'VPN connected' : 'VPN offline'}
              </span>
              <button
                onClick={() => {
                  refetchServices();
                  refetchStatuses();
                }}
                disabled={svcLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
              >
                <RefreshCw className={cn('h-4 w-4', svcLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* VPN warning */}
          {!vpnConnected && stats.vpnRequired > 0 && vpnStatus && (
            <VpnBanner status={vpnStatus} />
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<HardDrive className="h-5 w-5" />}
              label="Local services"
              value={stats.total}
              color="emerald"
            />
            <StatCard
              icon={<Shield className="h-5 w-5" />}
              label="VPN required"
              value={stats.vpnRequired}
              color="blue"
            />
            <StatCard
              icon={<Wifi className="h-5 w-5" />}
              label="Online"
              value={stats.online}
              color="green"
            />
            <StatCard
              icon={<WifiOff className="h-5 w-5" />}
              label="Offline"
              value={stats.offline}
              color="red"
            />
          </div>

          {/* Inline filter */}
          <div className="mb-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter local services (Synology, D-Backup, Pi-hole…)"
              className="w-full bg-portal-card border border-portal-border rounded-lg pl-10 pr-10 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50 focus:ring-1 focus:ring-portal-accent/30 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-portal-muted hover:text-portal-text"
                aria-label="Clear filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Loading */}
          {svcLoading && localServices.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              hasServices={localServices.length > 0}
              isAdmin={isAdmin}
              search={search}
            />
          ) : (
            <div className="space-y-8">
              {[...groupedByCategory.entries()].map(([category, items]) => (
                <section key={category}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-portal-text uppercase tracking-wide">
                      {category}
                    </h2>
                    <span className="text-xs text-portal-muted">
                      {items.length} {items.length === 1 ? 'service' : 'services'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map((service) => (
                      <div key={service.id} className="relative">
                        <ServiceTile
                          service={service}
                          status={statuses[service.id] || 'gray'}
                          isFavorite={favoriteIds.has(service.id)}
                          isAdmin={isAdmin}
                          vpnConnected={vpnConnected}
                          csrfToken={user.csrfToken}
                          onToggleFavorite={() => toggleFavorite(service.id)}
                          onOpenService={() => openService(service)}
                        />
                        <p className="mt-1 px-1 text-[10px] font-mono text-portal-muted truncate">
                          {getHostname(service.url)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

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

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'emerald' | 'blue' | 'green' | 'red';
}) {
  const colors = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    red: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('p-2 rounded-lg', colors[color])}>{icon}</div>
        <span className="text-sm text-portal-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-portal-text">{value}</p>
    </div>
  );
}

function EmptyState({
  hasServices,
  isAdmin,
  search,
}: {
  hasServices: boolean;
  isAdmin: boolean;
  search: string;
}) {
  if (search) {
    return (
      <div className="text-center py-16">
        <HardDrive className="h-12 w-12 text-portal-muted mx-auto mb-4" />
        <p className="text-portal-text font-medium">No matching local services</p>
        <p className="text-sm text-portal-muted mt-1">
          Try a different search term.
        </p>
      </div>
    );
  }

  if (!hasServices) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <HardDrive className="h-12 w-12 text-portal-muted mx-auto mb-4" />
        <p className="text-portal-text font-medium mb-2">No local services yet</p>
        <p className="text-sm text-portal-muted mb-6">
          Local services are anything on your home network: Synology, D-Backup,
          Pi-hole, your router, Home Assistant… Add them via the admin panel,
          and they will appear here automatically when they require VPN or use a
          local/private hostname.
        </p>
        {isAdmin && (
          <a
            href="/admin/services"
            className="inline-flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Manage services
          </a>
        )}
      </div>
    );
  }

  return null;
}
