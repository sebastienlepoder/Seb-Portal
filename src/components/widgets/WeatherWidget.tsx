'use client';

import { useState, useEffect } from 'react';
import { Cloud, Droplets, Wind, Thermometer } from 'lucide-react';
import type { WeatherData } from '@/types';

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/weather')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setWeather(data.data);
        else setError(data.error);
      })
      .catch(() => setError('Failed to load weather'));
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
          // Open-Meteo returns emoji icons
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
