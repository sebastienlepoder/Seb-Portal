'use client';

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
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortalSidebarProps {
  user: {
    email: string;
    displayName?: string;
    role: 'admin' | 'user';
  };
  onLogout: () => void;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/mail', label: 'Mail', icon: Mail },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
];

const adminItems = [
  { href: '/admin/services', label: 'Services', icon: Settings },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
];

export default function PortalSidebar({ user, onLogout }: PortalSidebarProps) {
  const pathname = usePathname();

  return (
    <div className="w-16 lg:w-56 h-full bg-portal-card border-r border-portal-border flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Logo */}
      <div className="p-4 border-b border-portal-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-portal-accent rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">LP</span>
          </div>
          <span className="hidden lg:block text-sm font-semibold text-portal-text">LE PODER</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-portal-accent/10 text-portal-accent'
                  : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </Link>
          );
        })}

        {user.role === 'admin' && (
          <>
            <div className="pt-4 pb-2">
              <span className="hidden lg:block px-3 text-[10px] font-medium text-portal-muted uppercase tracking-wider">
                Admin
              </span>
            </div>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-portal-accent/10 text-portal-accent'
                      : 'text-portal-muted hover:bg-portal-bg hover:text-portal-text'
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden lg:block">{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-2 border-t border-portal-border">
        <div className="hidden lg:block px-3 py-2">
          <p className="text-xs font-medium text-portal-text truncate">
            {user.displayName || user.email}
          </p>
          <p className="text-[10px] text-portal-muted truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-portal-muted hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="hidden lg:block">Logout</span>
        </button>
      </div>
    </div>
  );
}
