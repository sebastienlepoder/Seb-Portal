/**
 * Tailscale Local API Client
 * Connects to tailscaled via Unix socket or HTTP API
 * 
 * Docs: https://tailscale.com/kb/1242/tailscale-local-api
 */

import fs from 'fs';
import http from 'http';

const TAILSCALE_SOCKET = process.env.TAILSCALE_SOCKET || '/var/run/tailscale/tailscaled.sock';
const TAILSCALE_API_URL = process.env.TAILSCALE_API_URL; // Optional: use HTTP instead of socket

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

// Check if Tailscale socket is available
export function isTailscaleAvailable(): boolean {
  if (TAILSCALE_API_URL) return true;
  try {
    return fs.existsSync(TAILSCALE_SOCKET);
  } catch {
    return false;
  }
}

// Make request to Tailscale local API
async function tailscaleRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (TAILSCALE_API_URL) {
      // HTTP mode
      const url = new URL(path, TAILSCALE_API_URL);
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
  return tailscaleRequest<TailscaleStatus>('GET', '/localapi/v0/status');
}

// Get current preferences
export async function getPrefs(): Promise<TailscalePrefs> {
  return tailscaleRequest<TailscalePrefs>('GET', '/localapi/v0/prefs');
}

// Set exit node
export async function setExitNode(nodeId: string | null): Promise<void> {
  const prefs: Partial<TailscalePrefs> = {
    ExitNodeID: nodeId || '',
  };
  await tailscaleRequest('PATCH', '/localapi/v0/prefs', prefs);
}

// Set exit node with LAN access
export async function setExitNodeAllowLAN(allow: boolean): Promise<void> {
  await tailscaleRequest('PATCH', '/localapi/v0/prefs', {
    ExitNodeAllowLANAccess: allow,
  });
}

// Disconnect/reconnect Tailscale
export async function setWantRunning(want: boolean): Promise<void> {
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
