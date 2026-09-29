/**
 * Extensions : plugins et thèmes installés depuis le market (palcms.online) ou depuis un fichier .zip.
 * Le format d'un paquet est décrit dans sdk/README.md.
 */
import type { FeatureHost, FeatureRoute, HostEventName, HostEvents, HostMigration } from './features';

export type ExtensionType = 'plugin' | 'theme';

export const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const EXTENSION_VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Réglage d'un thème (ou d'un plugin), modifiable dans le panel. */
export interface ExtensionSettingDef {
  key: string;
  type: 'color' | 'text' | 'textarea' | 'image' | 'toggle' | 'select' | 'number';
  label: string;
  description?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export type ExtensionSettingValues = Record<string, string | number | boolean>;

/** Contenu de palcms.json, à la racine du paquet. */
export interface ExtensionManifest {
  id: string;
  type: ExtensionType;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /** Versions de PalCMS compatibles, ex. ">=1.0.1" ou ">=1.0.1 <2.0.0". */
  palcms?: string;
  /** Image du paquet (ex. "assets/icon.png"). */
  icon?: string;
  settings?: ExtensionSettingDef[];
}

export type ExtensionSource = 'market' | 'upload' | 'local';

/** Extension installée, telle que la voit le panel. */
export interface InstalledExtension {
  id: string;
  type: ExtensionType;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage: string | null;
  iconUrl: string | null;
  enabled: boolean;
  /** Thème actuellement utilisé par le site. */
  active: boolean;
  /** Paquet signé par le market officiel. */
  verified: boolean;
  source: ExtensionSource;
  installedAt: number;
  compatible: boolean;
  palcms: string | null;
  hasServer: boolean;
  hasWeb: boolean;
  hasCss: boolean;
  settings: ExtensionSettingDef[];
  /** Dernière erreur au chargement du plugin (null si tout va bien). */
  error: string | null;
}

/** Ressource du catalogue du market (format de l'API décrit dans docs/market-api.md). */
export interface MarketResource {
  id: string;
  type: ExtensionType;
  name: string;
  summary: string;
  author: string;
  version: string;
  iconUrl?: string;
  screenshots?: string[];
  downloads?: number;
  price?: number;
  url?: string;
  palcms?: string;
  download: string;
  sha256: string;
  signature: string;
  updatedAt?: string;
}

/** Ressource du market vue depuis un CMS installé. */
export interface MarketEntry extends MarketResource {
  installed: string | null;
  update: boolean;
  compatible: boolean;
}

/** Extensions à charger dans le navigateur, envoyées avec le bootstrap. */
export interface BootExtension {
  id: string;
  version: string;
  /** Change à chaque installation : sert à invalider le cache du navigateur. */
  rev: string;
  web: boolean;
  css: boolean;
}

export interface BootExtensions {
  theme: (BootExtension & { settings: ExtensionSettingValues }) | null;
  plugins: BootExtension[];
}

/** Ce que reçoit la fonction exportée par server.js d'un plugin. */
export interface PluginServerApi {
  id: string;
  version: string;
  host: FeatureHost;
  /** Réglages propres au plugin (rangés sous "plugin.<id>."). */
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
  /** Valeurs des réglages déclarés dans palcms.json et modifiés dans le panel (jamais envoyées au navigateur). */
  config(): ExtensionSettingValues;
  /** Route servie sous /api/plugins/<id>/<path>. */
  route(route: FeatureRoute): void;
  /** Migrations SQL, jouées une seule fois (identifiants rangés sous "plugin:<id>:"). */
  migrate(list: HostMigration[]): void;
  on<E extends HostEventName>(event: E, fn: (data: HostEvents[E]) => void): void;
  every(ms: number, fn: () => unknown): void;
  onStop(fn: () => void): void;
  log(message: string): void;
}

/** Compare deux versions "x.y.z". */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Vérifie une contrainte de version simple : ">=1.0.1", "<2.0.0", "1.0.1" ou plusieurs séparées par des espaces. */
export function satisfiesVersion(version: string, range: string | null | undefined): boolean {
  if (!range || !range.trim() || range.trim() === '*') return true;
  return range
    .trim()
    .split(/\s+/)
    .every((part) => {
      const m = /^(>=|<=|>|<|=|\^)?v?(\d+(?:\.\d+){0,2})$/.exec(part);
      if (!m) return false;
      const d = compareVersions(version, m[2]);
      switch (m[1]) {
        case '>=':
          return d >= 0;
        case '<=':
          return d <= 0;
        case '>':
          return d > 0;
        case '<':
          return d < 0;
        case '^':
          return d >= 0 && Number(version.split('.')[0]) === Number(m[2].split('.')[0]);
        default:
          return d === 0;
      }
    });
}
