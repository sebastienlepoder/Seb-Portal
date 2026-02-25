'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  Shield,
  Wifi,
  WifiOff,
  Monitor,
  Smartphone,
  Server,
  RefreshCw,
  Globe,
  MapPin,
  Clock,
  ArrowUpDown,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Device {
  id: string;
  hostname: string;
  dnsName: string;
  os: string;
  ips: string[];
  online: boolean;
  lastSeen: string;
  isExitNode: boolean;
  isCurrentExitNode: boolean;
  isSelf: boolean;
  rxBytes: number;
  txBytes: number;
  tags?: string[];
}

interface TailscaleData {
  available: boolean;
  connected?: boolean;
  state?: string;
  version?: string;
  ips?: string[];
  hostname?: string;
  tailnet?: string;
  self?: Device;
  peers?: Device[];
  exitNode?: Device;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatLastSeen(dateStr: string): string {
  if (!dateStr || dateStr === '0001-01-01T00:00:00Z') return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getOsIcon(os: string) {
  const lower = os.toLowerCase();
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (lower.includes('android')) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (lower.includes('linux') || lower.includes('synology')) {
    return <Server className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

export default function TailscalePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<TailscaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingExitNode, setSettingExitNode] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tailscale?action=full');
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
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleSetExitNode = async (nodeId: string | null) => {
    if (!user || user.role !== 'admin') return;
    
    setSettingExitNode(nodeId || 'clear');
    try {
      const res = await fetch('/api/tailscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setExitNode', nodeId }),
      });
      const result = await res.json();
      if (result.ok) {
        await fetchData();
      } else {
        alert(result.error);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSettingExitNode(null);
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
  const exitNodes = data?.peers?.filter(p => p.isExitNode) || [];

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-portal-text">Tailscale</h1>
                <p className="text-sm text-portal-muted">
                  {data?.tailnet ? `${data.tailnet}` : 'Network management'}
                </p>
              </div>
            </div>
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

        <div className="p-6">
          {/* Not available */}
          {data && !data.available && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center">
              <WifiOff className="h-12 w-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-portal-text mb-2">Tailscale Not Available</h2>
              <p className="text-sm text-portal-muted mb-4">{data.message}</p>
              <code className="text-xs bg-portal-bg px-3 py-2 rounded block">
                Mount: /var/run/tailscale/tailscaled.sock
              </code>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Connected status */}
          {data?.available && (
            <>
              {/* Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Connection Status */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {data.connected ? (
                      <div className="p-2 bg-green-500/20 rounded-lg">
                        <Wifi className="h-5 w-5 text-green-400" />
                      </div>
                    ) : (
                      <div className="p-2 bg-red-500/20 rounded-lg">
                        <WifiOff className="h-5 w-5 text-red-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-portal-text">
                        {data.connected ? 'Connected' : data.state}
                      </p>
                      <p className="text-xs text-portal-muted">v{data.version}</p>
                    </div>
                  </div>
                  {data.ips && data.ips.length > 0 && (
                    <p className="text-xs text-portal-muted font-mono">{data.ips[0]}</p>
                  )}
                </div>

                {/* This Device */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Monitor className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-portal-text">{data.self?.hostname}</p>
                      <p className="text-xs text-portal-muted">{data.self?.os}</p>
                    </div>
                  </div>
                  <p className="text-xs text-portal-muted truncate">{data.self?.dnsName}</p>
                </div>

                {/* Exit Node */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      data.exitNode ? 'bg-purple-500/20' : 'bg-portal-bg'
                    )}>
                      <Globe className={cn(
                        'h-5 w-5',
                        data.exitNode ? 'text-purple-400' : 'text-portal-muted'
                      )} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-portal-text">
                        {data.exitNode ? 'Exit Node Active' : 'No Exit Node'}
                      </p>
                      {data.exitNode && (
                        <p className="text-xs text-portal-muted">{data.exitNode.hostname}</p>
                      )}
                    </div>
                  </div>
                  {data.exitNode && isAdmin && (
                    <button
                      onClick={() => handleSetExitNode(null)}
                      disabled={settingExitNode !== null}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      {settingExitNode === 'clear' ? 'Clearing...' : 'Clear exit node'}
                    </button>
                  )}
                </div>
              </div>

              {/* Devices List */}
              <div className="bg-portal-card border border-portal-border rounded-xl">
                <div className="px-4 py-3 border-b border-portal-border">
                  <h2 className="text-sm font-semibold text-portal-text">
                    Devices ({(data.peers?.length || 0) + 1})
                  </h2>
                </div>

                <div className="divide-y divide-portal-border">
                  {/* Self */}
                  {data.self && (
                    <DeviceRow device={data.self} isAdmin={isAdmin} />
                  )}

                  {/* Peers */}
                  {data.peers?.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      isAdmin={isAdmin}
                      onSetExitNode={
                        device.isExitNode && !device.isCurrentExitNode
                          ? () => handleSetExitNode(device.id)
                          : undefined
                      }
                      settingExitNode={settingExitNode === device.id}
                    />
                  ))}
                </div>
              </div>

              {/* Exit Nodes Section */}
              {exitNodes.length > 0 && isAdmin && (
                <div className="mt-6 bg-portal-card border border-portal-border rounded-xl">
                  <div className="px-4 py-3 border-b border-portal-border">
                    <h2 className="text-sm font-semibold text-portal-text">
                      Available Exit Nodes ({exitNodes.length})
                    </h2>
                  </div>
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {exitNodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => handleSetExitNode(node.id)}
                        disabled={node.isCurrentExitNode || settingExitNode !== null}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                          node.isCurrentExitNode
                            ? 'border-purple-500/50 bg-purple-500/10'
                            : 'border-portal-border hover:border-portal-accent/50 hover:bg-portal-bg'
                        )}
                      >
                        <div className={cn(
                          'p-2 rounded-lg',
                          node.online ? 'bg-green-500/20' : 'bg-gray-500/20'
                        )}>
                          <Globe className={cn(
                            'h-4 w-4',
                            node.online ? 'text-green-400' : 'text-gray-400'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-portal-text truncate">
                            {node.hostname}
                          </p>
                          <p className="text-xs text-portal-muted">{node.os}</p>
                        </div>
                        {node.isCurrentExitNode && (
                          <Check className="h-4 w-4 text-purple-400" />
                        )}
                        {settingExitNode === node.id && (
                          <RefreshCw className="h-4 w-4 text-portal-muted animate-spin" />
                        )}
                      </button>
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

function DeviceRow({
  device,
  isAdmin,
  onSetExitNode,
  settingExitNode,
}: {
  device: Device;
  isAdmin: boolean;
  onSetExitNode?: () => void;
  settingExitNode?: boolean;
}) {
  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-3',
      device.isSelf && 'bg-blue-500/5'
    )}>
      {/* Status indicator */}
      <div className={cn(
        'w-2 h-2 rounded-full',
        device.online ? 'bg-green-400' : 'bg-gray-500'
      )} />

      {/* Icon */}
      <div className="text-portal-muted">
        {getOsIcon(device.os)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-portal-text truncate">
            {device.hostname}
          </p>
          {device.isSelf && (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
              This device
            </span>
          )}
          {device.isCurrentExitNode && (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
              Exit node
            </span>
          )}
          {device.isExitNode && !device.isCurrentExitNode && (
            <span className="text-[10px] px-1.5 py-0.5 bg-portal-bg text-portal-muted rounded">
              Exit available
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-portal-muted">
          <span>{device.os}</span>
          <span className="font-mono">{device.ips[0]}</span>
          {device.tags && device.tags.length > 0 && (
            <span>{device.tags.join(', ')}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="hidden md:flex items-center gap-4 text-xs text-portal-muted">
        <div className="flex items-center gap-1" title="Last seen">
          <Clock className="h-3 w-3" />
          {formatLastSeen(device.lastSeen)}
        </div>
        <div className="flex items-center gap-1" title="Traffic">
          <ArrowUpDown className="h-3 w-3" />
          {formatBytes(device.rxBytes + device.txBytes)}
        </div>
      </div>

      {/* Actions */}
      {isAdmin && onSetExitNode && (
        <button
          onClick={onSetExitNode}
          disabled={settingExitNode}
          className="text-xs text-portal-accent hover:text-portal-accent-light"
        >
          {settingExitNode ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Use as exit'}
        </button>
      )}
    </div>
  );
}
