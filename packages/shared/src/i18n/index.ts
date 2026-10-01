/**
 * Translations shared by the website and the server.
 *
 * Texts are written in English directly in the code; other languages map each English text to its
 * translation (see ./fr). A missing translation falls back to the English text, so nothing ever breaks.
 * Variables use braces: translate('fr', 'Hello {name}', { name: 'Lyra' }).
 */
import { FR } from './fr';

export type Lang = 'en' | 'fr';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'fr';

const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, fr: FR };

export type Vars = Record<string, string | number | null | undefined>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/**
 * Translates an English text (with optional {variables}).
 * A context after "|" tells apart identical English words ("Dark|element" vs "Dark"); it is never shown.
 */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  const found = DICTIONARIES[lang]?.[text];
  if (found) return interpolate(found, vars);
  const bar = text.indexOf('|');
  return interpolate(bar > 0 ? text.slice(0, bar) : text, vars);
}

/** Singular or plural form, with {n} replaced by the count. French uses the singular for 0 and 1. */
export function translatePlural(lang: Lang, n: number, one: string, other: string, vars?: Vars): string {
  const singular = lang === 'fr' ? Math.abs(n) < 2 : Math.abs(n) === 1;
  return translate(lang, singular ? one : other, { n, ...vars });
}

// Templates ("Requires PalCMS {version}") compiled into regular expressions, to translate messages
// that were already filled in (e.g. an error sent by the server).
const templates = new Map<Lang, { re: RegExp; keys: string[]; target: string }[]>();

function compiled(lang: Lang) {
  let list = templates.get(lang);
  if (!list) {
    list = Object.entries(DICTIONARIES[lang])
      .filter(([src]) => /\{\w+\}/.test(src))
      .map(([src, target]) => {
        const keys: string[] = [];
        const pattern = src
          .split(/(\{\w+\})/)
          .map((part) => {
            const m = /^\{(\w+)\}$/.exec(part);
            if (m) {
              keys.push(m[1]);
              return '(.+?)';
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          })
          .join('');
        return { re: new RegExp(`^${pattern}$`, 's'), keys, target };
      });
    templates.set(lang, list);
  }
  return list;
}

/** Translates a finished message: exact match first, then templates with variables. */
export function translateMessage(lang: Lang, message: string): string {
  if (lang === 'en' || !message) return message;
  const exact = DICTIONARIES[lang][message];
  if (exact) return exact;
  for (const { re, keys, target } of compiled(lang)) {
    const m = re.exec(message);
    // Filled-in values are translated too when they are known texts (e.g. a setting name).
    if (m) return interpolate(target, Object.fromEntries(keys.map((k, i) => [k, DICTIONARIES[lang][m[i + 1]] ?? m[i + 1]])));
  }
  return message;
}

/** Locale used to format dates and numbers. */
export const LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR' };
