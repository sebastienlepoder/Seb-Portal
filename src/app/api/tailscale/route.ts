import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  isTailscaleAvailable,
  getConnectionMode,
  getStatus,
  getDevices,
  setExitNode,
  setExitNodeAllowLAN,
  SimplifiedDevice,
} from '@/lib/tailscale';

// GET /api/tailscale - Get Tailscale status and devices
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const connectionMode = getConnectionMode();

    // Check if Tailscale is available
    if (!isTailscaleAvailable()) {
      return NextResponse.json({
        ok: true,
        data: {
          available: false,
          connectionMode,
          message: 'Tailscale not configured. Set TAILSCALE_API_KEY + TAILSCALE_TAILNET for remote access, or mount the Tailscale socket for local access.',
        },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'status';

    switch (action) {
      case 'status': {
        const status = await getStatus();
        return NextResponse.json({
          ok: true,
          data: {
            available: true,
            connectionMode,
            connected: status.BackendState === 'Running',
            state: status.BackendState,
            version: status.Version,
            ips: status.TailscaleIPs,
            hostname: status.Self?.HostName,
            dnsName: status.Self?.DNSName?.replace(/\.$/, ''),
            tailnet: status.CurrentTailnet?.Name || status.MagicDNSSuffix,
            exitNode: status.ExitNodeStatus ? {
              id: status.ExitNodeStatus.ID,
              online: status.ExitNodeStatus.Online,
              ips: status.ExitNodeStatus.TailscaleIPs,
            } : null,
            peerCount: Object.keys(status.Peer || {}).length,
          },
        });
      }

      case 'devices': {
        const devices = await getDevices();
        return NextResponse.json({
          ok: true,
          data: { ...devices, connectionMode },
        });
      }

      case 'full': {
        const [status, devices] = await Promise.all([
          getStatus(),
          getDevices(),
        ]);
        
        return NextResponse.json({
          ok: true,
          data: {
            available: true,
            connectionMode,
            connected: status.BackendState === 'Running',
            state: status.BackendState,
            version: status.Version,
            ips: status.TailscaleIPs,
            hostname: status.Self?.HostName,
            ...devices,
            tailnet: status.CurrentTailnet?.Name || status.MagicDNSSuffix,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Tailscale API error:', error);
    const message = (error as Error).message;
    
    // Provide helpful error messages
    let helpText = message;
    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      helpText = 'Cannot reach Tailscale API. If using Web API mode, ensure the Tailscale service is running and accessible.';
    } else if (message.includes('timeout')) {
      helpText = 'Tailscale API request timed out. Check network connectivity.';
    } else if (message.includes('ECONNREFUSED')) {
      helpText = 'Connection refused. Tailscale service may not be running.';
    }
    
    return NextResponse.json(
      { ok: false, error: helpText },
      { status: 500 }
    );
  }
}

// POST /api/tailscale - Control Tailscale
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user || user.role?.toLowerCase() !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Admin required' }, { status: 403 });
    }

    if (!isTailscaleAvailable()) {
      return NextResponse.json({
        ok: false,
        error: 'Tailscale not available',
      }, { status: 503 });
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'setExitNode': {
        const { nodeId } = body;
        await setExitNode(nodeId || null);
        return NextResponse.json({ ok: true, message: nodeId ? 'Exit node set' : 'Exit node cleared' });
      }

      case 'setExitNodeLAN': {
        const { allow } = body;
        await setExitNodeAllowLAN(!!allow);
        return NextResponse.json({ ok: true, message: `LAN access ${allow ? 'enabled' : 'disabled'}` });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Tailscale control error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
