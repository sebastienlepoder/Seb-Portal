'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sparkline } from '@/components/ui/Charts';
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
      <div className="space-y-3">
        {quotes.map((q) => (
          <div key={q.symbol} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-portal-text">{q.symbol}</span>
              {q.price > 0 && (
                <span className="text-sm text-portal-text-dim ml-2">${q.price.toFixed(2)}</span>
              )}
            </div>

            {/* Per-ticker sparkline, when history is available */}
            {q.sparkline && q.sparkline.length > 1 && (
              <div className="w-16 sm:w-20 shrink-0">
                <Sparkline data={q.sparkline} positive={q.change >= 0} height={24} />
              </div>
            )}

            {q.price > 0 && (
              <div
                className={cn(
                  'flex items-center gap-1 text-xs font-medium shrink-0 w-16 justify-end',
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
              <span className="text-xs text-portal-muted shrink-0">Configure API key</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
