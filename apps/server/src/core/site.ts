import crypto from 'node:crypto';
import type { ExternalServer, Lang, PalworldSetup, ServerMode, SiteSettings } from '@palcms/shared';
import { settings } from '../db';
import { config } from '../config';

/** Default site settings, in the language chosen at setup. */
export function defaultSite(lang: Lang): SiteSettings {
  const fr = lang === 'fr';
  return {
    name: fr ? 'Mon serveur Palworld' : 'My Palworld server',
    tagline: fr ? 'Un serveur communautaire Palworld' : 'A community Palworld server',
    accentColor: '#22c55e',
    defaultTheme: 'dark',
    allowThemeToggle: true,
    language: lang,
    discordUrl: '',
    logoUrl: '',
    bannerUrl: '',
    heroTitle: fr ? 'Bienvenue sur notre serveur Palworld' : 'Welcome to our Palworld server',
    heroText: fr
      ? 'Rejoins la communauté, capture des Pals et grimpe dans le classement !'
      : 'Join the community, catch Pals and climb the leaderboard!',
    footerText: '',
    serverAddress: '',
    joinUrl: fr ? '/p/rejoindre' : '/p/join',
    menu: fr
      ? [
          { label: 'Accueil', url: '/' },
          { label: 'Actualités', url: '/news' },
          { label: 'Classement', url: '/leaderboard' },
          { label: 'Règles', url: '/p/regles' },
          { label: 'Rejoindre', url: '/p/rejoindre' },
        ]
      : [
          { label: 'Home', url: '/' },
          { label: 'News', url: '/news' },
          { label: 'Leaderboard', url: '/leaderboard' },
          { label: 'Rules', url: '/p/rules' },
          { label: 'Join', url: '/p/join' },
        ],
    registration: { steam: true, email: true },
  };
}

export function isSetupDone(): boolean {
  return settings.get('setup.done', false);
}

/** Language before any choice is saved: French for sites installed before 1.1.0 (which were French only). */
const legacyLang = (): Lang => (isSetupDone() ? 'fr' : 'en');

export function storedLanguage(): Lang {
  return settings.get<Partial<SiteSettings>>('site', {}).language ?? legacyLang();
}

// Menu links locked by the active theme (provided by the extensions store, which depends on this module).
export interface FixedMenuLink {
  url: string;
  label: string;
}
let fixedMenuProvider: () => FixedMenuLink[] = () => [];
export function setFixedMenuProvider(fn: () => FixedMenuLink[]): void {
  fixedMenuProvider = fn;
}

/**
 * Puts the theme's locked links first, in the theme's order, then the other links as they were.
 * A locked link keeps the label already in the menu when there is one.
 */
export function applyFixedMenu(menu: SiteSettings['menu'], fixed: FixedMenuLink[] = fixedMenuProvider()): SiteSettings['menu'] {
  if (fixed.length === 0) return menu;
  const locked = fixed.map((f) => ({ label: menu.find((m) => m.url === f.url)?.label ?? f.label, url: f.url }));
  const urls = new Set(fixed.map((f) => f.url));
  return [...locked, ...menu.filter((m) => !urls.has(m.url))].slice(0, 20);
}

export function getSiteSettings(): SiteSettings {
  const stored = settings.get<Partial<SiteSettings>>('site', {});
  const lang = stored.language ?? legacyLang();
  const base = defaultSite(lang);
  const site = {
    ...base,
    ...stored,
    language: lang,
    registration: { ...base.registration, ...stored.registration },
  };
  return { ...site, menu: applyFixedMenu(site.menu) };
}

export function saveSiteSettings(value: SiteSettings): void {
  settings.set('site', value);
}

/**
 * Rewrites or removes the links to a page when it is renamed or deleted: the menu links, and the "Join" button
 * address of the home page (emptied when its page is deleted). Return null from `change` to remove a menu link.
 */
