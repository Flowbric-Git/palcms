import type { SiteSettings } from '@palcms/shared';

const KEY = 'palcms-theme';
export type ThemeChoice = 'dark' | 'light';

function readChoice(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

/** Readable text color (black or white) on the accent color. */
function contrastColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.35 ? '#0b1120' : '#ffffff';
}

export function resolveTheme(site: Pick<SiteSettings, 'defaultTheme' | 'allowThemeToggle'>): ThemeChoice {
  const choice = site.allowThemeToggle ? readChoice() : null;
  if (choice) return choice;
  if (site.defaultTheme === 'system') return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  return site.defaultTheme;
}

export function applyTheme(site: Pick<SiteSettings, 'defaultTheme' | 'allowThemeToggle' | 'accentColor'>, force?: ThemeChoice) {
  const theme = force ?? resolveTheme(site);
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.setProperty('--accent', site.accentColor);
  document.documentElement.style.setProperty('--accent-fg', contrastColor(site.accentColor));
  return theme;
}

export function saveThemeChoice(theme: ThemeChoice) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the choice will not be remembered */
  }
}
