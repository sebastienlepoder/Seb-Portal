'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/usePortal';
import {
  Shield,
  Settings,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  FolderGit2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortalShellProps {
  children: React.ReactNode;
  /** Highlights the matching nav item */
  activeItem?: 'dashboard' | 'projects' | 'settings' | 'reports' | 'admin';
}

/**
 * Shared shell with the collapsible sidebar.
 * Used by pages that need the nav visible (e.g. /settings, /admin/reports).
 */
export function PortalShell({ children, activeItem }: PortalShellProps) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen bg-portal-bg flex overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 bg-portal-card border-r border-portal-border flex flex-col transition-all duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'w-64 lg:w-12' : 'w-64'
        )}
      >
        {/* Brand + collapse toggle */}
        <div
          className={cn(
            'border-b border-portal-border flex items-center gap-2',
            sidebarCollapsed ? 'p-2 justify-center flex-col' : 'p-4'
          )}
        >
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-portal-accent" />
                <span className="text-lg font-bold text-portal-text">LEPODER</span>
              </div>
              <div className="text-xs text-portal-muted mt-0.5">Personal Portal</div>
            </div>
          )}
          {sidebarCollapsed && <Shield className="h-5 w-5 text-portal-accent" />}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden lg:flex p-1 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Nav */}
        {!sidebarCollapsed && (
          <nav className="flex-1 overflow-y-auto py-2">
            <NavLink
              href="/dashboard"
              active={activeItem === 'dashboard'}
              label="All Services"
            />
          </nav>
        )}

        {/* Bottom actions */}
        {!sidebarCollapsed && (
          <div className="border-t border-portal-border p-3 space-y-1">
            {user?.role === 'admin' && (
              <NavLink
                href="/admin/services"
                active={activeItem === 'admin'}
                label="Gérer les services"
                icon={<Settings className="h-3.5 w-3.5" />}
                accent
              />
            )}
            <NavLink
              href="/projects"
              active={activeItem === 'projects'}
              label="Projets"
              icon={<FolderGit2 className="h-3.5 w-3.5" />}
            />
            <NavLink
              href="/settings"
              active={activeItem === 'settings'}
              label="Settings"
              icon={<Settings className="h-3.5 w-3.5" />}
            />
            <NavLink
              href="/admin/reports"
              active={activeItem === 'reports'}
              label="Reports"
              icon={<BarChart3 className="h-3.5 w-3.5" />}
            />
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden shrink-0 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 text-portal-muted hover:text-portal-text"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  active,
  label,
  icon,
  accent = false,
}: {
  href: string;
  active: boolean;
  label: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <a
      href={href}
      className={cn(
        'flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-xs transition-colors',
        active
          ? 'bg-portal-accent/10 text-portal-accent font-medium'
          : accent
            ? 'text-portal-accent bg-portal-accent/10 hover:bg-portal-accent/20 border border-portal-accent/20'
            : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
    </a>
  );
}
