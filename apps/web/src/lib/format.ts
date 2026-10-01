import { locale, t } from './i18n';

// Formatters are created on first use, once the language is known.
let fmt: { date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat } | null = null;
const formats = () =>
  (fmt ??= {
    date: new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
    dateTime: new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }),
  });

export const formatDate = (ts: number | null | undefined) => (ts ? formats().date.format(ts) : '—');
export const formatDateTime = (ts: number | null | undefined) => (ts ? formats().dateTime.format(ts) : '—');

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')}`;
  return t('{d} d {h} h', { d: Math.floor(h / 24), h: h % 24 });
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return t('{n} h ago', { n: Math.floor(s / 3600) });
  return t('{n} d ago', { n: Math.floor(s / 86400) });
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return t('{n} GB', { n: (n / 1024 ** 3).toFixed(1) });
  return t('{n} MB', { n: Math.round(n / 1024 ** 2) });
}
