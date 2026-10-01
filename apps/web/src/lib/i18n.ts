/**
 * Language of the interface. Texts are written in English in the code and translated with t().
 * The language is chosen per browser (button EN / FR); by default it follows the site language.
 * Changing it reloads the page, so t() can stay a plain function usable everywhere.
 */
import { LOCALES, isLang, translate, translateMessage, translatePlural, type Lang, type Vars } from '@palcms/shared';

const KEY = 'palcms-lang';

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

let current: Lang = stored() ?? 'en';

/** Sets the language once the site settings are known (the browser's own choice wins). */
export function initLang(siteLang?: Lang): void {
  current = stored() ?? siteLang ?? 'en';
  document.documentElement.lang = current;
}

export const lang = (): Lang => current;

/** Locale for dates and numbers. */
export const locale = (): string => LOCALES[current];

/** Translates an English text, with optional {variables}. */
export const t = (text: string, vars?: Vars): string => translate(current, text, vars);

/** Singular / plural: tn(3, '{n} player', '{n} players'). */
export const tn = (n: number, one: string, other: string, vars?: Vars): string => translatePlural(current, n, one, other, vars);

/** Translates a message that was already filled in (e.g. an error sent by the server). */
export const tm = (message: string): string => translateMessage(current, message);

/** Number formatted for the current language. */
export const num = (n: number): string => n.toLocaleString(locale());

/** Saves the browser's language and reloads the page to apply it everywhere. */
export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: the choice only lasts for this page */
  }
  location.reload();
}
