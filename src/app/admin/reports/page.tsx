'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/usePortal';
import MainSidebar from '@/components/layout/MainSidebar';
import {
  BarChart3,
  Download,
  TrendingUp,
  Star,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HBarChart } from '@/components/ui/Charts';

interface ReportData {
  period: string;
  since: string;
  mostVisited: { serviceId: string; name: string; count: number }[];
  favoritesUsage: { serviceId: string; name: string; count: number }[];
  loginActivity: { date: string; success: number; fail: number }[];
  urgentInteractions: number;
}

export default function ReportsPage() {
  const { user, loading, logout } = useAuth();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login';
      return;
    }
    fetchReport();
  }, [loading, user, period]);

  const fetchReport = async () => {
    const res = await fetch(`/api/reports?period=${period}`);
    const data = await res.json();
    if (data.ok) setReport(data.data);
  };

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-portal-bg">
        <div className="animate-spin h-8 w-8 border-2 border-portal-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-portal-bg flex overflow-hidden">
      <MainSidebar user={user} onLogout={logout} />

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 z-20 bg-portal-bg/80 backdrop-blur-lg border-b border-portal-border">
          <div className="flex items-center gap-3 px-4 py-3 pl-14 sm:pl-4">
            <BarChart3 className="h-5 w-5 text-portal-accent" />
            <h1 className="text-lg font-semibold text-portal-text">Reports &amp; Analytics</h1>

            <div className="flex items-center gap-2 ml-auto">
              {(['day', 'week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent',
                    period === p
                      ? 'bg-portal-accent text-white'
                      : 'bg-portal-card border border-portal-border text-portal-muted hover:text-portal-text'
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
              <a
                href={`/api/reports?period=${period}&format=csv`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-portal-card border border-portal-border text-portal-text rounded-lg hover:bg-portal-card-hover transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-portal-accent"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </a>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-5xl mx-auto">
            {report && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Visits"
                    value={report.mostVisited.reduce((sum, v) => sum + v.count, 0)}
                    icon={<TrendingUp className="h-4 w-4" />}
                    color="text-portal-accent"
                  />
                  <StatCard
                    label="Unique Favorites"
                    value={report.favoritesUsage.length}
                    icon={<Star className="h-4 w-4" />}
                    color="text-amber-400"
                  />
                  <StatCard
                    label="Login Attempts"
                    value={report.loginActivity.reduce((sum, l) => sum + l.success + l.fail, 0)}
                    icon={<Shield className="h-4 w-4" />}
                    color="text-emerald-400"
                  />
                  <StatCard
                    label="Urgent Resolved"
                    value={report.urgentInteractions}
                    icon={<AlertTriangle className="h-4 w-4" />}
                    color="text-orange-400"
                  />
                </div>

                {/* Most Visited */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-portal-text mb-3">Most Visited Services</h3>
                  {report.mostVisited.length === 0 ? (
                    <p className="text-xs text-portal-muted">No data yet</p>
                  ) : (
                    <HBarChart
                      data={report.mostVisited.map((item) => ({ label: item.name, value: item.count }))}
                    />
                  )}
                </div>

                {/* Login Activity */}
                <div className="bg-portal-card border border-portal-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-portal-text">Login Activity</h3>
                    <div className="flex items-center gap-3 text-[10px] text-portal-muted">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Success
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-sm bg-red-500" /> Failed
                      </span>
                    </div>
                  </div>
                  {report.loginActivity.length === 0 ? (
                    <p className="text-xs text-portal-muted">No data yet</p>
                  ) : (
                    <LoginActivityChart data={report.loginActivity} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Per-day stacked bars: success (green) below, failures (red) on top. */
function LoginActivityChart({ data }: { data: { date: string; success: number; fail: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.success + d.fail));
  const chartH = 140;
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: chartH + 20 }}>
      {data.map((day) => {
        const total = day.success + day.fail;
        const successH = (day.success / max) * chartH;
        const failH = (day.fail / max) * chartH;
        return (
          <div key={day.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
            <span className="text-[10px] text-portal-text-dim tabular-nums">{total || ''}</span>
            <div className="w-full flex flex-col justify-end" style={{ height: chartH }}>
              {day.fail > 0 && (
                <div
                  className="w-full bg-red-500/80 rounded-t"
                  style={{ height: Math.max(2, failH) }}
                  title={`${day.fail} failed`}
                />
              )}
              <div
                className={cn('w-full bg-emerald-500/80', day.fail === 0 && 'rounded-t')}
                style={{ height: Math.max(day.success > 0 ? 2 : 0, successH) }}
                title={`${day.success} success`}
              />
            </div>
            <span className="text-[9px] text-portal-muted truncate w-full text-center" title={day.date}>
              {day.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4">
      <div className={cn('flex items-center gap-2 text-xs mb-2', color)}>
        {icon}
        <span className="text-portal-muted">{label}</span>
      </div>
      <div className="text-2xl font-bold text-portal-text">{value}</div>
    </div>
  );
}
