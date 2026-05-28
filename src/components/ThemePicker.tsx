'use client';

import { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { THEMES, applyTheme, getStoredTheme } from '@/lib/themes';
import { cn } from '@/lib/utils';

export function ThemePicker() {
  const [active, setActive] = useState<string>('default');

  useEffect(() => {
    setActive(getStoredTheme());
  }, []);

  function pick(id: string) {
    setActive(id);
    applyTheme(id);
  }

  return (
    <section className="bg-portal-card border border-portal-border rounded-xl p-6 mb-4">
      <h2 className="text-sm font-semibold text-portal-text mb-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-portal-accent" />
        Appearance
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => pick(t.id)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
              active === t.id
                ? 'border-portal-accent bg-portal-accent/10'
                : 'border-portal-border hover:border-portal-accent/40'
            )}
          >
            <span className="flex -space-x-1 shrink-0">
              {t.swatch.map((c, i) => (
                <span
                  key={i}
                  className="h-5 w-5 rounded-full border border-black/20"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
            <span className="flex-1 min-w-0 text-sm text-portal-text truncate">{t.label}</span>
            {active === t.id && <Check className="h-4 w-4 text-portal-accent shrink-0" />}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-portal-muted mt-3">
        The theme is stored in this browser and applied before the page paints.
      </p>
    </section>
  );
}
