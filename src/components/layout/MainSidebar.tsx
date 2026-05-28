'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Mail,
  FolderGit2,
  FolderOpen,
  Settings,
  LogOut,
  BarChart3,
  Shield,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Wifi,
  Monitor,
  Cloud,
  CheckSquare,
  Sparkles,
  HardDrive,
  NotebookText,
  BrainCircuit,
  Wrench,
  Briefcase,
  TrendingUp,
  Bot,
  HelpCircle,
  Bookmark,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MainSidebarProps {
  user: {
    email: string;
    displayName?: string;
    role: 'admin' | 'user';
  };
  onLogout: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Custom active matcher; defaults to exact pathname equality. */
  match?: (pathname: string) => boolean;
  /** Hide this item from non-admins (the destination is admin-gated). */
  adminOnly?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'productivity',
    label: 'Productivity',
    items: [
      { href: '/mail', label: 'Mail', icon: <Mail className="h-3.5 w-3.5" /> },
      { href: '/todos', label: 'Todo List', icon: <CheckSquare className="h-3.5 w-3.5" /> },
      { href: '/onenote', label: 'OneNote', icon: <NotebookText className="h-3.5 w-3.5" /> },
      { href: '/bookmarks', label: 'Bookmarks', icon: <Bookmark className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    items: [
      { href: '/tailscale', label: 'Tailscale', icon: <Wifi className="h-3.5 w-3.5" /> },
      { href: '/local', label: 'Local Services', icon: <HardDrive className="h-3.5 w-3.5" /> },
      { href: '/coolify', label: 'VPS Servers', icon: <Cloud className="h-3.5 w-3.5" /> },
      { href: '/remote', label: 'Remote Desktop', icon: <Monitor className="h-3.5 w-3.5" /> },
    ],
  },
  {
    id: 'development',
    label: 'Development',
    items: [
      {
        href: '/projects',
        label: 'Projects',
        icon: <FolderGit2 className="h-3.5 w-3.5" />,
        match: (p) => p.startsWith('/projects'),
      },
      {
        href: '/files',
        label: 'Files',
        icon: <FolderOpen className="h-3.5 w-3.5" />,
        match: (p) => p.startsWith('/files'),
        adminOnly: true,
      },
      {
        href: '/amonis',
        label: 'Amonis Finance',
        icon: <Briefcase className="h-3.5 w-3.5" />,
      },
      { href: '/insights', label: 'Insights', icon: <TrendingUp className="h-3.5 w-3.5" /> },
      {
        href: '/agents',
        label: 'Agents',
        icon: <Bot className="h-3.5 w-3.5" />,
        match: (p) => p.startsWith('/agents'),
      },
    ],
  },
  {
    id: 'manage',
    label: 'Manage',
    adminOnly: true,
    items: [
      {
        href: '/admin/services',
        label: 'Manage services',
        icon: <Wrench className="h-3.5 w-3.5" />,
      },
      {
        href: '/admin/agents',
        label: 'Manage agents',
        icon: <Bot className="h-3.5 w-3.5" />,
        match: (p) => p.startsWith('/admin/agents') || p.startsWith('/admin/projects'),
      },
      {
        href: '/admin/recurring',
        label: 'Recurring tasks',
        icon: <Clock className="h-3.5 w-3.5" />,
      },
      {
        href: '/admin/mcp',
        label: 'MCP audit',
        icon: <Shield className="h-3.5 w-3.5" />,
      },
      {
        href: '/admin/skills',
        label: 'Skills hub',
        icon: <Sparkles className="h-3.5 w-3.5" />,
      },
      {
        href: '/admin/reports',
        label: 'Reports',
        icon: <BarChart3 className="h-3.5 w-3.5" />,
      },
    ],
  },
];

const HELP_ITEM: NavItem = {
  href: '/manage/help',
  label: 'Help',
  icon: <HelpCircle className="h-3.5 w-3.5" />,
  match: (p) => p.startsWith('/manage/help') || p.startsWith('/agents/help'),
};

const OPEN_GROUP_STORAGE_KEY = 'sidebar.openGroup';

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.href;
}

function findGroupContainingPath(pathname: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isItemActive(item, pathname))) {
      return group.id;
    }
  }
  return null;
}

