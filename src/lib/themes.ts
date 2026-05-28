export interface ThemeDef {
  id: string;
  label: string;
  /** Swatch colors for the picker: [bg, card, accent]. */
  swatch: [string, string, string];
}

export const THEMES: ThemeDef[] = [
  { id: 'default', label: 'Indigo (default)', swatch: ['#0a0a0f', '#12121a', '#6366f1'] },
  { id: 'light', label: 'Light', swatch: ['#f8fafc', '#ffffff', '#4f46e5'] },
  { id: 'slate', label: 'Slate', swatch: ['#0f172a', '#1e293b', '#38bdf8'] },
  { id: 'catppuccin', label: 'Catppuccin', swatch: ['#1e1e2e', '#313244', '#cba6f7'] },
  { id: 'ares', label: 'Ares', swatch: ['#0c0a0a', '#1a1212', '#ef4444'] },
  { id: 'mono', label: 'Mono', swatch: ['#0c0c0c', '#171717', '#d4d4d4'] },
];

export const THEME_STORAGE_KEY = 'portal:theme';
export const DEFAULT_THEME = 'default';

export function isValidTheme(id: string | null | undefined): id is string {
  return !!id && THEMES.some((t) => t.id === id);
}

/** Apply a theme to <html> and persist it. Safe to call client-side only. */
export function applyTheme(id: string): void {
  if (typeof document === 'undefined') return;
  const theme = isValidTheme(id) ? id : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', theme);
  // Light theme drops the `dark` class so any dark: utilities relax.
  document.documentElement.classList.toggle('dark', theme !== 'light');
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

export function getStoredTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Inline script body that sets data-theme before first paint (no FOUC). */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t);if(t==='light')document.documentElement.classList.remove('dark');}catch(e){}})();`;
