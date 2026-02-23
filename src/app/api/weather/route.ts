import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import type { WeatherData } from '@/types';

let weatherCache: { data: WeatherData; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 600_000; // 10 min

export async function GET() {
  try {
    await requireApiAuth();

    // Check cache
    if (weatherCache && Date.now() - weatherCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json({ ok: true, data: weatherCache.data });
    }

    const provider = process.env.WEATHER_PROVIDER || 'openweathermap';

    let data: WeatherData | null = null;

    if (provider === 'openweathermap') {
      data = await fetchOpenWeatherMap();
    } else if (provider === 'homeassistant') {
      data = await fetchHomeAssistant();
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'Weather not configured or unavailable' },
        { status: 503 }
      );
    }

    weatherCache = { data, fetchedAt: Date.now() };
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

async function fetchOpenWeatherMap(): Promise<WeatherData | null> {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) return null;

  const location = process.env.WEATHER_LOCATION || 'New York,US';
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;

  const d = await res.json();
  return {
    location: d.name,
    temperature: Math.round(d.main.temp),
    unit: 'F',
    condition: d.weather[0]?.description || 'Unknown',
    icon: `https://openweathermap.org/img/wn/${d.weather[0]?.icon}@2x.png`,
    humidity: d.main.humidity,
    wind: Math.round(d.wind.speed),
    updatedAt: new Date().toISOString(),
  };
}

async function fetchHomeAssistant(): Promise<WeatherData | null> {
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;
  const entity = process.env.HA_WEATHER_ENTITY || 'weather.home';

  if (!haUrl || !haToken) return null;

  const res = await fetch(`${haUrl}/api/states/${entity}`, {
    headers: { Authorization: `Bearer ${haToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const d = await res.json();
  return {
    location: d.attributes.friendly_name || 'Home',
    temperature: Math.round(d.attributes.temperature),
    unit: d.attributes.temperature_unit === '°C' ? 'C' : 'F',
    condition: d.state,
    icon: '',
    humidity: d.attributes.humidity,
    wind: Math.round(d.attributes.wind_speed),
    updatedAt: new Date().toISOString(),
  };
}
