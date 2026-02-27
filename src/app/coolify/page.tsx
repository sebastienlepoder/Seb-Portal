'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  GitBranch,
  Server,
  Box,
  Database,
  Cloud,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Activity,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Application {
  uuid: string;
  name: string;
  description: string | null;
  fqdn: string;
  status: string;
  git_repository: string | null;
  git_branch: string | null;
  build_pack: string;
  updated_at: string;
}

interface Service {
  uuid: string;
  name: string;
  description: string | null;
  status: string;
}

interface DatabaseItem {
  uuid: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
}

interface ServerItem {
  uuid: string;
  name: string;
  description: string | null;
  ip: string;
  settings: {
    is_reachable: boolean;
    is_usable: boolean;
  };
}

interface Deployment {
  uuid: string;
  status: string;
  created_at: string;
  application_uuid?: string;
}

interface CoolifyData {
  available: boolean;
  applications: number;
  services: number;
  databases: number;
  servers: number;
  runningApps: number;
  applicationsList?: Application[];
  servicesList?: Service[];
  databasesList?: DatabaseItem[];
  serversList?: ServerItem[];
  message?: string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'Unknown';
  return new Date(dateStr).toLocaleString();
}

function getStatusColor(status: string): string {
  const lower = status?.toLowerCase() || '';
  if (lower.includes('running') || lower.includes('healthy')) return 'text-green-400';
  if (lower.includes('stopped') || lower.includes('exited')) return 'text-gray-400';
  if (lower.includes('error') || lower.includes('failed')) return 'text-red-400';
  if (lower.includes('starting') || lower.includes('building') || lower.includes('progress')) return 'text-yellow-400';
  return 'text-portal-muted';
}

function getStatusBg(status: string): string {
  const lower = status?.toLowerCase() || '';
  if (lower.includes('running') || lower.includes('healthy')) return 'bg-green-500/20';
  if (lower.includes('stopped') || lower.includes('exited')) return 'bg-gray-500/20';
  if (lower.includes('error') || lower.includes('failed')) return 'bg-red-500/20';
  if (lower.includes('starting') || lower.includes('building') || lower.includes('progress')) return 'bg-yellow-500/20';
  return 'bg-portal-bg';
}

