import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useApp } from '../lib/app';
import { applyTheme, resolveTheme, saveThemeChoice } from '../lib/theme';

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
      title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
      aria-label="Changer de thème"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
