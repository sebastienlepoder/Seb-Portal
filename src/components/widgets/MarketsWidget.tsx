'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketQuote } from '@/types';

export function MarketsWidget() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/markets')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setQuotes(data.data);
        else setError(data.error);
      })
      .catch(() => setError('Failed to load markets'));
  }, []);

  if (error) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-portal-muted text-sm">
          <BarChart3 className="h-4 w-4" />
          <span>Markets unavailable</span>
        </div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4 animate-pulse">
        <div className="h-20 bg-portal-border rounded" />
      </div>
    );
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/20 transition-all">
      <div className="text-xs text-portal-muted uppercase tracking-wider mb-3">Markets</div>
      <div className="space-y-2">
        {quotes.map((q) => (
          <div key={q.symbol} className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-portal-text">{q.symbol}</span>
              {q.price > 0 && (
                <span className="text-sm text-portal-text-dim ml-2">${q.price.toFixed(2)}</span>
              )}
            </div>
            {q.price > 0 && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs font-medium',
                  q.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {q.change >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>
                  {q.change >= 0 ? '+' : ''}
                  {q.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
            {q.price === 0 && (
              <span className="text-xs text-portal-muted">Configure API key</span>
            )}
          </div>
        ))}
      </div>
      {/* Sparkline placeholder */}
      {quotes[0]?.sparkline && (
        <div className="mt-3 pt-3 border-t border-portal-border">
          <MiniSparkline data={quotes[0].sparkline} positive={quotes[0].change >= 0} />
        </div>
      )}
    </div>
  );
}

function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const height = 30;
  const width = 100;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? '#22c55e' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
