import { Component, type ComponentType, type ReactNode } from 'react';
import type { BootExtensions, ExtensionSettingValues, Permission } from '@palcms/shared';
import { api, url } from './api';

/** Emplacements où les plugins et thèmes ajoutent des blocs. */
export const WIDGET_SLOTS = ['layout.top', 'layout.bottom', 'home.top', 'home.bottom', 'footer', 'profile'] as const;
export type WidgetSlot = (typeof WIDGET_SLOTS)[number];

/** Parties du site qu'un thème peut remplacer. */
export const OVERRIDE_SLOTS = ['header', 'footer', 'home', 'home.hero'] as const;
export type OverrideSlot = (typeof OVERRIDE_SLOTS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export interface ExtPage {
  ext: string;
  path: string;
  component: AnyComponent;
  /** false : page affichée sans l'en-tête ni le pied de page du site. */
  layout: boolean;
}

export interface ExtAdminPage {
  ext: string;
  path: string;
  label: string;
  component: AnyComponent;
  permission?: Permission;
}

interface Registry {
  pages: ExtPage[];
  adminPages: ExtAdminPage[];
  widgets: Record<string, { ext: string; component: AnyComponent; order: number }[]>;
  overrides: Partial<Record<OverrideSlot, { ext: string; component: AnyComponent }>>;
  themeSettings: ExtensionSettingValues;
  errors: { ext: string; message: string }[];
}

export const registry: Registry = { pages: [], adminPages: [], widgets: {}, overrides: {}, themeSettings: {}, errors: [] };

/** Ce que reçoit la fonction exportée par web.js. */
export interface ExtensionRegistrar {
  id: string;
  version: string;
  type: 'plugin' | 'theme';
  /** Réglages de l'extension (valeurs choisies dans le panel). */
  settings: ExtensionSettingValues;
  /** Appels à l'API du plugin : pal.api.get('items') -> /api/plugins/<id>/items */
  api: {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body: unknown): Promise<T>;
    del<T>(path: string): Promise<T>;
  };
  /** URL d'un fichier du dossier assets/ du paquet. */
  asset(path: string): string;
  page(def: { path: string; component: AnyComponent; layout?: boolean }): void;
  adminPage(def: { path: string; label: string; component: AnyComponent; permission?: Permission }): void;
  widget(slot: WidgetSlot, component: AnyComponent, order?: number): void;
  override(slot: OverrideSlot, component: AnyComponent): void;
}

function registrar(ext: { id: string; version: string; rev: string }, type: 'plugin' | 'theme', settings: ExtensionSettingValues): ExtensionRegistrar {
  const p = (path: string) => `plugins/${ext.id}/${path.replace(/^\/+/, '')}`;
  return {
    id: ext.id,
    version: ext.version,
    type,
    settings,
    api: {
      get: (path) => api.get(p(path)),
      post: (path, body) => api.post(p(path), body),
      put: (path, body) => api.put(p(path), body),
      del: (path) => api.del(p(path)),
    },
    asset: (path) => url(`extensions/${ext.id}/assets/${path.replace(/^\/+|^assets\//g, '')}?v=${ext.rev}`),
    page: ({ path, component, layout = true }) => {
      registry.pages.push({ ext: ext.id, path: path.replace(/^\/+/, ''), component, layout });
    },
    adminPage: ({ path, label, component, permission }) => {
      registry.adminPages.push({ ext: ext.id, path: path.replace(/^\/+/, ''), label, component, permission });
    },
    widget: (slot, component, order = 0) => {
      (registry.widgets[slot] ??= []).push({ ext: ext.id, component, order });
      registry.widgets[slot].sort((a, b) => a.order - b.order);
    },
    override: (slot, component) => {
      // Seul le thème actif remplace les parties du site : deux plugins ne peuvent pas se battre pour l'en-tête.
      if (type !== 'theme') {
        console.warn(`[extensions] ${ext.id} : seul un thème peut remplacer "${slot}"`);
        return;
      }
      registry.overrides[slot] = { ext: ext.id, component };
    },
  };
}

function addStylesheet(id: string, rev: string, theme: boolean) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url(`extensions/${id}/style.css?v=${rev}`);
  link.dataset.palcmsExt = id;
  if (theme) link.dataset.palcmsTheme = '';
  document.head.appendChild(link);
}