export default function CoolifyPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<CoolifyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/coolify?action=full');
      const result = await res.json();
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const handleAppAction = async (uuid: string, action: 'restart' | 'stop' | 'start') => {
    if (!user || user.role !== 'admin') return;
    
    setActionLoading(`${uuid}-${action}`);
    try {
      const res = await fetch('/api/coolify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, uuid }),
      });
      const result = await res.json();
      if (result.ok) {
        // Refresh data after action
        setTimeout(fetchData, 2000);
      } else {
        alert(result.error);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setActionLoading(null);
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

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cloud className="h-6 w-6 text-purple-400" />
              <div>
                <h1 className="text-xl font-bold text-portal-text">VPS Servers</h1>
                <p className="text-sm text-portal-muted">Container & deployment management (Coolify)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={process.env.NEXT_PUBLIC_COOLIFY_URL || 'http://187.77.214.29:8000'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text bg-portal-bg border border-portal-border rounded-lg transition-colors"
              >
                Open Dashboard
                <ExternalLink className="h-3 w-3" />
              </a>
              <button
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Not available */}
          {data && !data.available && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center">
              <Cloud className="h-12 w-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-portal-text mb-2">Coolify Not Configured</h2>
              <p className="text-sm text-portal-muted">{data.message}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Dashboard */}
          {data?.available && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  icon={<Box className="h-5 w-5" />}
                  label="Applications"
                  value={data.applications}
                  subValue={`${data.runningApps} running`}
                  color="blue"
                />
                <StatCard
                  icon={<Activity className="h-5 w-5" />}
                  label="Services"
                  value={data.services}
                  color="purple"
                />
                <StatCard
                  icon={<Database className="h-5 w-5" />}
                  label="Databases"
                  value={data.databases}
                  color="green"
                />
                <StatCard
                  icon={<Server className="h-5 w-5" />}
                  label="Servers"
                  value={data.servers}
                  color="orange"
                />
              </div>

              {/* Applications List */}
              {data.applicationsList && data.applicationsList.length > 0 && (
                <div className="bg-portal-card border border-portal-border rounded-xl mb-6">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                      <Box className="h-4 w-4 text-blue-400" />
                      Applications ({data.applicationsList.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-portal-border">
                    {data.applicationsList.map((app) => (
                      <AppRow
                        key={app.uuid}
                        app={app}
                        isExpanded={expandedApp === app.uuid}
                        onToggle={() => setExpandedApp(expandedApp === app.uuid ? null : app.uuid)}
                        isAdmin={isAdmin}
                        onAction={(action) => handleAppAction(app.uuid, action)}
                        actionLoading={actionLoading}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Services List */}
              {data.servicesList && data.servicesList.length > 0 && (
                <div className="bg-portal-card border border-portal-border rounded-xl mb-6">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                      <Activity className="h-4 w-4 text-purple-400" />
                      Services ({data.servicesList.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-portal-border">
                    {data.servicesList.map((service) => (
                      <div key={service.uuid} className="flex items-center gap-4 px-4 py-3">
                        <div className={cn('w-2 h-2 rounded-full', getStatusBg(service.status))} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-portal-text">{service.name}</p>
                          {service.description && (
                            <p className="text-xs text-portal-muted">{service.description}</p>
                          )}
                        </div>
                        <span className={cn('text-xs', getStatusColor(service.status))}>
                          {service.status || 'Unknown'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Databases List */}
              {data.databasesList && data.databasesList.length > 0 && (
                <div className="bg-portal-card border border-portal-border rounded-xl mb-6">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-400" />
                      Databases ({data.databasesList.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-portal-border">
                    {data.databasesList.map((db) => (
                      <div key={db.uuid} className="flex items-center gap-4 px-4 py-3">
                        <div className={cn('w-2 h-2 rounded-full', getStatusBg(db.status))} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-portal-text">{db.name}</p>
                          <p className="text-xs text-portal-muted">{db.type}</p>
                        </div>
                        <span className={cn('text-xs', getStatusColor(db.status))}>
                          {db.status || 'Unknown'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Servers List */}
              {data.serversList && data.serversList.length > 0 && (
                <div className="bg-portal-card border border-portal-border rounded-xl">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h2 className="text-sm font-semibold text-portal-text flex items-center gap-2">
                      <Server className="h-4 w-4 text-orange-400" />
                      Servers ({data.serversList.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-portal-border">
                    {data.serversList.map((server) => (
                      <div key={server.uuid} className="flex items-center gap-4 px-4 py-3">
                        <div className={cn(
                          'w-2 h-2 rounded-full',
                          server.settings?.is_reachable ? 'bg-green-400' : 'bg-red-400'
                        )} />
                        <HardDrive className="h-4 w-4 text-portal-muted" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-portal-text">{server.name}</p>
                          <p className="text-xs text-portal-muted font-mono">{server.ip}</p>
                        </div>
                        <span className={cn(
                          'text-xs',
                          server.settings?.is_reachable ? 'text-green-400' : 'text-red-400'
                        )}>
                          {server.settings?.is_reachable ? 'Reachable' : 'Unreachable'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subValue,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subValue?: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
    green: 'bg-green-500/20 text-green-400',
    orange: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('p-2 rounded-lg', colors[color])}>
          {icon}
        </div>
        <span className="text-sm text-portal-muted">{label}</span>
      </div>
      <p className="text-2xl font-bold text-portal-text">{value}</p>
      {subValue && (
        <p className="text-xs text-portal-muted mt-1">{subValue}</p>
      )}
    </div>
  );
}

function AppRow({
  app,
  isExpanded,
  onToggle,
  isAdmin,
  onAction,
  actionLoading,
}: {
  app: Application;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onAction: (action: 'restart' | 'stop' | 'start') => void;
  actionLoading: string | null;
}) {
  const isRunning = app.status?.toLowerCase().includes('running');

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-portal-bg/50 transition-colors text-left"
      >
        <div className="text-portal-muted">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusBg(app.status))} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-portal-text truncate">{app.name}</p>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded',
              getStatusBg(app.status),
              getStatusColor(app.status)
            )}>
              {app.status || 'Unknown'}
            </span>
          </div>
          {app.fqdn && (
            <p className="text-xs text-portal-muted truncate">{app.fqdn}</p>
          )}
        </div>
        <div className="hidden md:block text-xs text-portal-muted">
          {app.build_pack}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 ml-8 border-t border-portal-border/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <DetailItem label="UUID" value={app.uuid} mono />
              <DetailItem label="Build Pack" value={app.build_pack} />
              {app.git_repository && (
                <div className="flex items-center gap-2">
                  <DetailItem label="Repository" value={app.git_repository} />
                  <a
                    href={app.git_repository}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 p-1.5 text-portal-muted hover:text-portal-text bg-portal-bg rounded transition-colors"
                    title="Open Repository"
                  >
                    <GitBranch className="h-4 w-4" />
                  </a>
                </div>
              )}
              {app.git_branch && (
                <DetailItem label="Branch" value={app.git_branch} />
              )}
            </div>
            <div className="space-y-2">
              {app.fqdn && (
                <DetailItem label="Domain" value={app.fqdn} link />
              )}
              <DetailItem label="Last Updated" value={formatDate(app.updated_at)} />
              {app.description && (
                <DetailItem label="Description" value={app.description} />
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 pt-4 border-t border-portal-border/50">
              <button
                onClick={(e) => { e.stopPropagation(); onAction('restart'); }}
                disabled={actionLoading === `${app.uuid}-restart`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors disabled:opacity-50"
              >
                {actionLoading === `${app.uuid}-restart` ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                Restart
              </button>
              {isRunning ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onAction('stop'); }}
                  disabled={actionLoading === `${app.uuid}-stop`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors disabled:opacity-50"
                >
                  {actionLoading === `${app.uuid}-stop` ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                  Stop
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAction('start'); }}
                  disabled={actionLoading === `${app.uuid}-start`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors disabled:opacity-50"
                >
                  {actionLoading === `${app.uuid}-start` ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Start
                </button>
              )}
              {app.fqdn && (
                <a
                  href={app.fqdn.startsWith('http') ? app.fqdn : `https://${app.fqdn}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-bg text-portal-muted hover:text-portal-text rounded transition-colors ml-auto"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Visit
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-portal-muted uppercase tracking-wide">{label}</p>
      {link ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-portal-accent hover:underline truncate block"
        >
          {value}
        </a>
      ) : (
        <p className={cn('text-sm text-portal-text truncate', mono && 'font-mono text-xs')}>
          {value}
        </p>
      )}
    </div>
  );
}
