import crypto from 'node:crypto';
import type { ExternalServer, PalworldSetup, ServerMode, SiteSettings } from '@palcms/shared';
import { settings } from '../db';
import { config } from '../config';

export const DEFAULT_SITE: SiteSettings = {
  name: 'Mon serveur Palworld',
  tagline: 'Un serveur communautaire Palworld',
  accentColor: '#22c55e',
  defaultTheme: 'dark',
  allowThemeToggle: true,
  discordUrl: '',
  logoUrl: '',
  bannerUrl: '',
  heroTitle: 'Bienvenue sur notre serveur Palworld',
  heroText: 'Rejoins la communauté, capture des Pals et grimpe dans le classement !',
  footerText: '',
  serverAddress: '',
  menu: [
    { label: 'Accueil', url: '/' },
    { label: 'Actualités', url: '/actualites' },
    { label: 'Classement', url: '/classement' },
    { label: 'Règles', url: '/p/regles' },
    { label: 'Rejoindre', url: '/p/rejoindre' },
  ],
  registration: { steam: true, email: true },
};

export function getSiteSettings(): SiteSettings {
  const stored = settings.get<Partial<SiteSettings>>('site', {});
  return { ...DEFAULT_SITE, ...stored, registration: { ...DEFAULT_SITE.registration, ...stored.registration } };
}

export function saveSiteSettings(value: SiteSettings): void {
  settings.set('site', value);
}

export function isSetupDone(): boolean {
  return settings.get('setup.done', false);
}

export function getPalworldConfig(): PalworldSetup | null {
  return settings.get<PalworldSetup | null>('palworld', null);
}

export function savePalworldConfig(value: PalworldSetup): void {
  settings.set('palworld', value);
}

// Serveur installé ou externe

/**
 * - managed  : serveur installé et géré par PalCMS sur ce VPS (palctl, service systemd, sauvegardes…)
 * - external : serveur existant (sur ce VPS ou ailleurs), connecté par son API REST
 * - none     : site seul, aucun serveur connecté pour le moment
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

/** Où joindre l'API REST du serveur Palworld (null : aucun serveur connecté). */
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

/** Adresse affichée aux joueurs : réglage du site, sinon adresse déduite du serveur connecté. */
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

/** Sel secret utilisé pour dériver les identifiants publics des joueurs. */
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
