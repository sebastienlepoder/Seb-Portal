'use client';

import CommandPalette from '@/components/CommandPalette';
import { GlobalAiHub } from '@/components/GlobalAiHub';
import { QuickTodo } from '@/components/QuickTodo';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CommandPalette />
      <QuickTodo />
      <GlobalAiHub />
    </>
  );
}
