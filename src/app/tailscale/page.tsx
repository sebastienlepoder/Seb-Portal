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
  Clock,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Tag,
  Network,
  Cpu,
  Calendar,
  Activity,
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
  connectionMode?: string;
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

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === '0001-01-01T00:00:00Z') return 'Unknown';
  return new Date(dateStr).toLocaleString();
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

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

export default function TailscalePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [data, setData] = useState<TailscaleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingExitNode, setSettingExitNode] = useState<string | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

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

  const toggleDevice = (deviceId: string) => {
    setExpandedDevice(expandedDevice === deviceId ? null : deviceId);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdmin = user.role === 'admin';
  const allDevices = data ? [data.self, ...(data.peers || [])].filter(Boolean) as Device[] : [];

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="border-b border-portal-border bg-portal-card px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 pl-12 sm:pl-0">
              <Shield className="h-6 w-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-portal-text">Tailscale</h1>
                <p className="text-sm text-portal-muted">
                  {data?.tailnet ? data.tailnet : 'Network management'}
                  {data?.connectionMode && (
                    <span className="ml-2 text-xs bg-portal-bg px-2 py-0.5 rounded">
                      {data.connectionMode} mode
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="sm:ml-auto flex items-center gap-2 px-3 py-1.5 text-sm text-portal-muted hover:text-portal-text hover:bg-portal-bg rounded-lg transition-colors"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* Not available */}
          {data && !data.available && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center">
              <WifiOff className="h-12 w-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-portal-text mb-2">Tailscale Not Available</h2>
              <p className="text-sm text-portal-muted mb-4">{data.message}</p>
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

                {/* Tailnet */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Network className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-portal-text">Tailnet</p>
                      <p className="text-xs text-portal-muted">{data.tailnet}</p>
                    </div>
                  </div>
                  <p className="text-xs text-portal-muted">{allDevices.length} devices</p>
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

              {/* Devices List - Accordion Style */}
              <div className="bg-portal-card border border-portal-border rounded-xl">
                <div className="px-4 py-3 border-b border-portal-border">
                  <h2 className="text-sm font-semibold text-portal-text">
                    Devices ({allDevices.length})
                  </h2>
                </div>

                <div className="divide-y divide-portal-border">
                  {allDevices.map((device) => (
                    <DeviceAccordion
                      key={device.id}
                      device={device}
                      isExpanded={expandedDevice === device.id}
                      onToggle={() => toggleDevice(device.id)}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceAccordion({
  device,
  isExpanded,
  onToggle,
  isAdmin,
  onSetExitNode,
  settingExitNode,
}: {
  device: Device;
  isExpanded: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  onSetExitNode?: () => void;
  settingExitNode?: boolean;
}) {
  return (
    <div className={cn(device.isSelf && 'bg-blue-500/5')}>
      {/* Header Row - Clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-portal-bg/50 transition-colors text-left"
      >
        {/* Expand/Collapse Icon */}
        <div className="text-portal-muted">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        {/* Status indicator */}
        <div className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          device.online ? 'bg-green-400' : 'bg-gray-500'
        )} />

        {/* Icon */}
        <div className="text-portal-muted flex-shrink-0">
          {getOsIcon(device.os)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-portal-text truncate">
              {device.hostname}
            </p>
            {device.isSelf && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded flex-shrink-0">
                This device
              </span>
            )}
            {device.isCurrentExitNode && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded flex-shrink-0">
                Exit node
              </span>
            )}
            {device.isExitNode && !device.isCurrentExitNode && (
              <span className="text-[10px] px-1.5 py-0.5 bg-portal-bg text-portal-muted rounded flex-shrink-0">
                Exit available
              </span>
            )}
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded flex-shrink-0',
              device.online ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
            )}>
              {device.online ? 'Online' : 'Offline'}
            </span>
          </div>
          <p className="text-xs text-portal-muted truncate">{device.os}</p>
        </div>

        {/* Quick Stats */}
        <div className="hidden md:flex items-center gap-4 text-xs text-portal-muted flex-shrink-0">
          <span className="font-mono">{device.ips?.[0]}</span>
          <span>{formatLastSeen(device.lastSeen)}</span>
        </div>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 ml-8 border-t border-portal-border/50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-portal-muted uppercase tracking-wide">
                Device Info
              </h4>
              
              <DetailRow
                icon={<Monitor className="h-3.5 w-3.5" />}
                label="Hostname"
                value={device.hostname}
                copyable
              />
              
              <DetailRow
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="Operating System"
                value={device.os}
              />
              
              <DetailRow
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Status"
                value={device.online ? 'Online' : 'Offline'}
                valueClass={device.online ? 'text-green-400' : 'text-gray-400'}
              />
              
              <DetailRow
                icon={<Tag className="h-3.5 w-3.5" />}
                label="Device ID"
                value={device.id || 'N/A'}
                copyable
                mono
              />
            </div>

            {/* Network Info */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-portal-muted uppercase tracking-wide">
                Network
              </h4>
              
              <DetailRow
                icon={<Network className="h-3.5 w-3.5" />}
                label="DNS Name"
                value={device.dnsName || 'N/A'}
                copyable
                mono
              />
              
              {device.ips?.map((ip, i) => (
                <DetailRow
                  key={i}
                  icon={<Globe className="h-3.5 w-3.5" />}
                  label={i === 0 ? 'IPv4' : 'IPv6'}
                  value={ip}
                  copyable
                  mono
                />
              ))}
              
              {device.tags && device.tags.length > 0 && (
                <DetailRow
                  icon={<Tag className="h-3.5 w-3.5" />}
                  label="Tags"
                  value={device.tags.join(', ')}
                />
              )}
            </div>

            {/* Stats & Timing */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-portal-muted uppercase tracking-wide">
                Activity
              </h4>
              
              <DetailRow
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Last Seen"
                value={formatDate(device.lastSeen)}
              />
              
              <DetailRow
                icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                label="Data Received"
                value={formatBytes(device.rxBytes || 0)}
              />
              
              <DetailRow
                icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                label="Data Sent"
                value={formatBytes(device.txBytes || 0)}
              />
              
              <DetailRow
                icon={<ArrowUpDown className="h-3.5 w-3.5" />}
                label="Total Traffic"
                value={formatBytes((device.rxBytes || 0) + (device.txBytes || 0))}
              />
            </div>
          </div>

          {/* Actions */}
          {isAdmin && onSetExitNode && (
            <div className="mt-4 pt-4 border-t border-portal-border/50">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetExitNode();
                }}
                disabled={settingExitNode}
                className="px-4 py-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg text-sm transition-colors"
              >
                {settingExitNode ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Setting exit node...
                  </span>
                ) : (
                  'Use as Exit Node'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  copyable,
  mono,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
  valueClass?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-2">
      <div className="text-portal-muted mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-portal-muted uppercase tracking-wide">{label}</p>
        <div className="flex items-center gap-2">
          <p className={cn(
            'text-sm text-portal-text truncate',
            mono && 'font-mono text-xs',
            valueClass
          )}>
            {value}
          </p>
          {copyable && (
            <button
              onClick={handleCopy}
              className="text-portal-muted hover:text-portal-text flex-shrink-0"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