export function updateMenuLinks(change: (link: SiteSettings['menu'][number]) => SiteSettings['menu'][number] | null): void {
  const site = getSiteSettings();
  const join = change({ label: '', url: site.joinUrl });
  saveSiteSettings({ ...site, menu: site.menu.flatMap((m) => change(m) ?? []), joinUrl: join?.url ?? '' });
}

// Old French URLs of the public site, replaced by English ones in 1.1.0 (the old ones still redirect).
export const LEGACY_PATHS: Record<string, string> = {
  '/actualites': '/news',
  '/classement': '/leaderboard',
  '/carte': '/map',
  '/guildes': '/guilds',
  '/evenements': '/events',
  '/disponibilite': '/uptime',
  '/signaler': '/report',
  '/connexion': '/login',
  '/inscription': '/register',
  '/profil': '/profile',
};

/** Rewrites the menu links of a site installed before 1.1.0 to the new URLs (once). */
export function migrateLegacyMenu(): void {
  if (settings.get('site.menu.englishPaths', false)) return;
  const stored = settings.get<Partial<SiteSettings> | null>('site', null);
  if (stored?.menu) {
    const menu = stored.menu.map((m) => ({ ...m, url: LEGACY_PATHS[m.url] ?? m.url }));
    settings.set('site', { ...stored, menu });
  }
  settings.set('site.menu.englishPaths', true);
}

export function getPalworldConfig(): PalworldSetup | null {
  return settings.get<PalworldSetup | null>('palworld', null);
}

export function savePalworldConfig(value: PalworldSetup): void {
  settings.set('palworld', value);
}

// Installed or external server

/**
 * - managed : server installed and run by PalCMS on this VPS (palctl, systemd service, backups…)
 * - external: existing server (on this VPS or elsewhere), connected through its REST API
 * - none    : website only, no server connected yet
 */
export function getServerMode(): ServerMode {
  return settings.get<ServerMode>('server.mode', getPalworldConfig() ? 'managed' : 'none');
}

export function setServerMode(mode: ServerMode): void {
  settings.set('server.mode', mode);
}

export function isManaged(): boolean {
  return getServerMode() === 'managed';
}

export function getExternalServer(): ExternalServer | null {
  return getServerMode() === 'external' ? settings.get<ExternalServer | null>('palworld.external', null) : null;
}

export function saveExternalServer(value: ExternalServer | null): void {
  if (value) settings.set('palworld.external', value);
  else settings.delete('palworld.external');
}

export interface PalworldConnection {
  host: string;
  port: number;
  password: string;
}

/** Where to reach the Palworld server REST API (null: no server connected). */
export function palworldConnection(): PalworldConnection | null {
  const mode = getServerMode();
  if (mode === 'managed') {
    const pal = getPalworldConfig();
    return pal ? { host: config.palworldApiHost, port: pal.restApiPort, password: pal.adminPassword } : null;
  }
  if (mode === 'external') {
    const ext = getExternalServer();
    return ext ? { host: ext.apiHost, port: ext.apiPort, password: ext.adminPassword } : null;
  }
  return null;
}

/** Address shown to players: the site setting, otherwise derived from the connected server. */
export function serverAddress(): string {
  const site = getSiteSettings();
  if (site.serverAddress) return site.serverAddress;
  const mode = getServerMode();
  if (mode === 'external') {
    const ext = getExternalServer();
    return ext ? ext.publicAddress || `${ext.apiHost}:8211` : '';
  }
  if (mode === 'none') return '';
  const pal = getPalworldConfig();
  const host = new URL(config.publicUrl).hostname;
  return pal ? `${host}:${pal.port}` : host;
}

/** Secret salt used to derive public player ids. */
export function secretSalt(): string {
  let salt = settings.get<string | null>('secret.playerSalt', null);
  if (!salt) {
    salt = crypto.randomBytes(32).toString('hex');
    settings.set('secret.playerSalt', salt);
  }
  return salt;
}

export function steamApiKey(): string {
  return settings.get<string>('secret.steamApiKey', '');
}
