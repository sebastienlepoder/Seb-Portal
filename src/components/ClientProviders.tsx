'use client';

import CommandPalette from '@/components/CommandPalette';
import { GlobalAiHub } from '@/components/GlobalAiHub';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
      <GlobalAiHub />
    </>
  );
}
