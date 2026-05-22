'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AgentsHelpRedirectPage() {
  useEffect(() => {
    window.location.replace('/manage/help#agents-overview');
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
      <div className="flex items-center gap-2 text-sm text-portal-muted">
        <Loader2 className="h-4 w-4 animate-spin text-portal-accent" />
        Redirecting…
      </div>
    </div>
  );
}
