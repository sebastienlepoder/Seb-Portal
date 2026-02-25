import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  isTailscaleAvailable,
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

    // Check if Tailscale is available
    if (!isTailscaleAvailable()) {
      return NextResponse.json({
        ok: true,
        data: {
          available: false,
          message: 'Tailscale socket not found. Mount /var/run/tailscale/tailscaled.sock into the container.',
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
          data: devices,
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
            connected: status.BackendState === 'Running',
            state: status.BackendState,
            version: status.Version,
            ips: status.TailscaleIPs,
            hostname: status.Self?.HostName,
            tailnet: status.CurrentTailnet?.Name || status.MagicDNSSuffix,
            ...devices,
          },
        });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Tailscale API error:', error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
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
