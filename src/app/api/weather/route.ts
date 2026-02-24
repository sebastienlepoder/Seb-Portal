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

    // Auto-detect provider: if coords are set and no explicit provider, use openmeteo
    const explicitProvider = process.env.WEATHER_PROVIDER;
    const hasCoords = process.env.WEATHER_LAT && process.env.WEATHER_LON;
    const provider = explicitProvider || (hasCoords ? 'openmeteo' : 'openweathermap');

    let data: WeatherData | null = null;

    if (provider === 'openmeteo') {
      data = await fetchOpenMeteo();
    } else if (provider === 'openweathermap') {
      data = await fetchOpenWeatherMap();
    } else if (provider === 'homeassistant') {
      data = await fetchHomeAssistant();
    }

    if (!data) {
      const reason = !process.env.WEATHER_LAT && !process.env.WEATHER_LON && !process.env.WEATHER_LOCATION
        ? 'WEATHER_LAT/LON or WEATHER_LOCATION not set in .env'
        : `Provider "${provider}" returned no data`;
      console.error('[weather]', reason);
      return NextResponse.json({ ok: false, error: reason }, { status: 503 });
    }

    weatherCache = { data, fetchedAt: Date.now() };
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('[weather] exception:', e);
    if ((e as Error).message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Server error' }, { status: 500 });
  }
}

// ── Open-Meteo (free, no API key needed) ─────────────────────────────────────

async function fetchOpenMeteo(): Promise<WeatherData | null> {
  let lat = process.env.WEATHER_LAT;
  let lon = process.env.WEATHER_LON;

  // If no coords, try to geocode from WEATHER_LOCATION
  if (!lat || !lon) {
    const cityName = process.env.WEATHER_LOCATION;
    if (!cityName) return null;
    const coords = await geocodeCity(cityName);
    if (!coords) return null;
    lat = String(coords.lat);
    lon = String(coords.lon);
  }

  const displayName =
    process.env.WEATHER_LOCATION ||
    process.env.WEATHER_LAT + ',' + process.env.WEATHER_LON;

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature` +
    `&wind_speed_unit=kmh` +
    `&timezone=auto`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  } catch (err) {
    console.error('[weather] open-meteo fetch error:', err);
    return null;
  }
  if (!res.ok) {
    console.error('[weather] open-meteo HTTP error:', res.status, await res.text().catch(() => ''));
    return null;
  }

  const d = await res.json();
  if (!d.current) {
    console.error('[weather] open-meteo missing current field:', JSON.stringify(d));
    return null;
  }
  const c = d.current;
  const { condition, icon } = wmoToCondition(c.weather_code ?? 0);

  return {
    location: displayName,
    temperature: Math.round(c.temperature_2m),
    unit: 'C',
    condition,
    icon,
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    updatedAt: new Date().toISOString(),
  };
}

/** Geocoding via Open-Meteo's free geocoding API (no key needed). */
async function geocodeCity(name: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const d = await res.json();
    const result = d.results?.[0];
    if (!result) return null;
    return { lat: result.latitude, lon: result.longitude };
  } catch {
    return null;
  }
}

/** Maps WMO weather interpretation codes to human-readable text and an emoji. */
function wmoToCondition(code: number): { condition: string; icon: string } {
  if (code === 0)  return { condition: 'Clear sky',            icon: '☀️' };
  if (code === 1)  return { condition: 'Mainly clear',         icon: '🌤️' };
  if (code === 2)  return { condition: 'Partly cloudy',        icon: '⛅' };
  if (code === 3)  return { condition: 'Overcast',             icon: '☁️' };
  if (code === 45 || code === 48) return { condition: 'Fog',   icon: '🌫️' };
  if (code >= 51 && code <= 55) return { condition: 'Drizzle', icon: '🌦️' };
  if (code >= 56 && code <= 57) return { condition: 'Freezing drizzle', icon: '🌧️' };
  if (code >= 61 && code <= 65) return { condition: 'Rain',    icon: '🌧️' };
  if (code >= 66 && code <= 67) return { condition: 'Freezing rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'Snow',    icon: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'Rain showers', icon: '🌦️' };
  if (code >= 85 && code <= 86) return { condition: 'Snow showers', icon: '🌨️' };
  if (code === 95) return { condition: 'Thunderstorm',         icon: '⛈️' };
  if (code >= 96)  return { condition: 'Thunderstorm + hail',  icon: '⛈️' };
  return { condition: 'Unknown', icon: '' };
}

// ── OpenWeatherMap ────────────────────────────────────────────────────────────

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

// ── Home Assistant ────────────────────────────────────────────────────────────

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
