import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from '../lib/app';
import { applyTheme, resolveTheme, saveThemeChoice } from '../lib/theme';
import { t } from '../lib/i18n';

export function ThemeToggle() {
  const { boot } = useApp();
  const [theme, setTheme] = useState(() => resolveTheme(boot.site));
  if (!boot.site.allowThemeToggle) return null;
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveThemeChoice(next);
    applyTheme(boot.site, next);
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
      title={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
      aria-label={t('Change theme')}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
