'use client';

import { useState, useEffect } from 'react';
import { Cloud, Droplets, Wind, Thermometer } from 'lucide-react';
import type { WeatherData } from '@/types';

// ── Open-Meteo client-side fetch (no API key needed) ─────────────────────────

function wmoToCondition(code: number): { condition: string; icon: string } {
  if (code === 0)  return { condition: 'Clear sky',           icon: '☀️' };
  if (code === 1)  return { condition: 'Mainly clear',        icon: '🌤️' };
  if (code === 2)  return { condition: 'Partly cloudy',       icon: '⛅' };
  if (code === 3)  return { condition: 'Overcast',            icon: '☁️' };
  if (code === 45 || code === 48) return { condition: 'Fog',  icon: '🌫️' };
  if (code >= 51 && code <= 55) return { condition: 'Drizzle', icon: '🌦️' };
  if (code >= 56 && code <= 57) return { condition: 'Freezing drizzle', icon: '🌧️' };
  if (code >= 61 && code <= 65) return { condition: 'Rain',   icon: '🌧️' };
  if (code >= 66 && code <= 67) return { condition: 'Freezing rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { condition: 'Snow',   icon: '❄️' };
  if (code >= 80 && code <= 82) return { condition: 'Rain showers', icon: '🌦️' };
  if (code >= 85 && code <= 86) return { condition: 'Snow showers', icon: '🌨️' };
  if (code === 95) return { condition: 'Thunderstorm',        icon: '⛈️' };
  if (code >= 96)  return { condition: 'Thunderstorm + hail', icon: '⛈️' };
  return { condition: 'Unknown', icon: '' };
}

async function fetchOpenMeteoClient(): Promise<WeatherData> {
  const lat = process.env.NEXT_PUBLIC_WEATHER_LAT;
  const lon = process.env.NEXT_PUBLIC_WEATHER_LON;
  const location = process.env.NEXT_PUBLIC_WEATHER_LOCATION || `${lat},${lon}`;

  if (!lat || !lon) throw new Error('NEXT_PUBLIC_WEATHER_LAT/LON not set');

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&wind_speed_unit=kmh&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const d = await res.json();
  if (!d.current) throw new Error('Open-Meteo: missing current field');

  const c = d.current;
  const { condition, icon } = wmoToCondition(c.weather_code ?? 0);

  return {
    location,
    temperature: Math.round(c.temperature_2m),
    unit: 'C',
    condition,
    icon,
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    updatedAt: new Date().toISOString(),
  };
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const provider = process.env.NEXT_PUBLIC_WEATHER_PROVIDER || 'openmeteo';

    if (provider === 'openmeteo') {
      // Call Open-Meteo directly from the browser — no server-side fetch needed
      fetchOpenMeteoClient()
        .then(setWeather)
        .catch((e: Error) => setError(e.message));
    } else {
      // OpenWeatherMap / HomeAssistant — go through the server route (credentials stay server-side)
      fetch('/api/weather')
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) setWeather(data.data);
          else setError(data.error);
        })
        .catch(() => setError('Failed to load weather'));
    }
  }, []);

  if (error) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-portal-muted text-sm mb-1">
          <Cloud className="h-4 w-4" />
          <span>Weather unavailable</span>
        </div>
        <p className="text-[10px] text-portal-muted/60 font-mono break-all">{error}</p>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-portal-card border border-portal-border rounded-xl p-4 animate-pulse">
        <div className="h-16 bg-portal-border rounded" />
      </div>
    );
  }

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/20 transition-all">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-portal-muted uppercase tracking-wider mb-1">Weather</div>
          <div className="text-2xl font-bold text-portal-text">
            {weather.temperature}°{weather.unit}
          </div>
          <div className="text-sm text-portal-text-dim capitalize">{weather.condition}</div>
          <div className="text-xs text-portal-muted mt-1">{weather.location}</div>
        </div>
        {weather.icon.startsWith('http') ? (
          <img src={weather.icon} alt={weather.condition} className="w-14 h-14 -mt-2" />
        ) : weather.icon ? (
          <span className="text-5xl leading-none -mt-2 select-none">{weather.icon}</span>
        ) : (
          <Thermometer className="h-10 w-10 text-portal-accent" />
        )}
      </div>
      <div className="flex gap-4 mt-3 pt-3 border-t border-portal-border">
        <div className="flex items-center gap-1 text-xs text-portal-muted">
          <Droplets className="h-3 w-3" />
          {weather.humidity}%
        </div>
        <div className="flex items-center gap-1 text-xs text-portal-muted">
          <Wind className="h-3 w-3" />
          {weather.wind} {weather.unit === 'C' ? 'km/h' : 'mph'}
        </div>
      </div>
    </div>
  );
}
