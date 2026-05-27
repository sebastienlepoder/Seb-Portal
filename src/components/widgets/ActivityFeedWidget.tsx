'use client';

import { useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  Circle,
  LogIn,
  LogOut,
  Shield,
  ShieldAlert,
  Wrench,
  Plus,
  Edit3,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useActivityStream, type ActivityEvent } from '@/hooks/useActivityStream';

const FILTERS = [
  { id: 'all', label: 'All', prefix: undefined as string | undefined },
  { id: 'auth', label: 'Auth', prefix: 'auth.' },
  { id: 'service', label: 'Services', prefix: 'service.' },
  { id: 'mcp', label: 'MCP', prefix: 'mcp.' },
  { id: 'schedule', label: 'Schedules', prefix: 'schedule.' },
  { id: 'admin', label: 'Admin', prefix: 'admin.' },
] as const;

export function ActivityFeedWidget() {
  const [filterId, setFilterId] = useState<(typeof FILTERS)[number]['id']>('all');
  const { events, connected } = useActivityStream({ initialLimit: 50, bufferSize: 200 });

  const filtered = useMemo(() => {
    const prefix = FILTERS.find((f) => f.id === filterId)?.prefix;
    if (!prefix) return events;
    return events.filter((e) => e.type.startsWith(prefix));
  }, [events, filterId]);

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/20 transition-all flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-portal-muted uppercase tracking-wider flex items-center gap-1.5">
          <ActivityIcon className="h-3.5 w-3.5 text-portal-accent" />
          Activity
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full',
            connected
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-amber-500/10 text-amber-400'
          )}
          title={connected ? 'Live stream connected' : 'Reconnecting…'}
        >
          <Circle className={cn('h-2 w-2 fill-current', connected ? '' : 'animate-pulse')} />
          {connected ? 'live' : 'offline'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilterId(f.id)}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
              filterId === f.id
                ? 'bg-portal-accent text-white border-portal-accent'
                : 'border-portal-border text-portal-muted hover:text-portal-text'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {filtered.length === 0 && (
          <div className="text-xs text-portal-muted py-4 text-center">
            No activity yet
          </div>
        )}
        {filtered.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const { Icon, tone } = iconFor(event.type);
  return (
    <div
      className={cn(
        'flex items-start gap-2 px-2 py-1.5 rounded-md text-xs border border-transparent',
        'hover:bg-portal-card-hover hover:border-portal-border transition-colors'
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', tone)} />
      <div className="min-w-0 flex-1">
        <div className="text-portal-text leading-tight truncate">{event.description}</div>
        <div className="text-[10px] text-portal-muted mt-0.5 flex items-center gap-1.5">
          <span>{formatRelativeTime(event.createdAt)}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{event.type}</span>
        </div>
      </div>
    </div>
  );
}

function iconFor(type: string): { Icon: typeof ActivityIcon; tone: string } {
  if (type === 'auth.login') return { Icon: LogIn, tone: 'text-emerald-400' };
  if (type === 'auth.login_fail' || type === 'auth.rate_limited')
    return { Icon: ShieldAlert, tone: 'text-red-400' };
  if (type === 'auth.logout') return { Icon: LogOut, tone: 'text-portal-muted' };
  if (type === 'auth.totp_enabled' || type === 'auth.totp_disabled')
    return { Icon: Shield, tone: 'text-blue-400' };
  if (type === 'service.created') return { Icon: Plus, tone: 'text-emerald-400' };
  if (type === 'service.updated') return { Icon: Edit3, tone: 'text-blue-400' };
  if (type === 'service.deleted') return { Icon: Trash2, tone: 'text-red-400' };
  if (type === 'service.icon_regenerated') return { Icon: Sparkles, tone: 'text-portal-accent' };
  if (type === 'mcp.executed') return { Icon: Wrench, tone: 'text-portal-accent' };
  if (type === 'schedule.spawned') return { Icon: Clock, tone: 'text-portal-accent' };
  if (type === 'schedule.catchup') return { Icon: CheckCircle2, tone: 'text-amber-400' };
  if (type === 'schedule.failed') return { Icon: XCircle, tone: 'text-red-400' };
  if (type === 'admin.backup_export') return { Icon: Download, tone: 'text-blue-400' };
  if (type === 'admin.backup_import') return { Icon: Upload, tone: 'text-blue-400' };
  if (type === 'urgent.action') return { Icon: AlertTriangle, tone: 'text-amber-400' };
  return { Icon: ActivityIcon, tone: 'text-portal-muted' };
}
