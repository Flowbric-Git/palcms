import { z } from 'zod';
import type { FeatureHost, HostUser } from '@palcms/shared';
import { PluginRuntime } from '../extensions/plugins';
import { annotate, fetchCatalog, installFromMarket, trustedKeys } from '../extensions/market';
import { MAX_PACKAGE_BYTES, readPackage, sha256, verifySignature } from '../extensions/package';
import {
  activeThemeId,
  extensionSettings,
  getExtension,
  installPackage,
  listExtensions,
  removeExtension,
  saveExtensionSettings,
  setActiveTheme,
  setEnabled,
} from '../extensions/store';
import { errorText, httpError, parseBody, type Feature } from './util';

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string, details?: unknown) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target, details });

const ALLOW_UNVERIFIED = 'extensions.allowUnverified';

let runtime: PluginRuntime | null = null;

/** Plugins loaded on the server (null before features start). */
export function pluginRuntime(): PluginRuntime | null {
  return runtime;
}

/** Market and installed plugins and themes. */
export function createExtensions(host: FeatureHost): Feature {
  runtime = new PluginRuntime(host);
  const rt = runtime;
  const allowUnverified = () => host.settings.get(ALLOW_UNVERIFIED, false);

  const found = (id: string) => {
    const ext = getExtension(id);
    if (!ext) throw httpError(404, 'Extension not found');
    return ext;
  };

  return {
    routes: [
      {
        method: 'GET',
        path: 'extensions',
        access: 'staff',
        permission: 'admin.extensions',
        handler: () => ({ items: listExtensions(), allowUnverified: allowUnverified(), version: host.version }),
      },
      {
        method: 'PUT',
        path: 'extensions/options',
        access: 'staff',
        permission: 'admin.extensions',
        handler: ({ body, user }) => {
          const { allowUnverified: v } = parseBody(z.object({ allowUnverified: z.boolean() }), body);
          host.settings.set(ALLOW_UNVERIFIED, v);
          audit(host, user, 'extensions.options', undefined, { allowUnverified: v });
          return { allowUnverified: v };
        },
      },
      {
        method: 'GET',
        path: 'extensions/market',
        access: 'staff',
        permission: 'admin.extensions',
        handler: async ({ query }) => {
          try {
            return { resources: annotate(await fetchCatalog(query.refresh === '1')), error: null };
          } catch (e) {
            return { resources: [], error: errorText(e) };
          }
        },
      },
      {
        method: 'POST',
        path: 'extensions/market/:id/install',
        access: 'staff',
        permission: 'admin.extensions',
        handler: async ({ params, user }) => {
          const before = getExtension(params.id);
          const ext = await installFromMarket(params.id);
          audit(host, user, before ? 'extensions.update' : 'extensions.install', ext.id, { version: ext.version, source: 'market' });
          await rt.sync();
          return getExtension(ext.id);
        },
      },
      {
        method: 'POST',
        path: 'extensions/upload',
        access: 'staff',
        permission: 'admin.extensions',
        handler: async (ctx) => {
          const { data } = await ctx.readUpload(MAX_PACKAGE_BYTES);
          const pkg = readPackage(data);
          // A file downloaded from the market stays verified: its signature is found in the catalog.
          let verified = false;
          try {
            const hash = sha256(data);
            const entry = (await fetchCatalog()).find((r) => r.sha256.toLowerCase() === hash && r.id === pkg.manifest.id);
            verified = !!entry && verifySignature(data, entry.signature, trustedKeys());
          } catch {
            verified = false;
          }
          if (!verified && !allowUnverified()) {
            throw httpError(
              403,
              'This package is not signed by the market. Turn on "Allow unverified extensions" if you trust its source.',
            );
          }
          const before = getExtension(pkg.manifest.id);
          const ext = installPackage(pkg, { source: 'upload', verified });
          audit(host, ctx.user, before ? 'extensions.update' : 'extensions.install', ext.id, { version: ext.version, source: 'upload', verified });
          await rt.sync();
          return getExtension(ext.id);
        },
      },
      {
        method: 'PUT',
        path: 'extensions/:id',
        access: 'staff',
        permission: 'admin.extensions',
        handler: async ({ params, body, user }) => {
          const ext = found(params.id);
          const { enabled } = parseBody(z.object({ enabled: z.boolean() }), body);
          if (ext.type !== 'plugin') throw httpError(400, 'A theme is enabled from the Themes page');
          if (enabled && !ext.verified && !allowUnverified()) {
            throw httpError(403, 'Unverified extension: allow unverified extensions to enable it');
          }
          setEnabled(ext.id, enabled);
          audit(host, user, enabled ? 'extensions.enable' : 'extensions.disable', ext.id);
          await rt.sync();
          return getExtension(ext.id);
        },
      },
      {
        method: 'DELETE',
        path: 'extensions/:id',
        access: 'staff',
        permission: 'admin.extensions',
        handler: async ({ params, user }) => {
          const ext = found(params.id);
          if (ext.type === 'plugin' && ext.enabled) {
            setEnabled(ext.id, false);
            await rt.sync();
          }
          removeExtension(ext.id);
          audit(host, user, 'extensions.remove', ext.id);
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'extensions/themes',
        access: 'staff',
        permission: 'site.appearance',
        handler: () => ({
          items: listExtensions().filter((e) => e.type === 'theme'),
          active: activeThemeId(),
          allowUnverified: allowUnverified(),
        }),
      },
      {
        method: 'PUT',
        path: 'extensions/themes/active',
        access: 'staff',
        permission: 'site.appearance',
        handler: ({ body, user }) => {
          const { id } = parseBody(z.object({ id: z.string().nullable() }), body);
          if (id) {
            const ext = found(id);
            if (!ext.verified && !allowUnverified()) {
              throw httpError(403, 'Unverified theme: allow unverified extensions to use it');
            }
          }
          setActiveTheme(id);
          audit(host, user, 'theme.activate', id ?? 'default');
          return { active: activeThemeId() };
        },
      },
      {
        method: 'GET',
        path: 'extensions/:id/settings',
        access: 'staff',
        handler: ({ params, can }) => {
          const ext = found(params.id);
          if (!can(ext.type === 'theme' ? 'site.appearance' : 'admin.extensions')) throw httpError(403, 'Insufficient permission');
          return { settings: ext.settings, values: extensionSettings(ext.id, ext.settings) };
        },
      },
      {
        method: 'PUT',
        path: 'extensions/:id/settings',
        access: 'staff',
        handler: ({ params, body, can, user }) => {
          const ext = found(params.id);
          if (!can(ext.type === 'theme' ? 'site.appearance' : 'admin.extensions')) throw httpError(403, 'Insufficient permission');
          const values = parseBody(z.record(z.unknown()), body);
          const saved = saveExtensionSettings(ext.id, values);
          audit(host, user, 'extensions.settings', ext.id);
          return { values: saved };
        },
      },
    ],
    start() {
      void rt.start();
    },
    stop() {
      rt.stop();
    },
  };
}
