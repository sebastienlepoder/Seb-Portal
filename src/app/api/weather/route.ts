import { NextResponse } from 'next/server';
import https from 'node:https';
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

// ── Native HTTPS helper (bypasses undici/fetch) ───────────────────────────────

function httpsGet(url: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { family: 4, headers: { Accept: 'application/json', 'User-Agent': 'lepoder-portal/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
  });
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

  let d: Record<string, unknown>;
  try {
    d = await httpsGet(url) as Record<string, unknown>;
  } catch (err) {
    console.error('[weather] open-meteo fetch error:', (err as Error).message);
    return null;
  }

  if (!d.current) {
    console.error('[weather] open-meteo missing current field:', JSON.stringify(d));
    return null;
  }
  const c = d.current as Record<string, number>;
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
    const d = await httpsGet(url, 5000) as { results?: { latitude: number; longitude: number }[] };
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

  let d: Record<string, unknown>;
  try {
    d = await httpsGet(url) as Record<string, unknown>;
  } catch (err) {
    console.error('[weather] openweathermap fetch error:', (err as Error).message);
    return null;
  }

  const main = d.main as Record<string, number>;
  const wind = d.wind as Record<string, number>;
  const weather = (d.weather as Record<string, unknown>[])?.[0] as Record<string, string> | undefined;

  return {
    location: d.name as string,
    temperature: Math.round(main.temp),
    unit: 'F',
    condition: weather?.description || 'Unknown',
    icon: weather?.icon ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png` : '',
    humidity: main.humidity,
    wind: Math.round(wind.speed),
    updatedAt: new Date().toISOString(),
  };
}

// ── Home Assistant ────────────────────────────────────────────────────────────

async function fetchHomeAssistant(): Promise<WeatherData | null> {
  const haUrl = process.env.HA_URL;
  const haToken = process.env.HA_TOKEN;
  const entity = process.env.HA_WEATHER_ENTITY || 'weather.home';

  if (!haUrl || !haToken) return null;

  // Home Assistant may be on HTTP or local network — use node https (or http for local)
  const useHttps = haUrl.startsWith('https');
  const mod = useHttps ? https : await import('node:http');
  const fullUrl = `${haUrl}/api/states/${entity}`;

  const d = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const req = (mod as typeof https).get(
      fullUrl,
      { headers: { Authorization: `Bearer ${haToken}`, Accept: 'application/json' } },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('Invalid JSON')); }
        });
      }
    );
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  }).catch((err) => {
    console.error('[weather] homeassistant fetch error:', (err as Error).message);
    return null;
  });

  if (!d) return null;

  const attrs = d.attributes as Record<string, unknown>;
  return {
    location: (attrs.friendly_name as string) || 'Home',
    temperature: Math.round(attrs.temperature as number),
    unit: attrs.temperature_unit === '°C' ? 'C' : 'F',
    condition: d.state as string,
    icon: '',
    humidity: attrs.humidity as number,
    wind: Math.round(attrs.wind_speed as number),
    updatedAt: new Date().toISOString(),
  };
}
