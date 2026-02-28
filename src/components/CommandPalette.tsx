'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, Star, Globe, Server, Code, Mail, Settings, CheckSquare, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

const defaultCommands: Omit<CommandItem, 'action'>[] = [
  { id: 'dashboard', title: 'Dashboard', subtitle: 'Go to main dashboard', icon: <Globe className="h-4 w-4" />, category: 'Pages' },
  { id: 'projects', title: 'Projects', subtitle: 'View all projects', icon: <Code className="h-4 w-4" />, category: 'Pages' },
  { id: 'tailscale', title: 'Tailscale', subtitle: 'VPN status & devices', icon: <Server className="h-4 w-4" />, category: 'Pages' },
  { id: 'coolify', title: 'VPS Servers', subtitle: 'Manage containers', icon: <Server className="h-4 w-4" />, category: 'Pages' },
  { id: 'mail', title: 'Email', subtitle: 'Check your inbox', icon: <Mail className="h-4 w-4" />, category: 'Pages' },
  { id: 'todos', title: 'Todo List', subtitle: 'Manage tasks', icon: <CheckSquare className="h-4 w-4" />, category: 'Pages' },
  { id: 'settings', title: 'Settings', subtitle: 'Configure portal', icon: <Settings className="h-4 w-4" />, category: 'Pages' },
  { id: 'remote', title: 'Remote Desktop', subtitle: 'Access machines', icon: <Server className="h-4 w-4" />, category: 'Pages' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [services, setServices] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch services for search
  useEffect(() => {
    fetch('/api/services')
      .then(r => r.json())
      .then(d => { if (d.ok) setServices(d.data || []); })
      .catch(() => {});
  }, []);

  // Build command items
  const commands: CommandItem[] = [
    ...defaultCommands.map(cmd => ({
      ...cmd,
      action: () => { router.push('/' + cmd.id); setOpen(false); }
    })),
    ...services.slice(0, 10).map(s => ({
      id: 'service-' + s.id,
      title: s.name,
      subtitle: s.url,
      icon: <ExternalLink className="h-4 w-4" />,
      category: 'Services',
      action: () => { window.open(s.url, '_blank'); setOpen(false); }
    }))
  ];

  // Filter by query
  const filtered = query
    ? commands.filter(c => 
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.subtitle?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // Group by category
  const grouped = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when open
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg mx-4 bg-portal-card border border-portal-border rounded-xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-portal-border">
          <Search className="h-5 w-5 text-portal-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, services, actions..."
            className="flex-1 bg-transparent text-portal-text placeholder-portal-muted focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex px-2 py-0.5 text-xs text-portal-muted bg-portal-bg rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-2 text-xs font-semibold text-portal-muted uppercase tracking-wider bg-portal-bg/50">
                {category}
              </div>
              {items.map((item, idx) => {
                const globalIdx = filtered.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={item.action}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      globalIdx === selectedIndex ? 'bg-portal-accent/20 text-portal-text' : 'text-portal-muted hover:bg-portal-bg/50 hover:text-portal-text'
                    )}
                  >
                    <span className="text-portal-muted">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && <p className="text-xs text-portal-muted truncate">{item.subtitle}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-portal-muted" />
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-portal-muted">
              No results found for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-portal-border bg-portal-bg/50 flex items-center gap-4 text-xs text-portal-muted">
          <span><kbd className="px-1 bg-portal-card rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 bg-portal-card rounded">↵</kbd> Select</span>
          <span><kbd className="px-1 bg-portal-card rounded">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
