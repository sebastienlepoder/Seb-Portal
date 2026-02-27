/**
 * Tailscale API Client
 * Supports multiple connection methods:
 * 1. Control Plane API (api.tailscale.com) - Works from anywhere with API key
 * 2. Local API via Unix socket - For containers with mounted socket
 * 3. Web API (tailscale web) - For local HTTP access
 * 
 * Docs: 
 * - https://tailscale.com/kb/1242/tailscale-local-api
 * - https://tailscale.com/api
 */

import fs from 'fs';
import http from 'http';
import https from 'https';

// Configuration
const TAILSCALE_SOCKET = process.env.TAILSCALE_SOCKET || '/var/run/tailscale/tailscaled.sock';
const TAILSCALE_API_URL = process.env.TAILSCALE_API_URL; // Web API (local HTTP)
const TAILSCALE_API_KEY = process.env.TAILSCALE_API_KEY; // Control Plane API key
const TAILSCALE_TAILNET = process.env.TAILSCALE_TAILNET; // Required for Control Plane API

// Determine which API mode to use
type ApiMode = 'control' | 'web' | 'socket' | 'none';
function getApiMode(): ApiMode {
  if (TAILSCALE_API_KEY && TAILSCALE_TAILNET) return 'control';
  if (TAILSCALE_API_URL) return 'web';
  try {
    if (fs.existsSync(TAILSCALE_SOCKET)) return 'socket';
  } catch {}
  return 'none';
}

const API_MODE = getApiMode();

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

// Control Plane API device interface
interface ControlPlaneDevice {
  id: string;
  nodeId: string;
  name: string;
  hostname: string;
  addresses: string[];
  os: string;
  clientVersion: string;
  user: string;
  created: string;
  lastSeen: string;
  keyExpiryDisabled: boolean;
  expires: string;
  authorized: boolean;
  isExternal: boolean;
  updateAvailable: boolean;
  blocksIncomingConnections: boolean;
  enabledRoutes: string[];
  advertisedRoutes: string[];
  tags?: string[];
}

interface ControlPlaneDevicesResponse {
  devices: ControlPlaneDevice[];
}

// Web API interfaces
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
}

// Check if Tailscale is available
export function isTailscaleAvailable(): boolean {
  return API_MODE !== 'none';
}

// Get the current API mode for debugging
export function getConnectionMode(): string {
  return API_MODE;
}

