/**
 * Tailscale API Client
 * Connects to tailscaled via Unix socket (Local API) or HTTP (Web API)
 * 
 * Docs: https://tailscale.com/kb/1242/tailscale-local-api
 */

import fs from 'fs';
import http from 'http';

const TAILSCALE_SOCKET = process.env.TAILSCALE_SOCKET || '/var/run/tailscale/tailscaled.sock';
const TAILSCALE_API_URL = process.env.TAILSCALE_API_URL; // Optional: use HTTP instead of socket
const IS_WEB_API = TAILSCALE_API_URL && !TAILSCALE_API_URL.includes('localapi');

export interface TailscaleStatus {
  Version: string;
  BackendState: 'Running' | 'Stopped' | 'NeedsLogin' | 'NeedsMachineAuth' | 'Starting';
  TailscaleIPs: string[];
  Self: TailscaleDevice;
  ExitNodeStatus?: {
    ID: string;
    Online: boolean;
    TailscaleIPs: string[];
  };
  Peer: Record<string, TailscaleDevice>;
  MagicDNSSuffix: string;
  CurrentTailnet?: {
    Name: string;
    MagicDNSSuffix: string;
  };
}

export interface TailscaleDevice {
  ID: string;
  PublicKey: string;
  HostName: string;
  DNSName: string;
  OS: string;
  UserID: number;
  TailscaleIPs: string[];
  Addrs: string[] | null;
  CurAddr: string;
  Relay: string;
  RxBytes: number;
  TxBytes: number;
  Created: string;
  LastSeen: string;
  LastHandshake: string;
  Online: boolean;
  ExitNode: boolean;
  ExitNodeOption: boolean;
  Active: boolean;
  ShareeNode?: boolean;
  Tags?: string[];
}

export interface TailscalePrefs {
  ExitNodeID?: string;
  ExitNodeIP?: string;
  ExitNodeAllowLANAccess: boolean;
  AdvertiseRoutes?: string[];
  AdvertiseExitNode: boolean;
  ShieldsUp: boolean;
}

// Web API interfaces (tailscale web)
export interface WebAPIData {
  ID: string;
  Status: string;
  DeviceName: string;
  TailnetName: string;
  DomainName: string;
  IPv4: string;
  IPv6: string;
  OS: string;
  IPNVersion: string;
  Profile?: {
    ID: number;
    LoginName: string;
    DisplayName: string;
    ProfilePicURL: string;
  };
  IsTagged: boolean;
  Tags: string[] | null;
  KeyExpiry: string;
  KeyExpired: boolean;
  TUNMode: boolean;
  UsingExitNode: any;
  AdvertisingExitNode: boolean;
  AdvertisingExitNodeApproved: boolean;
  AdvertisedRoutes: any;
  Features?: {
    [key: string]: boolean;
  };
}

// Adapter: Convert Web API data to Local API format
function adaptWebAPIToLocalAPI(webData: WebAPIData): TailscaleStatus {
  const self: TailscaleDevice = {
    ID: webData.ID,
    PublicKey: '', // Not available in Web API
    HostName: webData.DeviceName,
    DNSName: `${webData.DeviceName}.${webData.TailnetName}.`,
    OS: webData.OS,
    UserID: 0,
    TailscaleIPs: [webData.IPv4, webData.IPv6].filter(Boolean),
    Addrs: null,
    CurAddr: '',
    Relay: '',
    RxBytes: 0,
    TxBytes: 0,
    Created: '',
    LastSeen: new Date().toISOString(),
    LastHandshake: '',
    Online: webData.Status === 'Running',
    ExitNode: webData.UsingExitNode ? true : false,
    ExitNodeOption: webData.AdvertisingExitNode,
    Active: true,
    Tags: webData.Tags || undefined,
  };

  return {
    Version: webData.IPNVersion,
    BackendState: webData.Status === 'Running' ? 'Running' : 'Stopped',
    TailscaleIPs: [webData.IPv4, webData.IPv6].filter(Boolean),
    Self: self,
    ExitNodeStatus: webData.UsingExitNode ? {
      ID: webData.UsingExitNode.id || '',
      Online: true,
      TailscaleIPs: [webData.UsingExitNode.ip || ''].filter(Boolean),
    } : undefined,
    Peer: {}, // Web API doesn't provide peer data - would need separate call
    MagicDNSSuffix: webData.TailnetName,
    CurrentTailnet: {
      Name: webData.TailnetName,
      MagicDNSSuffix: webData.TailnetName,
    },
  };
}

// Check if Tailscale socket is available
export function isTailscaleAvailable(): boolean {
  if (TAILSCALE_API_URL) return true;
  try {
    return fs.existsSync(TAILSCALE_SOCKET);
  } catch {
    return false;
  }
}