export default function MainSidebar({ user, onLogout }: MainSidebarProps) {
  const pathname = usePathname() || '';
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDashboard = pathname === '/dashboard' || pathname === '/';
  const isAiHub = pathname === '/ai' || pathname.startsWith('/ai/');

  // Accordion: at most one group expanded at a time. Default opens the group
  // containing the current page; user toggles persist via localStorage.
  const initialGroupContainingPath = useMemo(
    () => findGroupContainingPath(pathname),
    [pathname]
  );
  const [openGroup, setOpenGroup] = useState<string | null>(initialGroupContainingPath);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Page change always wins so the user sees where they are.
    if (initialGroupContainingPath) {
      setOpenGroup(initialGroupContainingPath);
      return;
    }
    const stored = window.localStorage.getItem(OPEN_GROUP_STORAGE_KEY);
    if (stored === '') {
      setOpenGroup(null);
    } else if (stored && NAV_GROUPS.some((g) => g.id === stored)) {
      setOpenGroup(stored);
    }
  }, [initialGroupContainingPath]);

  const toggleGroup = (groupId: string) => {
    setOpenGroup((prev) => {
      const next = prev === groupId ? null : groupId;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(OPEN_GROUP_STORAGE_KEY, next ?? '');
      }
      return next;
    });
  };

  const visibleGroups = NAV_GROUPS.filter((g) => !g.adminOnly || user.role === 'admin');

  return (
    <>
      {/* Mobile menu button - fixed at top left */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          'fixed top-3 left-3 z-50 lg:hidden p-2 bg-portal-card border border-portal-border rounded-lg text-portal-muted hover:text-portal-text shadow-lg cursor-pointer',
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
        <div
          className={cn(
            'border-b border-portal-border flex items-center gap-2',
            collapsed ? 'p-2 justify-center flex-col' : 'p-4'
          )}
        >
          {!collapsed && (
            <Link
              href="/dashboard"
              className="flex-1 min-w-0"
              onClick={() => setMobileOpen(false)}
            >
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
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors shrink-0 cursor-pointer"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1 text-portal-muted hover:text-portal-text hover:bg-portal-card-hover rounded-md transition-colors shrink-0 cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          <SidebarLink
            collapsed={collapsed}
            href="/dashboard"
            active={isDashboard}
            label="Dashboard"
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/ai"
            active={isAiHub}
            label="AI Hub"
            icon={<BrainCircuit className="h-3.5 w-3.5" />}
          />

          {/* Grouped nav (accordion: one open at a time) */}
          {visibleGroups.map((group, idx) => {
            const isFirstGroup = idx === 0;
            const groupOpen = openGroup === group.id;
            const groupHasActive = group.items.some((item) => isItemActive(item, pathname));

            return (
              <div key={group.id} className={cn(isFirstGroup ? 'mt-2' : 'mt-1')}>
                {collapsed ? (
                  <div className="border-t border-portal-border mx-2 mt-2 mb-1" />
                ) : (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-1.5 px-3 pt-3 pb-1 group cursor-pointer"
                    aria-expanded={groupOpen}
                    aria-controls={`sidebar-group-${group.id}`}
                  >
                    <ChevronDown
                      className={cn(
                        'h-3 w-3 text-portal-muted transition-transform duration-200',
                        !groupOpen && '-rotate-90'
                      )}
                    />
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider transition-colors duration-200',
                        groupHasActive ? 'text-portal-accent' : 'text-portal-muted',
                        'group-hover:text-portal-text'
                      )}
                    >
                      {group.label}
                    </span>
                  </button>
                )}

                {(collapsed || groupOpen) && (
                  <div id={`sidebar-group-${group.id}`}>
                    {group.items
                      .filter((item) => !item.adminOnly || user.role === 'admin')
                      .map((item) => (
                      <SidebarLink
                        key={item.href}
                        collapsed={collapsed}
                        href={item.href}
                        active={isItemActive(item, pathname)}
                        label={item.label}
                        icon={item.icon}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div
          className={cn(
            'border-t border-portal-border space-y-1',
            collapsed ? 'p-2 flex flex-col items-center' : 'p-3'
          )}
        >
          <SidebarLink
            collapsed={collapsed}
            href={HELP_ITEM.href}
            label={HELP_ITEM.label}
            icon={HELP_ITEM.icon}
            active={isItemActive(HELP_ITEM, pathname)}
          />
          <SidebarLink
            collapsed={collapsed}
            href="/settings"
            label="Settings"
            icon={<Settings className="h-3.5 w-3.5" />}
            active={pathname === '/settings'}
          />
          <button
            onClick={onLogout}
            title={collapsed ? 'Sign Out' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-colors duration-200 text-red-400 hover:bg-red-500/10 cursor-pointer',
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

function SidebarLink({
  href,
  active,
  label,
  icon,
  collapsed,
}: {
  href: string;
  active?: boolean;
  label: string;
  icon?: React.ReactNode;
  collapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <Link
        href={href}
        title={label}
        className={cn(
          'w-full flex items-center justify-center p-2 rounded-lg transition-colors duration-200 cursor-pointer',
          active
            ? 'bg-portal-accent/10 text-portal-accent'
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
        'flex items-center gap-2 px-3 py-2 mx-2 rounded-lg text-xs transition-colors duration-200 cursor-pointer',
        active
          ? 'bg-portal-accent/10 text-portal-accent font-medium'
          : 'text-portal-text-dim hover:text-portal-text hover:bg-portal-card-hover'
      )}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
    </Link>
  );
}
