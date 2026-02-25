'use client';

import { useState, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  Monitor, 
  ChevronRight,
  RefreshCw,
  Globe,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface TailscaleStatus {
  available: boolean;
  connected?: boolean;
  state?: string;
  version?: string;
  ips?: string[];
  hostname?: string;
  dnsName?: string;
  tailnet?: string;
  peerCount?: number;
  exitNode?: {
    id: string;
    online: boolean;
    ips: string[];
  } | null;
  message?: string;
}

export function TailscaleWidget() {
  const [status, setStatus] = useState<TailscaleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tailscale?action=status');
      const data = await res.json();
      if (data.ok) {
        setStatus(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-portal-text">Tailscale</span>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-portal-border rounded w-3/4" />
          <div className="h-3 bg-portal-border rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (!status?.available) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-portal-text">Tailscale</span>
        </div>
        <p className="text-xs text-portal-muted">
          {status?.message || 'Not available'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {status.connected ? (
            <Wifi className="h-4 w-4 text-green-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-400" />
          )}
          <span className="text-sm font-medium text-portal-text">Tailscale</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded',
            status.connected 
              ? 'bg-green-500/20 text-green-400' 
              : 'bg-red-500/20 text-red-400'
          )}>
            {status.connected ? 'Connected' : status.state}
          </span>
        </div>
        <button
          onClick={fetchStatus}
          className="p-1 text-portal-muted hover:text-portal-text transition-colors"
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {status.connected && (
        <div className="space-y-2">
          {/* This device */}
          <div className="flex items-center gap-2 text-xs">
            <Monitor className="h-3.5 w-3.5 text-portal-muted" />
            <span className="text-portal-text font-medium">{status.hostname}</span>
            <span className="text-portal-muted">{status.ips?.[0]}</span>
          </div>

          {/* Tailnet */}
          <div className="flex items-center gap-2 text-xs">
            <Globe className="h-3.5 w-3.5 text-portal-muted" />
            <span className="text-portal-muted">{status.tailnet}</span>
            <span className="text-portal-muted">• {status.peerCount} devices</span>
          </div>

          {/* Exit node */}
          {status.exitNode && (
            <div className="flex items-center gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-blue-400">Exit node active</span>
            </div>
          )}
        </div>
      )}

      <Link
        href="/tailscale"
        className="flex items-center justify-between mt-3 pt-3 border-t border-portal-border text-xs text-portal-muted hover:text-portal-text transition-colors"
      >
        <span>Manage devices</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
