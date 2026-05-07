'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Mail,
  FolderGit2,
  Settings,
  LogOut,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
  Star,
  Menu,
  X,
  Wifi,
  Monitor,
  Cloud,
  CheckSquare,
  Sparkles,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MainSidebarProps {
  user: {
    email: string;
    displayName?: string;
    role: 'admin' | 'user';
  };
  onLogout: () => void;
  /** For dashboard: highlight a section filter */
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  /** Dynamic sections from services (dashboard only) */
  sections?: string[];
  favoritesCount?: number;
}

export default function MainSidebar({
  user,
  onLogout,
  activeSection,
  onSectionChange,
  sections = [],
  favoritesCount = 0,
}: MainSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDashboard = pathname === '/dashboard' || pathname === '/';
  const isMail = pathname === '/mail';
  const isProjects = pathname?.startsWith('/projects');
  const isTailscale = pathname === '/tailscale';
  const isRemote = pathname === "/remote";
  const isCoolify = pathname === "/coolify";
  const isLocal = pathname === "/local";
  const isTodos = pathname === "/todos";
  const isInsights = pathname === "/insights";
  const isAmonis = pathname === "/amonis";

  return (
    <>
      {/* Mobile menu button - fixed at top left */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-3 left-3 z-50 lg:hidden p-2 bg-portal-card border border-portal-border rounded-lg text-portal-muted hover:text-portal-text shadow-lg',
          mobileOpen && 'hidden'
        )}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-40 bg-portal-card border-r border-portal-border flex flex-col transition-all duration-200 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-64 lg:w-12' : 'w-64'
        )}
      >
        {/* Brand + collapse toggle */}
        <div className={cn(
          'border-b border-portal-border flex items-center gap-2',
          collapsed ? 'p-2 justify-center flex-col' : 'p-4'
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex-1 min-w-0" onClick={() => setMobileOpen(false)}>
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-portal-accent" />
                <span className="text-lg font-bold text-portal-text">LEPODER</span>
              </div>
              <div className="text-xs text-portal-muted mt-0.5">Personal Portal</div>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
              <Shield className="h-5 w-5 text-portal-accent" />
            </Link>
          )}
          {/* Close button for mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors shrink-0"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Collapse button for desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors shrink-0"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {/* Dashboard filters (only functional on dashboard) */}
          {isDashboard && onSectionChange ? (
            <>
              <SidebarButton
                collapsed={collapsed}
                active={activeSection === 'all'}
                onClick={() => onSectionChange('all')}
                label="All Services"
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
              />
              <SidebarButton
                collapsed={collapsed}
                active={activeSection === 'favorites'}
                onClick={() => onSectionChange('favorites')}
                label="Favorites"
                icon={<Star className="h-3.5 w-3.5" />}
                badge={!collapsed ? (favoritesCount || undefined) : undefined}
              />
            </>
          ) : (
            <SidebarLink
              collapsed={collapsed}
              href="/dashboard"
              active={isDashboard}
              label="Dashboard"
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
            />
          )}

          {/* Quick Access */}
          {!collapsed && (
            <div className="px-3 pt-4 pb-1">
              <div className="text-[10px] font-semibold text-portal-muted uppercase tracking-wider">
                Quick Access
              </div>
            </div>
          )}
          {collapsed && <div className="h-1 border-t border-portal-border mx-2 mt-2 mb-1" />}
          
          <SidebarLink
            collapsed={collapsed}
            href="/mail"
            active={isMail}
            label="Mail"
            icon={<Mail className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/projects"
            active={isProjects}
            label="Projects"
            icon={<FolderGit2 className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/tailscale"
            active={isTailscale}
            label="Tailscale"
            icon={<Wifi className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/remote"
            active={isRemote}
            label="Remote Desktop"
            icon={<Monitor className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/coolify"
            active={isCoolify}
            label="VPS Servers"
            icon={<Cloud className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/local"
            active={isLocal}
            label="Local Services"
            icon={<HardDrive className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/todos"
            active={isTodos}
            label="Todo List"
            icon={<CheckSquare className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/insights"
            active={isInsights}
            label="Insights"
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
          
          {/* Amonis Finance - Development Hub */}
          {!collapsed && (
            <div className="px-3 pt-4 pb-1">
              <div className="text-[10px] font-semibold text-portal-muted uppercase tracking-wider">
                Development
              </div>
            </div>
          )}
          {collapsed && <div className="h-1 border-t border-portal-border mx-2 mt-2 mb-1" />}
          <SidebarLink
            collapsed={collapsed}
            href="/amonis"
            active={isAmonis}
            label="Amonis Finance"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            accent
          />

          {/* Dashboard sections (only on dashboard) */}
          {isDashboard && onSectionChange && sections.length > 0 && (
            <>
              {!collapsed && (
                <div className="px-3 pt-4 pb-1">
                  <div className="text-[10px] font-semibold text-portal-muted uppercase tracking-wider">
                    Sections
                  </div>
                </div>
              )}
              {collapsed && <div className="h-1 border-t border-portal-border mx-2 mt-2 mb-1" />}
              {sections.map((section) => (
                <SidebarButton
                  key={section}
                  collapsed={collapsed}
                  active={activeSection === section}
                  onClick={() => onSectionChange(section)}
                  label={section}
                />
              ))}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className={cn(
          'border-t border-portal-border space-y-1',
          collapsed ? 'p-2 flex flex-col items-center' : 'p-3'
        )}>
          {user.role === 'admin' && (
            <SidebarLink
              collapsed={collapsed}
              href="/admin/services"
              label="Gérer les services"
              icon={<Settings className="h-3.5 w-3.5" />}
              accent
            />
          )}
          <SidebarLink
            collapsed={collapsed}
            href="/settings"
            label="Settings"
            icon={<Settings className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/admin/reports"
            label="Reports"
            icon={<BarChart3 className="h-3.5 w-3.5" />}
          />
          <button
            onClick={onLogout}
            title={collapsed ? 'Sign Out' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-colors text-red-400 hover:bg-red-500/10',
              collapsed ? 'p-2 justify-center' : 'w-full gap-2 px-3 py-2 text-xs'
            )}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            {!collapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

function SidebarButton({
  active,
  onClick,
  label,
  icon,
  badge,
  collapsed,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          'w-full flex items-center justify-center p-2 rounded-lg transition-colors',
          active
            ? 'bg-portal-accent/10 text-portal-accent'
            : 'text-portal-muted hover:text-portal-text hover:bg-portal-card-hover'
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-xs transition-colors',
        active
          ? 'bg-portal-accent/10 text-portal-accent font-medium'
          : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] bg-portal-border px-1.5 py-0.5 rounded">{badge}</span>
      )}
    </button>
  );
}

function SidebarLink({
  href,
  active,
  label,
  icon,
  collapsed,
  accent,
}: {
  href: string;
  active?: boolean;
  label: string;
  icon?: React.ReactNode;
  collapsed?: boolean;
  accent?: boolean;
}) {
  if (collapsed) {
    return (
      <Link
        href={href}
        title={label}
        className={cn(
          'w-full flex items-center justify-center p-2 rounded-lg transition-colors',
          active
            ? 'bg-portal-accent/10 text-portal-accent'
            : accent
              ? 'text-portal-accent bg-portal-accent/10 hover:bg-portal-accent/20'
              : 'text-portal-muted hover:text-portal-text hover:bg-portal-card-hover'
        )}
      >
        {icon}
      </Link>
    );
  }

  return (
    <Link
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
    </Link>
  );
}
