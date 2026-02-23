'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';
import { Search, X } from 'lucide-react';
import type { ServiceData } from '@/hooks/usePortal';

interface SearchBarProps {
  services: ServiceData[];
  onSelect: (service: ServiceData) => void;
}

export function SearchBar({ services, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(services, {
        keys: ['name', 'description', 'tags', 'category', 'section'],
        threshold: 0.35,
        includeScore: true,
      }),
    [services]
  );

  const results = query.length > 0 ? fuse.search(query).slice(0, 8) : [];

  // Keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-portal-muted" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search services... (Ctrl+K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full bg-portal-card border border-portal-border rounded-lg pl-10 pr-10 py-2 text-sm text-portal-text placeholder:text-portal-muted focus:outline-none focus:border-portal-accent/50 focus:ring-1 focus:ring-portal-accent/30 transition-all"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-portal-muted hover:text-portal-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-portal-card border border-portal-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          {results.map((r) => (
            <button
              key={r.item.id}
              onClick={() => {
                onSelect(r.item);
                setQuery('');
                setOpen(false);
              }}
              className="w-full text-left px-4 py-3 hover:bg-portal-card-hover transition-colors border-b border-portal-border last:border-0 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-portal-text truncate">{r.item.name}</div>
                <div className="text-xs text-portal-muted truncate">
                  {r.item.section} · {r.item.description}
                </div>
              </div>
              {r.item.requiresVPN && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0">
                  VPN
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