// Make request to Tailscale API (Local or Web)
async function tailscaleRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    let requestPath = path;
    
    // Adapt Local API paths to Web API paths when using Web API
    if (IS_WEB_API) {
      if (path === '/localapi/v0/status') {
        requestPath = '/api/data';
      } else if (path.startsWith('/localapi/v0/')) {
        // For now, other Local API endpoints are not supported in Web API
        reject(new Error(`Web API does not support endpoint: ${path}`));
        return;
      }
    }

    const options: http.RequestOptions = {
      method,
      path: requestPath,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (TAILSCALE_API_URL) {
      // HTTP mode
      const url = new URL(requestPath, TAILSCALE_API_URL);
      options.hostname = url.hostname;
      options.port = url.port || 80;
      options.path = url.pathname;
    } else {
      // Unix socket mode
      options.socketPath = TAILSCALE_SOCKET;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : ({} as T));
          } catch {
            resolve(data as unknown as T);
          }
        } else {
          reject(new Error(`Tailscale API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Tailscale connection failed: ${err.message}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Get current Tailscale status
export async function getStatus(): Promise<TailscaleStatus> {
  if (IS_WEB_API) {
    const webData = await tailscaleRequest<WebAPIData>('GET', '/localapi/v0/status');
    return adaptWebAPIToLocalAPI(webData);
  } else {
    return tailscaleRequest<TailscaleStatus>('GET', '/localapi/v0/status');
  }
}

// Get current preferences
export async function getPrefs(): Promise<TailscalePrefs> {
  if (IS_WEB_API) {
    // Web API doesn't provide preference details, return minimal data
    return {
      ExitNodeAllowLANAccess: false,
      AdvertiseExitNode: false,
      ShieldsUp: false,
    };
  }
  return tailscaleRequest<TailscalePrefs>('GET', '/localapi/v0/prefs');
}

// Set exit node
export async function setExitNode(nodeId: string | null): Promise<void> {
  if (IS_WEB_API) {
    throw new Error('Exit node control not available via Web API. Use Tailscale app or CLI.');
  }
  const prefs: Partial<TailscalePrefs> = {
    ExitNodeID: nodeId || '',
  };
  await tailscaleRequest('PATCH', '/localapi/v0/prefs', prefs);
}

// Set exit node with LAN access
export async function setExitNodeAllowLAN(allow: boolean): Promise<void> {
  if (IS_WEB_API) {
    throw new Error('Exit node LAN control not available via Web API. Use Tailscale app or CLI.');
  }
  await tailscaleRequest('PATCH', '/localapi/v0/prefs', {
    ExitNodeAllowLANAccess: allow,
  });
}

// Disconnect/reconnect Tailscale
export async function setWantRunning(want: boolean): Promise<void> {
  if (IS_WEB_API) {
    throw new Error('Connection control not available via Web API. Use Tailscale app or CLI.');
  }
  await tailscaleRequest('PATCH', '/localapi/v0/prefs', {
    WantRunning: want,
  });
}

// Get simplified device list
export async function getDevices(): Promise<{
  self: SimplifiedDevice;
  peers: SimplifiedDevice[];
  tailnet: string;
  exitNode?: SimplifiedDevice;
}> {
  const status = await getStatus();
  
  const simplify = (d: TailscaleDevice, isSelf = false): SimplifiedDevice => ({
    id: d.ID,
    hostname: d.HostName,
    dnsName: d.DNSName.replace(/\.$/, ''),
    os: d.OS,
    ips: d.TailscaleIPs,
    online: d.Online,
    lastSeen: d.LastSeen,
    isExitNode: d.ExitNodeOption,
    isCurrentExitNode: d.ExitNode,
    isSelf,
    rxBytes: d.RxBytes,
    txBytes: d.TxBytes,
    tags: d.Tags,
  });

  const self = simplify(status.Self, true);
  const peers = Object.values(status.Peer || {}).map((p) => simplify(p));
  
  // Find current exit node
  const exitNode = peers.find((p) => p.isCurrentExitNode);

  return {
    self,
    peers: peers.sort((a, b) => {
      // Online first, then by hostname
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.hostname.localeCompare(b.hostname);
    }),
    tailnet: status.CurrentTailnet?.Name || status.MagicDNSSuffix || 'unknown',
    exitNode,
  };
}

export interface SimplifiedDevice {
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

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Get OS emoji
export function getOsEmoji(os: string): string {
  const lower = os.toLowerCase();
  if (lower.includes('macos') || lower.includes('darwin')) return '🍎';
  if (lower.includes('windows')) return '🪟';
  if (lower.includes('linux')) return '🐧';
  if (lower.includes('ios')) return '📱';
  if (lower.includes('android')) return '🤖';
  if (lower.includes('synology')) return '💾';
  return '💻';
}

// Scan for common services on a device
export async function scanDeviceServices(
  ip: string,
  ports: number[] = [22, 80, 443, 8080, 8123, 3000, 5000, 8000, 9000]
): Promise<{ port: number; open: boolean }[]> {
  const results = await Promise.all(
    ports.map(async (port) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        
        await fetch(`http://${ip}:${port}/`, {
          method: 'HEAD',
          signal: controller.signal,
        }).catch(() => {});
        
        clearTimeout(timeout);
        return { port, open: true };
      } catch {
        return { port, open: false };
      }
    })
  );
  
  return results.filter((r) => r.open);
}
