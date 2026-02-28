'use client';

import CommandPalette from '@/components/CommandPalette';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
    </>
  );
}
