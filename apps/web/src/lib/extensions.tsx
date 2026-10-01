import { Component, type ComponentType, type ReactNode } from 'react';
import type { BootExtensions, ExtensionSettingValues, Permission } from '@palcms/shared';
import { api, url } from './api';
import { t } from './i18n';

/** Slots where plugins and themes add blocks. */
export const WIDGET_SLOTS = ['layout.top', 'layout.bottom', 'home.top', 'home.bottom', 'footer', 'profile'] as const;
export type WidgetSlot = (typeof WIDGET_SLOTS)[number];

/** Parts of the site a theme can replace. */
export const OVERRIDE_SLOTS = ['header', 'footer', 'home', 'home.hero'] as const;
export type OverrideSlot = (typeof OVERRIDE_SLOTS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export interface ExtPage {
  ext: string;
  path: string;
  component: AnyComponent;
  /** false: page shown without the site header and footer. */
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

/** What the function exported by web.js receives. */
export interface ExtensionRegistrar {
  id: string;
  version: string;
  type: 'plugin' | 'theme';
  /** Extension settings (values chosen in the panel). */
  settings: ExtensionSettingValues;
  /** Calls to the plugin API: pal.api.get('items') -> /api/plugins/<id>/items */
  api: {
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body: unknown): Promise<T>;
    del<T>(path: string): Promise<T>;
  };
  /** URL of a file in the package's assets/ folder. */
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
      // Only the active theme replaces parts of the site: two plugins cannot fight over the header.
      if (type !== 'theme') {
        console.warn(`[extensions] ${ext.id}: only a theme can replace "${slot}"`);
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

/** Theme settings exposed to CSS: var(--theme-<key>). */
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

/** Loads the active theme, then enabled plugins, before the site first renders (once). */
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
          if (typeof mod.default !== 'function') throw new Error('web.js must export a default function');
          await (mod.default as (r: ExtensionRegistrar) => unknown)(registrar(ext, ext.type, ext.settings));
        } catch (e) {
          registry.errors.push({ ext: ext.id, message: (e as Error).message });
          console.error(`[extensions] ${ext.id} :`, e);
        }
      }),
  );
}

/** Shows an extension block without letting its errors break the page. */
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
        {t('The extension "{ext}" ran into an error: {error}', { ext: this.props.ext, error: this.state.error.message })}
      </div>
    );
  }
}

/** Blocks added by extensions to a slot of the site. */
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
 * Replaces a part of the site with the active theme's version, otherwise shows the default one.
 * The theme component gets the same props, plus "Default" to reuse the original.
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

/** Active theme settings (fixed during a visit: changing them reloads the page). */
export const useThemeSettings = (): ExtensionSettingValues => registry.themeSettings;
