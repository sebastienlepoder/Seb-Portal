/**
 * VPN / Tailscale status checker.
 * Supports: ping_url, tailscale_local_api, manual modes.
 */

import type { VpnStatus, VpnHealthcheckMode } from '@/types';

let cachedStatus: VpnStatus | null = null;
let lastCheckTime = 0;
const CHECK_TTL_MS = 30_000; // 30s cache

export async function getVpnStatus(forceRefresh = false): Promise<VpnStatus> {
  const mode = (process.env.VPN_HEALTHCHECK_MODE || 'manual') as VpnHealthcheckMode;

  if (!forceRefresh && cachedStatus && Date.now() - lastCheckTime < CHECK_TTL_MS) {
    return cachedStatus;
  }

  let connected = false;
  let message: string | undefined;

  switch (mode) {
    case 'ping_url': {
      const url = process.env.VPN_HEALTHCHECK_URL;
      if (!url) {
        message = 'VPN_HEALTHCHECK_URL not configured';
        break;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        connected = res.ok;
        message = connected ? 'VPN reachable' : `HTTP ${res.status}`;
      } catch {
        connected = false;
        message = 'VPN health endpoint unreachable';
      }
      break;
    }
    case 'tailscale_local_api': {
      const tsUrl = process.env.TAILSCALE_API_URL || 'http://localhost:41112';
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${tsUrl}/localapi/v0/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          connected = data.BackendState === 'Running';
          message = `Tailscale: ${data.BackendState}`;
        }
      } catch {
        connected = false;
        message = 'Tailscale local API unreachable';
      }
      break;
    }
    case 'manual':
    default:
      // In manual mode, assume connected unless explicitly toggled
      connected = cachedStatus?.connected ?? true;
      message = 'Manual mode — toggle VPN status in UI';
      break;
  }

  cachedStatus = {
    connected,
    mode,
    lastChecked: new Date().toISOString(),
    message,
  };
  lastCheckTime = Date.now();

  return cachedStatus;
}

export function setManualVpnStatus(connected: boolean) {
  cachedStatus = {
    connected,
    mode: 'manual',
    lastChecked: new Date().toISOString(),
    message: connected ? 'Manually set: connected' : 'Manually set: disconnected',
  };
  lastCheckTime = Date.now();
}