/** Réglages du thème exposés au CSS : var(--theme-<clé>). */
function applyThemeVariables(values: ExtensionSettingValues) {
  const root = document.documentElement;
  for (const [key, v] of Object.entries(values)) {
    if (typeof v === 'boolean') root.style.setProperty(`--theme-${key}`, v ? '1' : '0');
    else if (typeof v === 'number') root.style.setProperty(`--theme-${key}`, String(v));
    else if (/^(https?:\/\/|\/|uploads\/)/.test(v)) root.style.setProperty(`--theme-${key}`, `url("${v.replace(/["\\\n\r]/g, '')}")`);
    else if (!/[;{}]/.test(v)) root.style.setProperty(`--theme-${key}`, v);
  }
}

let loading: Promise<void> | null = null;

/** Charge le thème actif puis les plugins activés, avant le premier affichage du site (une seule fois). */
export function loadExtensions(boot: BootExtensions | undefined): Promise<void> {
  if (!boot || (!boot.theme && boot.plugins.length === 0)) return Promise.resolve();
  loading ??= load(boot);
  return loading;
}

async function load(boot: BootExtensions): Promise<void> {
  const { installSdk } = await import('./sdk');
  installSdk();

  const list = [
    ...(boot.theme ? [{ ...boot.theme, type: 'theme' as const }] : []),
    ...boot.plugins.map((p) => ({ ...p, settings: {} as ExtensionSettingValues, type: 'plugin' as const })),
  ];
  if (boot.theme) {
    registry.themeSettings = boot.theme.settings;
    applyThemeVariables(boot.theme.settings);
    document.documentElement.dataset.palcmsTheme = boot.theme.id;
  }
  for (const ext of list) if (ext.css) addStylesheet(ext.id, ext.rev, ext.type === 'theme');

  await Promise.all(
    list
      .filter((e) => e.web)
      .map(async (ext) => {
        try {
          const mod = (await import(/* @vite-ignore */ url(`extensions/${ext.id}/web.js?v=${ext.rev}`))) as { default?: unknown };
          if (typeof mod.default !== 'function') throw new Error('web.js doit exporter une fonction par défaut');
          await (mod.default as (r: ExtensionRegistrar) => unknown)(registrar(ext, ext.type, ext.settings));
        } catch (e) {
          registry.errors.push({ ext: ext.id, message: (e as Error).message });
          console.error(`[extensions] ${ext.id} :`, e);
        }
      }),
  );
}

/** Affiche un bloc d'extension sans que son erreur éventuelle ne casse la page. */
export class ExtensionBoundary extends Component<{ ext: string; children: ReactNode; quiet?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[extensions] ${this.props.ext} :`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <div className="mx-auto my-6 max-w-3xl rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        L’extension « {this.props.ext} » a rencontré une erreur : {this.state.error.message}
      </div>
    );
  }
}

/** Blocs ajoutés par les extensions à un emplacement du site. */
export function Slot({ name, ...props }: { name: WidgetSlot } & Record<string, unknown>) {
  const list = registry.widgets[name];
  if (!list?.length) return null;
  return (
    <>
      {list.map(({ ext, component: C }, i) => (
        <ExtensionBoundary key={`${ext}-${i}`} ext={ext} quiet>
          <C {...props} />
        </ExtensionBoundary>
      ))}
    </>
  );
}

/**
 * Remplace une partie du site par celle du thème actif, sinon affiche la version par défaut.
 * Le composant du thème reçoit les mêmes props, plus "Default" pour réutiliser l'original.
 */
export function Overridable<P extends object>({ slot, fallback: Default, props }: { slot: OverrideSlot; fallback: ComponentType<P>; props: P }) {
  const o = registry.overrides[slot];
  if (!o) return <Default {...props} />;
  const C = o.component;
  return (
    <ExtensionBoundary ext={o.ext}>
      <C {...props} Default={Default} />
    </ExtensionBoundary>
  );
}

/** Réglages du thème actif (fixes pendant la visite : les changer recharge la page). */
export const useThemeSettings = (): ExtensionSettingValues => registry.themeSettings;
