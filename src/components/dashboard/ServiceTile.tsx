'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/StatusDot';
import type { StatusColor } from '@/types';
import type { ServiceData } from '@/hooks/usePortal';
import {
  Star,
  ExternalLink,
  Copy,
  MoreHorizontal,
  Globe,
  Shield,
  Pencil,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface ServiceTileProps {
  service: ServiceData;
  status: StatusColor;
  isFavorite: boolean;
  isAdmin: boolean;
  vpnConnected: boolean;
  csrfToken?: string;
  onToggleFavorite: () => void;
  onOpenService: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRegenerateIcon?: () => void;
}

export function ServiceTile({
  service,
  status,
  isFavorite,
  isAdmin,
  vpnConnected,
  onToggleFavorite,
  onOpenService,
  onEdit,
  onDelete,
  onRegenerateIcon,
}: ServiceTileProps) {
  const [showMenu, setShowMenu] = useState(false);
  const vpnBlocked = service.requiresVPN && !vpnConnected;

  return (
    <div
      className={cn(
        'group relative bg-portal-card border border-portal-border rounded-xl p-4',
        'hover:border-portal-accent/30 hover:bg-portal-card-hover',
        'transition-all duration-200 cursor-pointer animate-fade-in',
        vpnBlocked && 'opacity-60'
      )}
      onClick={onOpenService}
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {service.requiresVPN && (
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              vpnConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            )}
          >
            VPN
          </span>
        )}
        <StatusDot status={status} />
      </div>

      {/* Icon + Content */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-portal-accent/10 border border-portal-accent/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {service.icon ? (
            <img
              src={service.icon}
              alt=""
              className="w-full h-full object-cover rounded-lg"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Globe className="h-5 w-5 text-portal-accent" />
          )}
        </div>
        <div className="flex-1 min-w-0 pr-14">
          <h3 className="text-sm font-semibold text-portal-text truncate">{service.name}</h3>
          {service.description && (
            <p className="text-xs text-portal-muted mt-0.5 line-clamp-2">{service.description}</p>
          )}
          {service.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {service.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-portal-border text-portal-text-dim"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions Overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            'p-1.5 rounded-md transition-colors',
            isFavorite
              ? 'text-amber-400 hover:bg-amber-500/10'
              : 'text-portal-muted hover:bg-portal-border hover:text-portal-text'
          )}
          title="Toggle favorite"
        >
          <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-amber-400')} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(service.url, '_blank');
          }}
          className="p-1.5 rounded-md text-portal-muted hover:bg-portal-border hover:text-portal-text transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(service.url);
          }}
          className="p-1.5 rounded-md text-portal-muted hover:bg-portal-border hover:text-portal-text transition-colors"
          title="Copy URL"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>

        {isAdmin && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-md text-portal-muted hover:bg-portal-border hover:text-portal-text transition-colors"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {showMenu && (
              <div className="absolute bottom-full right-0 mb-1 bg-portal-card border border-portal-border rounded-lg shadow-xl z-50 py-1 min-w-[140px] animate-fade-in">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-portal-text hover:bg-portal-card-hover flex items-center gap-2"
                >
                  <Pencil className="h-3 w-3" /> Edit service
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegenerateIcon?.();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-portal-text hover:bg-portal-card-hover flex items-center gap-2"
                >
                  <RefreshCw className="h-3 w-3" /> Regenerate icon
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