// Control Plane API request
async function controlPlaneRequest<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(\`https://api.tailscale.com/api/v2/tailnet/\${TAILSCALE_TAILNET}\${endpoint}\`);
    
    const options: https.RequestOptions = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': \`Bearer \${TAILSCALE_API_KEY}\`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
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
          reject(new Error(\`Tailscale Control API error: \${res.statusCode} \${data}\`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(\`Tailscale Control API failed: \${err.message}\`)));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Tailscale Control API timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Web/Socket API request
async function localApiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      method,
      path,
      headers: { 'Content-Type': 'application/json' },
    };

    if (API_MODE === 'web' && TAILSCALE_API_URL) {
      let requestPath = path;
      if (path === '/localapi/v0/status') requestPath = '/api/data';
      const url = new URL(requestPath, TAILSCALE_API_URL);
      options.hostname = url.hostname;
      options.port = url.port || 80;
      options.path = url.pathname;
    } else {
      options.socketPath = TAILSCALE_SOCKET;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : ({} as T)); }
          catch { resolve(data as unknown as T); }
        } else {
          reject(new Error(\`Tailscale API error: \${res.statusCode} \${data}\`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(\`Tailscale connection failed: \${err.message}\`)));
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Tailscale connection timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Adapter: Web API to Local API format
function adaptWebAPIToLocalAPI(webData: WebAPIData): TailscaleStatus {
  const self: TailscaleDevice = {
    ID: webData.ID,
    PublicKey: '',
    HostName: webData.DeviceName,
    DNSName: \`\${webData.DeviceName}.\${webData.TailnetName}.\`,
    OS: webData.OS,
    UserID: 0,
    TailscaleIPs: [webData.IPv4, webData.IPv6].filter(Boolean),
    Addrs: null, CurAddr: '', Relay: '', RxBytes: 0, TxBytes: 0,
    Created: '', LastSeen: new Date().toISOString(), LastHandshake: '',
    Online: webData.Status === 'Running',
    ExitNode: !!webData.UsingExitNode,
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
    Peer: {},
    MagicDNSSuffix: webData.TailnetName,
    CurrentTailnet: { Name: webData.TailnetName, MagicDNSSuffix: webData.TailnetName },
  };
}

// Adapter: Control Plane device to local format
function adaptControlPlaneDevice(device: ControlPlaneDevice): TailscaleDevice {
  const isOnline = new Date(device.lastSeen).getTime() > Date.now() - 5 * 60 * 1000;
  return {
    ID: device.nodeId,
    PublicKey: '',
    HostName: device.hostname || device.name,
    DNSName: device.name,
    OS: device.os,
    UserID: 0,
    TailscaleIPs: device.addresses || [],
    Addrs: null, CurAddr: '', Relay: '', RxBytes: 0, TxBytes: 0,
    Created: device.created,
    LastSeen: device.lastSeen,
    LastHandshake: '',
    Online: isOnline,
    ExitNode: (device.advertisedRoutes || []).includes('0.0.0.0/0'),
    ExitNodeOption: (device.advertisedRoutes || []).includes('0.0.0.0/0'),
    Active: isOnline,
    Tags: device.tags,
  };
}

// Get current Tailscale status
export async function getStatus(): Promise<TailscaleStatus> {
  switch (API_MODE) {
    case 'control': {
      const response = await controlPlaneRequest<ControlPlaneDevicesResponse>('GET', '/devices');
      const devices = response.devices || [];
      const firstDevice = devices[0];
      
      const self: TailscaleDevice = firstDevice ? adaptControlPlaneDevice(firstDevice) : {
        ID: '', PublicKey: '', HostName: 'Unknown', DNSName: '', OS: '', UserID: 0,
        TailscaleIPs: [], Addrs: null, CurAddr: '', Relay: '', RxBytes: 0, TxBytes: 0,
        Created: '', LastSeen: '', LastHandshake: '', Online: false,
        ExitNode: false, ExitNodeOption: false, Active: false,
      };

      const peers: Record<string, TailscaleDevice> = {};
      devices.slice(1).forEach(d => { peers[d.nodeId] = adaptControlPlaneDevice(d); });

      return {
        Version: 'Control API',
        BackendState: 'Running',
        TailscaleIPs: self.TailscaleIPs,
        Self: self,
        Peer: peers,
        MagicDNSSuffix: TAILSCALE_TAILNET || '',
        CurrentTailnet: { Name: TAILSCALE_TAILNET || '', MagicDNSSuffix: TAILSCALE_TAILNET || '' },
      };
    }
    case 'web': {
      const webData = await localApiRequest<WebAPIData>('GET', '/localapi/v0/status');
      return adaptWebAPIToLocalAPI(webData);
    }
    case 'socket':
    default:
      return localApiRequest<TailscaleStatus>('GET', '/localapi/v0/status');
  }
}

// Simplified device interface for UI
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

// Get all devices
export async function getDevices(): Promise<{ self: SimplifiedDevice | null; peers: SimplifiedDevice[]; exitNode: SimplifiedDevice | null }> {
  const status = await getStatus();
  
  const mapDevice = (device: TailscaleDevice, isSelf: boolean = false): SimplifiedDevice => ({
    id: device.ID,
    hostname: device.HostName,
    dnsName: device.DNSName?.replace(/\.$/, '') || '',
    os: device.OS,
    ips: device.TailscaleIPs || [],
    online: device.Online,
    lastSeen: device.LastSeen || device.LastHandshake || '',
    isExitNode: device.ExitNodeOption,
    isCurrentExitNode: status.ExitNodeStatus?.ID === device.ID,
    isSelf,
    rxBytes: device.RxBytes || 0,
    txBytes: device.TxBytes || 0,
    tags: device.Tags,
  });

  const self = status.Self ? mapDevice(status.Self, true) : null;
  const peers = Object.values(status.Peer || {}).map(p => mapDevice(p, false));
  const exitNode = status.ExitNodeStatus ? peers.find(p => p.id === status.ExitNodeStatus?.ID) || null : null;

  return { self, peers, exitNode };
}

// Get preferences
export async function getPrefs(): Promise<TailscalePrefs> {
  if (API_MODE === 'control' || API_MODE === 'web') {
    return { ExitNodeAllowLANAccess: false, AdvertiseExitNode: false, ShieldsUp: false };
  }
  return localApiRequest<TailscalePrefs>('GET', '/localapi/v0/prefs');
}

// Set exit node (socket mode only)
export async function setExitNode(nodeId: string | null): Promise<void> {
  if (API_MODE !== 'socket') {
    throw new Error('Exit node control requires local Tailscale socket. Use the Tailscale app on the device.');
  }
  await localApiRequest('PATCH', '/localapi/v0/prefs', { ExitNodeID: nodeId || '' });
}

// Set exit node LAN access (socket mode only)
export async function setExitNodeAllowLAN(allow: boolean): Promise<void> {
  if (API_MODE !== 'socket') {
    throw new Error('Exit node LAN control requires local Tailscale socket.');
  }
  await localApiRequest('PATCH', '/localapi/v0/prefs', { ExitNodeAllowLANAccess: allow });
}
