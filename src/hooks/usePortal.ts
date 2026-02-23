'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SessionUser, VpnStatus, StatusColor } from '@/types';

// ─── Auth Hook ───────────────────────────────────────────────

export function useAuth() {
  const [user, setUser] = useState<(SessionUser & { csrfToken?: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, logout, refetch: fetchUser };
}

// ─── Services Hook ───────────────────────────────────────────

export interface ServiceData {
  id: string;
  slug: string;
  name: string;
  url: string;
  type: string;
  description: string | null;
  tags: string[];
  category: string;
  section: string;
  openMode: string;
  requiresVPN: boolean;
  statusCheckUrl: string | null;
  favoriteDefault: boolean;
  icon: string | null;
  credentialsHint: string | null;
  sortOrder: number;
}

export function useServices() {
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setServices(data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { services, loading, setServices };
}

// ─── Favorites Hook ──────────────────────────────────────────

export function useFavorites(csrfToken?: string) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setFavoriteIds(new Set(data.data.map((f: { serviceId: string }) => f.serviceId)));
        }
      })
      .catch(() => {});
  }, []);

  const toggleFavorite = async (serviceId: string) => {
    const res = await fetch('/api/favorites', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ serviceId }),
    });
    const data = await res.json();
    if (data.ok) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (data.data.favorited) next.add(serviceId);
        else next.delete(serviceId);
        return next;
      });
    }
  };

  return { favoriteIds, toggleFavorite };
}

// ─── Status Hook ─────────────────────────────────────────────

export function useStatuses() {
  const [statuses, setStatuses] = useState<Record<string, StatusColor>>({});
  const [vpnStatus, setVpnStatus] = useState<VpnStatus | null>(null);

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.ok) {
        setVpnStatus(data.data.vpn);
        const statusMap: Record<string, StatusColor> = {};
        for (const [id, val] of Object.entries(data.data.statuses)) {
          statusMap[id] = (val as { status: StatusColor }).status;
        }
        setStatuses(statusMap);
      }
    } catch {
      // Status checks are non-critical
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 60000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  return { statuses, vpnStatus, refetch: fetchStatuses };
}

// ─── CSRF Helper ─────────────────────────────────────────────

export function useApiCall(csrfToken?: string) {
  return useCallback(
    async (url: string, options?: RequestInit) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      };
      const res = await fetch(url, { ...options, headers: { ...headers, ...options?.headers } });
      return res.json();
    },
    [csrfToken]
  );
}
