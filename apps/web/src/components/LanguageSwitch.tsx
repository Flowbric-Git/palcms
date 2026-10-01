import { LANGS } from '@palcms/shared';
import { cx } from './ui';
import { lang, setLang, t } from '../lib/i18n';

/** EN / FR buttons: the choice is saved in this browser and the page reloads in the new language. */
export function LanguageSwitch({ className }: { className?: string }) {
  const current = lang();
  return (
    <div className={cx('flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold dark:bg-slate-800', className)} role="group" aria-label={t('Language')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          lang={l.id}
          title={l.label}
          aria-pressed={current === l.id}
          onClick={() => current !== l.id && setLang(l.id)}
          className={cx(
            'rounded-md px-2 py-1 uppercase transition',
            current === l.id ? 'bg-white text-slate-900 shadow dark:bg-slate-950 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
          )}
        >
          {l.id}
        </button>
      ))}
    </div>
  );
}
