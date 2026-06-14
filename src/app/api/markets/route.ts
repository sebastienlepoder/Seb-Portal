import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import type { MarketQuote } from '@/types';

let marketsCache: { data: MarketQuote[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 300_000; // 5 min

export async function GET() {
  try {
    await requireApiAuth();

    if (marketsCache && Date.now() - marketsCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, data: marketsCache.data });
    }

    const provider = process.env.MARKET_PROVIDER || 'alphavantage';
    const watchlist = (process.env.MARKET_WATCHLIST || 'SPY,QQQ').split(',').map((s) => s.trim());

    let quotes: MarketQuote[] = [];

    if (provider === 'alphavantage') {
      quotes = await fetchAlphaVantage(watchlist);
    } else if (provider === 'finnhub') {
      quotes = await fetchFinnhub(watchlist);
    }

    if (quotes.length === 0) {
      // Return placeholder data when no API key
      quotes = watchlist.map((symbol) => ({
        symbol,
        price: 0,
        change: 0,
        changePercent: 0,
        updatedAt: new Date().toISOString(),
      }));
    }

    marketsCache = { data: quotes, fetchedAt: Date.now() };
    return NextResponse.json({ ok: true, data: quotes });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

async function fetchAlphaVantage(symbols: string[]): Promise<MarketQuote[]> {
  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) return [];

  const quotes: MarketQuote[] = [];

  for (const symbol of symbols.slice(0, 5)) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const d = await res.json();
      const q = d['Global Quote'];
      if (!q) continue;
      quotes.push({
        symbol,
        price: parseFloat(q['05. price'] || '0'),
        change: parseFloat(q['09. change'] || '0'),
        changePercent: parseFloat((q['10. change percent'] || '0%').replace('%', '')),
        sparkline: await fetchAlphaVantageSparkline(symbol, apiKey),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Skip failed symbol
    }
  }

  return quotes;
}

/**
 * Best-effort ~30-day close history for a sparkline. Returns undefined on any
 * failure so the widget simply omits the chart rather than breaking the quote.
 */
async function fetchAlphaVantageSparkline(symbol: string, apiKey: string): Promise<number[] | undefined> {
  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return undefined;
    const d = await res.json();
    const series = d['Time Series (Daily)'];
    if (!series) return undefined;
    // Keys are dates (desc); take the most recent 30, oldest→newest for the line.
    const closes = Object.keys(series)
      .sort()
      .slice(-30)
      .map((date) => parseFloat(series[date]['4. close']))
      .filter((n) => Number.isFinite(n));
    return closes.length >= 2 ? closes : undefined;
  } catch {
    return undefined;
  }
}

async function fetchFinnhub(symbols: string[]): Promise<MarketQuote[]> {
  const apiKey = process.env.MARKET_DATA_API_KEY;
  if (!apiKey) return [];

  const quotes: MarketQuote[] = [];

  for (const symbol of symbols.slice(0, 5)) {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const d = await res.json();
      quotes.push({
        symbol,
        price: d.c || 0,
        change: d.d || 0,
        changePercent: d.dp || 0,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Skip
    }
  }

  return quotes;
}
