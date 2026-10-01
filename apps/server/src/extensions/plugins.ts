import { pathToFileURL } from 'node:url';
import type { FeatureHost, FeatureRoute, PluginServerApi } from '@palcms/shared';
import { enabledPlugins, extensionPath, extensionSettings, loadErrors } from './store';

interface LoadedPlugin {
  id: string;
  version: string;
  routes: FeatureRoute[];
  cleanups: (() => void)[];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));


/**
 * Server-side plugins: each server.js exports a function that receives the plugin API.
 * They are enabled and disabled without restarting the CMS.
 */
export class PluginRuntime {
  private loaded = new Map<string, LoadedPlugin>();
  private running = false;

  constructor(private host: FeatureHost) {}

  routes(id: string): FeatureRoute[] {
    return this.loaded.get(id)?.routes ?? [];
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  async start(): Promise<void> {
    this.running = true;
    await this.sync();
  }

  stop(): void {
    this.running = false;
    for (const id of [...this.loaded.keys()]) this.unload(id);
  }

  /** Aligns loaded plugins with enabled ones (after enabling, updating or removing one). */
  async sync(): Promise<void> {
    if (!this.running) return;
    const wanted = new Map(enabledPlugins().filter((p) => p.hasServer).map((p) => [p.id, p]));
    for (const [id, p] of this.loaded) {
      const w = wanted.get(id);
      if (!w || w.version !== p.version) this.unload(id);
    }
    for (const p of wanted.values()) {
      if (!this.loaded.has(p.id)) await this.load(p.id, p.version);
    }
    // A plugin without server code has no loading error.
    for (const id of loadErrors.keys()) if (!wanted.has(id)) loadErrors.delete(id);
  }

  private unload(id: string): void {
    const p = this.loaded.get(id);
    if (!p) return;
    for (const fn of p.cleanups.reverse()) {
      try {
        fn();
      } catch (e) {
        console.error(`[plugin ${id}] stop:`, e);
      }
    }
    this.loaded.delete(id);
  }

  private async load(id: string, version: string): Promise<void> {
    const host = this.host;
    const plugin: LoadedPlugin = { id, version, routes: [], cleanups: [] };
    const api: PluginServerApi = {
      id,
      version,
      host,
      settings: {
        get: (key, fallback) => host.settings.get(`plugin.${id}.${key}`, fallback),
        set: (key, value) => host.settings.set(`plugin.${id}.${key}`, value),
      },
      config: () => extensionSettings(id),
      route: (r) => {
        plugin.routes.push({ ...r, path: r.path.replace(/^\/+/, '') });
      },
      migrate: (list) => host.runMigrations(list.map((m) => ({ id: `plugin:${id}:${m.id}`, sql: m.sql }))),
      on: (event, fn) => {
        plugin.cleanups.push(
          host.events.on(event, (data) => {
            try {
              fn(data);
            } catch (e) {
              console.error(`[plugin ${id}] ${event} :`, e);
            }
          }),
        );
      },
      every: (ms, fn) => {
        const t = setInterval(
          () =>
            void Promise.resolve()
              .then(fn)
              .catch((e) => console.error(`[plugin ${id}] task:`, e)),
          Math.max(1000, ms),
        );
        t.unref?.();
        plugin.cleanups.push(() => clearInterval(t));
      },
      onStop: (fn) => {
        plugin.cleanups.push(fn);
      },
      log: (message) => console.log(`[plugin ${id}] ${message}`),
    };

    try {
      // The version parameter forces Node to reload the file after an update.
      const url = `${pathToFileURL(extensionPath(id, 'server.js')).href}?rev=${version}-${Date.now()}`;
      const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
      if (typeof mod.default !== 'function') throw new Error('server.js must export a default function');
      await (mod.default as (api: PluginServerApi) => unknown)(api);
      this.loaded.set(id, plugin);
      loadErrors.delete(id);
      console.log(`[extensions] plugin ${id} ${version} loaded`);
    } catch (e) {
      for (const fn of plugin.cleanups) {
        try {
          fn();
        } catch {
          /* already failing */
        }
      }
      loadErrors.set(id, errorText(e));
      console.error(`[extensions] plugin ${id} :`, e);
    }
  }
}
