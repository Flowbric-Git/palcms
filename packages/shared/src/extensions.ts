/**
 * Extensions: plugins and themes installed from the market (palcms.online) or from a .zip file.
 * The package format is described in sdk/README.md.
 */
import type { FeatureHost, FeatureRoute, HostEventName, HostEvents, HostMigration } from './features';

export type ExtensionType = 'plugin' | 'theme';

export const EXTENSION_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const EXTENSION_VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Theme (or plugin) setting, editable in the panel. */
export interface ExtensionSettingDef {
  key: string;
  type: 'color' | 'text' | 'textarea' | 'image' | 'toggle' | 'select' | 'number';
  label: string;
  description?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export type ExtensionSettingValues = Record<string, string | number | boolean>;

/** Menu link locked by a theme: always present, first in the menu, cannot be moved or deleted in the panel. */
export interface ThemeMenuLink {
  /** Internal path, e.g. "/news". */
  url: string;
  label: string;
  /** Label used when the site language is French. */
  labelFr?: string;
}

/** Contents of palcms.json, at the root of the package. */
export interface ExtensionManifest {
  id: string;
  type: ExtensionType;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /** Compatible PalCMS versions, e.g. ">=1.0.1" or ">=1.0.1 <2.0.0". */
  palcms?: string;
  /** Package image (e.g. "assets/icon.png"). */
  icon?: string;
  settings?: ExtensionSettingDef[];
  /** Themes only: links of the site menu the theme lays out itself (the rest of the menu stays editable). */
  menu?: { fixed: ThemeMenuLink[] };
}

export type ExtensionSource = 'market' | 'upload' | 'local';

/** Installed extension, as seen by the panel. */
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
  /** Theme currently used by the site. */
  active: boolean;
  /** Package signed by the official market. */
  verified: boolean;
  source: ExtensionSource;
  installedAt: number;
  compatible: boolean;
  palcms: string | null;
  hasServer: boolean;
  hasWeb: boolean;
  hasCss: boolean;
  settings: ExtensionSettingDef[];
  /** Last plugin loading error (null when everything is fine). */
  error: string | null;
}

/** Market catalog resource (API format described in docs/market-api.md). */
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

/** Market resource as seen from an installed CMS. */
export interface MarketEntry extends MarketResource {
  installed: string | null;
  update: boolean;
  compatible: boolean;
}

/** Extensions to load in the browser, sent with the bootstrap. */
export interface BootExtension {
  id: string;
  version: string;
  /** Changes on every install: used to bust the browser cache. */
  rev: string;
  web: boolean;
  css: boolean;
}

export interface BootExtensions {
  /** menuFixed: locked menu links of the theme, labels already in the site language. */
  theme: (BootExtension & { settings: ExtensionSettingValues; menuFixed?: { url: string; label: string }[] }) | null;
  plugins: BootExtension[];
}

/** What the function exported by a plugin's server.js receives. */
export interface PluginServerApi {
  id: string;
  version: string;
  host: FeatureHost;
  /** Plugin's own settings (stored under "plugin.<id>."). */
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
  /** Values of the settings declared in palcms.json and edited in the panel (never sent to the browser). */
  config(): ExtensionSettingValues;
  /** Route served under /api/plugins/<id>/<path>. */
  route(route: FeatureRoute): void;
  /** SQL migrations, run once (ids stored under "plugin:<id>:"). */
  migrate(list: HostMigration[]): void;
  on<E extends HostEventName>(event: E, fn: (data: HostEvents[E]) => void): void;
  every(ms: number, fn: () => unknown): void;
  onStop(fn: () => void): void;
  log(message: string): void;
}

/** Compares two "x.y.z" versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Checks a simple version constraint: ">=1.0.1", "<2.0.0", "1.0.1" or several separated by spaces. */
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
