import { translate, translateMessage, translatePlural, type Lang, type Vars } from '@palcms/shared';
import { getSiteSettings } from './site';

/** Language of the site: used for everything the server writes itself (Discord, in-game messages). */
export const siteLang = (): Lang => getSiteSettings().language;

/** Translates a server text into the site language. */
export const tr = (text: string, vars?: Vars): string => translate(siteLang(), text, vars);

/** Translates an already filled-in English message (templates with variables are recognized). */
export const trMessage = (message: string): string => translateMessage(siteLang(), message);

export const trPlural = (n: number, one: string, other: string, vars?: Vars): string =>
  translatePlural(siteLang(), n, one, other, vars);
