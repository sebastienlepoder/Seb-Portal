'use client';

import { cn } from '@/lib/utils';
import type { VpnStatus } from '@/types';
import { Shield, ShieldOff } from 'lucide-react';

export function VpnBadge({ status }: { status: VpnStatus | null }) {
  if (!status) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all',
        status.connected
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      )}
    >
      {status.connected ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
      <span>VPN {status.connected ? 'ON' : 'OFF'}</span>
    </div>
  );
}

export function VpnBanner({ status }: { status: VpnStatus | null }) {
  if (!status || status.connected) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 mb-4 flex items-center gap-2 text-amber-400 text-sm animate-fade-in">
      <ShieldOff className="h-4 w-4 flex-shrink-0" />
      <span>Tailscale not detected — internal services may be unreachable.</span>
    </div>
  );
}
