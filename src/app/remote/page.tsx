'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  Monitor,
  Server,
  Laptop,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Play,
  Settings,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GuacConnection {
  identifier: string;
  name: string;
  protocol: string;
  parentIdentifier?: string;
  activeConnections?: number;
}

interface GuacConnectionGroup {
  identifier: string;
  name: string;
  type: string;
  childConnections?: GuacConnection[];
  childConnectionGroups?: GuacConnectionGroup[];
}

// Encode connection ID for Guacamole client URL
function encodeGuacClientId(connectionId: string, dataSource: string = 'postgresql'): string {
  // Format: <connection-id>\0c\0<data-source> (null bytes as separators, 'c' for connection)
  const raw = `${connectionId}\0c\0${dataSource}`;
  // Base64 encode
  return btoa(raw);
}

export default function RemotePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const [connections, setConnections] = useState<GuacConnection[]>([]);
  const [groups, setGroups] = useState<GuacConnectionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeConnection, setActiveConnection] = useState<{ id: string; name: string; encodedId: string } | null>(null);
  const [guacToken, setGuacToken] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (user) {
      fetchConnections();
    }
  }, [user]);

  const fetchConnections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/guacamole/connections');
      const data = await res.json();
      if (data.ok) {
        setConnections(data.connections || []);
        setGroups(data.groups || []);
        setGuacToken(data.token);
      } else {
        setError(data.error || 'Failed to fetch connections');
      }
    } catch (e) {
      setError('Failed to connect to Guacamole');
    } finally {
      setLoading(false);
    }
  };

  const connectTo = (connection: GuacConnection) => {
    if (!guacToken) {
      setError('Not authenticated with Guacamole');
      return;
    }
    const encodedId = encodeGuacClientId(connection.identifier);
    setActiveConnection({ id: connection.identifier, name: connection.name, encodedId });
  };

  const getProtocolIcon = (protocol: string) => {
    switch (protocol.toLowerCase()) {
      case 'rdp':
        return <Monitor className="h-5 w-5" />;
      case 'vnc':
        return <Laptop className="h-5 w-5" />;
      case 'ssh':
        return <Server className="h-5 w-5" />;
      case 'telnet':
        return <Smartphone className="h-5 w-5" />;
      default:
        return <Monitor className="h-5 w-5" />;
    }
  };

  const getProtocolColor = (protocol: string) => {
    switch (protocol.toLowerCase()) {
      case 'rdp':
        return 'text-blue-400 bg-blue-400/10';
      case 'vnc':
        return 'text-green-400 bg-green-400/10';
      case 'ssh':
        return 'text-amber-400 bg-amber-400/10';
      case 'telnet':
        return 'text-purple-400 bg-purple-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const guacBaseUrl = process.env.NEXT_PUBLIC_GUACAMOLE_URL || 'http://187.77.214.29:8090/guacamole';

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar
        user={user}
        onLogout={logout}
        activeSection="remote"
        onSectionChange={() => {}}
        sections={[]}
        favoritesCount={0}
      />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <Monitor className="h-6 w-6 text-portal-accent" />
              <h1 className="text-lg font-semibold text-portal-text">Remote Desktop</h1>
            </div>
            <div className="flex items-center gap-2 pl-12 sm:pl-0 sm:ml-auto">
              <button
                onClick={fetchConnections}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </button>
              <a
                href={guacBaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-xs text-portal-text bg-portal-card border border-portal-border rounded-lg hover:bg-portal-card-hover transition-colors"
              >
                <Settings className="h-4 w-4" />
                Guacamole Admin
              </a>
            </div>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* Connection iframe */}
          {activeConnection && guacToken && (
            <div className="flex-1 flex flex-col bg-black">
              <div className="flex items-center justify-between px-4 py-2 bg-portal-card border-b border-portal-border">
                <div className="flex items-center gap-2 pl-12 sm:pl-0 sm:ml-auto">
                  <Wifi className="h-4 w-4 text-green-400" />
                  <span className="text-sm text-portal-text">{activeConnection.name}</span>
                </div>
                <button
                  onClick={() => setActiveConnection(null)}
                  className="p-1 text-portal-muted hover:text-portal-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <iframe
                src={`${guacBaseUrl}/#/client/${activeConnection.encodedId}?token=${guacToken}`}
                className="flex-1 w-full border-0"
                allow="clipboard-read; clipboard-write"
              />
            </div>
          )}

          {/* Connections list - shown when no active connection or as sidebar */}
          <div className={cn(
            'overflow-y-auto p-6',
            activeConnection ? 'w-80 border-l border-portal-border' : 'flex-1'
          )}>
            {error && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-center py-12">
                <WifiOff className="h-12 w-12 text-portal-muted mx-auto mb-4" />
                <p className="text-portal-muted">No connections configured</p>
                <a
                  href={guacBaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Configure in Guacamole
                </a>
              </div>
            ) : (
              <div className={cn(
                'grid gap-4',
                activeConnection ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              )}>
                {connections.map((conn) => (
                  <div
                    key={conn.identifier}
                    className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/30 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={cn('p-2 rounded-lg', getProtocolColor(conn.protocol))}>
                        {getProtocolIcon(conn.protocol)}
                      </div>
                      {conn.activeConnections && conn.activeConnections > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                          <Wifi className="h-3 w-3" />
                          {conn.activeConnections} active
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-portal-text mb-1">{conn.name}</h3>
                    <p className="text-xs text-portal-muted uppercase mb-4">{conn.protocol}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => connectTo(conn)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent-dark text-white rounded-lg text-sm transition-colors"
                      >
                        <Play className="h-4 w-4" />
                        Connect
                      </button>
                      <a
                        href={`${guacBaseUrl}/#/client/${encodeGuacClientId(conn.identifier)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-lg transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
