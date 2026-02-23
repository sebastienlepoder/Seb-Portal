'use client';

import { cn } from '@/lib/utils';
import type { StatusColor } from '@/types';

const colorMap: Record<StatusColor, string> = {
  green: 'bg-emerald-400 shadow-emerald-400/50',
  yellow: 'bg-amber-400 shadow-amber-400/50',
  red: 'bg-red-400 shadow-red-400/50',
  gray: 'bg-gray-500 shadow-gray-500/30',
};

export function StatusDot({ status, size = 'sm' }: { status: StatusColor; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full shadow-lg',
        colorMap[status],
        status === 'green' && 'animate-pulse-slow',
        size === 'sm' ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'
      )}
      title={status}
    />
  );
}
