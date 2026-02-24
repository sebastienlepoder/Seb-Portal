'use client';

import { useState, useEffect } from 'react';
import { Cloud, Droplets, Wind, Thermometer, ChevronDown, ChevronUp } from 'lucide-react';
import type { WeatherData, WeatherForecastDay } from '@/types';

// ── Open-Meteo helpers ────────────────────────────────────────────────────────

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

function formatDay(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tmrw';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
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
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&wind_speed_unit=kmh&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const d = await res.json();
  if (!d.current) throw new Error('Open-Meteo: missing current field');

  const c = d.current;
  const { condition, icon } = wmoToCondition(c.weather_code ?? 0);

  const forecast: WeatherForecastDay[] = (d.daily?.time ?? []).map(
    (date: string, i: number) => {
      const { condition: dc, icon: di } = wmoToCondition(d.daily.weather_code[i] ?? 0);
      return {
        date: formatDay(date, i),
        high: Math.round(d.daily.temperature_2m_max[i]),
        low: Math.round(d.daily.temperature_2m_min[i]),
        condition: dc,
        icon: di,
      };
    }
  );

  return {
    location,
    temperature: Math.round(c.temperature_2m),
    unit: 'C',
    condition,
    icon,
    humidity: Math.round(c.relative_humidity_2m),
    wind: Math.round(c.wind_speed_10m),
    forecast,
    updatedAt: new Date().toISOString(),
  };
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const provider = process.env.NEXT_PUBLIC_WEATHER_PROVIDER || 'openmeteo';
    if (provider === 'openmeteo') {
      fetchOpenMeteoClient()
        .then(setWeather)
        .catch((e: Error) => setError(e.message));
    } else {
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
        <div className="h-20 bg-portal-border rounded" />
      </div>
    );
  }

  const hasForecast = weather.forecast && weather.forecast.length > 0;
  const speedUnit = weather.unit === 'C' ? 'km/h' : 'mph';

  return (
    <div className="bg-portal-card border border-portal-border rounded-xl p-4 hover:border-portal-accent/20 transition-all">

      {/* ── Main row: icon · info · label ── */}
      <div className="flex items-start gap-3">

        {/* Big icon */}
        <div className="flex-shrink-0 flex items-center justify-center w-14 h-14 -mt-1">
          {weather.icon.startsWith('http') ? (
            <img src={weather.icon} alt={weather.condition} className="w-14 h-14" />
          ) : weather.icon ? (
            <span className="text-5xl leading-none select-none">{weather.icon}</span>
          ) : (
            <Thermometer className="h-10 w-10 text-portal-accent" />
          )}
        </div>

        {/* Temp + condition + stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-3xl font-bold text-portal-text leading-none">
                {weather.temperature}°{weather.unit}
              </div>
              <div className="text-sm text-portal-text-dim capitalize mt-0.5">{weather.condition}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] text-portal-muted uppercase tracking-wider font-medium">Weather</div>
              <div className="text-xs text-portal-muted mt-0.5">{weather.location}</div>
            </div>
          </div>

          {/* Stats + expand toggle */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3">
              <div className="flex items-center gap-1 text-xs text-portal-muted">
                <Droplets className="h-3 w-3" />
                {weather.humidity}%
              </div>
              <div className="flex items-center gap-1 text-xs text-portal-muted">
                <Wind className="h-3 w-3" />
                {weather.wind} {speedUnit}
              </div>
            </div>
            {hasForecast && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-xs text-portal-muted hover:text-portal-text transition-colors"
                title={expanded ? 'Hide forecast' : '7-day forecast'}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 7-day forecast (horizontal) ── */}
      {expanded && hasForecast && (
        <div className="mt-3 pt-3 border-t border-portal-border">
          <div className="grid grid-cols-7 gap-1">
            {weather.forecast!.slice(0, 7).map((day) => (
              <div key={day.date} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-portal-muted font-medium truncate w-full text-center">
                  {day.date}
                </span>
                <span className="text-xl leading-none select-none">{day.icon}</span>
                <span className="text-xs text-portal-text font-semibold">{day.high}°</span>
                <span className="text-[10px] text-portal-muted">{day.low}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
