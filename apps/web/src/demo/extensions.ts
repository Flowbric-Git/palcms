// Demo: market, plugins and themes. The catalog is the real market (palcms.online): a package is
// downloaded by the browser, checked (SHA-256), kept in IndexedDB and runs as on a real site.
// The server part of a plugin (server.js) cannot run in the browser: only the example plugin "bandeau" has its routes simulated.

import {
  compareVersions,
  satisfiesVersion,
  type BootExtensions,
  type ExtensionSettingValues,
  type InstalledExtension,
  type MarketEntry,
  type MarketResource,
} from '@palcms/shared';
import { demoFiles } from '../lib/extensions';
import { lang } from '../lib/i18n';
import { deletePackage, readPackage, savePackage, sha256, type DemoPackage } from './packages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface DemoExtensionsContext {
  state: () => Any;
  version: string;
  record: (action: string, target?: string | null) => void;
  fail: (status: number, message: string) => never;
}

interface Installed extends DemoPackage {
  enabled: boolean;
  installedAt: number;
  settings: ExtensionSettingValues;
  source: 'market' | 'upload';
  verified: boolean;
  iconUrl: string | null;
}

interface ExtState {
  installed: Record<string, Installed>;
  theme: string | null;
  allowUnverified: boolean;
  clicks: Record<string, number>;
}

const MARKET_URL = (import.meta.env.VITE_MARKET_URL || 'https://palcms.online/api/market').replace(/\/+$/, '');
const MAX_BYTES = 20 * 1024 * 1024;
const CACHE_MS = 60_000;
let catalog: { at: number; resources: MarketResource[] } | null = null;

async function fetchCatalog(force = false): Promise<MarketResource[]> {
  if (!force && catalog && Date.now() - catalog.at < CACHE_MS) return catalog.resources;
  let res: Response;
  try {
    res = await fetch(`${MARKET_URL}/resources`, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error('The market cannot be reached right now');
  }
  if (!res.ok) throw new Error(`The market answered ${res.status}`);
  const json = (await res.json()) as { resources?: MarketResource[] };
  const resources = (json.resources ?? []).filter((r) => r && typeof r.id === 'string' && typeof r.download === 'string');
  catalog = { at: Date.now(), resources };
  return resources;
}

async function download(u: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(u, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error('The market cannot be reached right now');
  }
  if (!res.ok) throw new Error(`The market answered ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error('Package too large (20 MB maximum)');
  return buf;
}

const today = () => new Date().toISOString().slice(0, 10);

// Extensions load when the site starts: reload the page to apply a change.
const reloadSoon = () => setTimeout(() => location.reload(), 400);

export function createExtensionsDemo(ctx: DemoExtensionsContext) {
  const ext = (): ExtState => {
    const s = ctx.state();
    s.extensions ??= { installed: {}, theme: null, allowUnverified: false, clicks: {} };
    const e = s.extensions as ExtState;
    // Before the real market, the demo had its own copies of the examples (no package kept): forget them.
    for (const [id, i] of Object.entries(e.installed)) if (!i.manifest) delete e.installed[id];
    if (e.theme && !e.installed[e.theme]) e.theme = null;
    return e;
  };
  const get = (id: string) => ext().installed[id];

  const values = (id: string): ExtensionSettingValues => {
    const i = get(id);
    const out: ExtensionSettingValues = {};
    for (const d of i?.manifest.settings ?? []) {
      const v = i.settings[d.key] ?? d.default;
      if (v !== undefined) out[d.key] = v;
    }
    return out;
  };

  const installed = (id: string): InstalledExtension => {
    const i = get(id);
    const m = i.manifest;
    return {
      id,
      type: m.type,
      name: m.name,
      version: m.version,
      description: m.description ?? '',
      author: m.author ?? '',
      homepage: m.homepage ?? null,
      iconUrl: (m.icon && demoFiles.get(`${id}/${m.icon}`)) || i.iconUrl,
      enabled: i.enabled,
      active: m.type === 'theme' && ext().theme === id,
      verified: i.verified,
      source: i.source,
      installedAt: i.installedAt,
      compatible: satisfiesVersion(ctx.version, m.palcms),
      palcms: m.palcms ?? null,
      hasServer: i.hasServer,
      hasWeb: i.hasWeb,
      hasCss: i.hasCss,
      settings: m.settings ?? [],
      error: null,
    };
  };

  const list = () => Object.keys(ext().installed).map(installed);
  const mustExist = (id: string) => {
    if (!get(id)) ctx.fail(404, 'Extension not found');
  };

  const keep = async (pkg: DemoPackage, zip: Uint8Array, source: Installed['source'], verified: boolean, iconUrl: string | null) => {
    if (!satisfiesVersion(ctx.version, pkg.manifest.palcms)) {
      ctx.fail(400, `This resource requires PalCMS ${pkg.manifest.palcms} (installed version: ${ctx.version})`);
    }
    try {
      await savePackage(pkg.manifest.id, zip);
    } catch {
      ctx.fail(400, 'Your browser does not let the demo keep the package (private browsing?)');
    }
    const before = get(pkg.manifest.id);
    ext().installed[pkg.manifest.id] = {
      ...pkg,
      enabled: before?.enabled ?? false,
      installedAt: Date.now(),
      settings: before?.settings ?? {},
      source,
      verified,
      iconUrl,
    };
    ctx.record(before ? 'extensions.update' : 'extensions.install', pkg.manifest.id);
    // Files of the new version are unzipped when the site starts again.
    if (before?.enabled || ext().theme === pkg.manifest.id) reloadSoon();
    return installed(pkg.manifest.id);
  };

  async function handle(method: string, seg: string[], body: Any, q: URLSearchParams): Promise<Any> {
    const [, , a, b, c] = seg;
    const route = `${method} ${[a, b, c].filter(Boolean).join('/')}`;

    if (route === 'GET ') return { items: list(), allowUnverified: ext().allowUnverified, version: ctx.version };
    if (route === 'PUT options') {
      ext().allowUnverified = body?.allowUnverified === true;
      return { allowUnverified: ext().allowUnverified };
    }
    if (route === 'GET market') {
      try {
        const resources: MarketEntry[] = (await fetchCatalog(q.get('refresh') === '1')).map((r) => {
          const inst = get(r.id);
          return {
            ...r,
            installed: inst?.manifest.version ?? null,
            update: !!inst && compareVersions(r.version, inst.manifest.version) > 0,
            compatible: satisfiesVersion(ctx.version, r.palcms),
          };
        });
        return { resources, error: null };
      } catch (e) {
        return { resources: [], error: (e as Error).message };
      }
    }
    if (method === 'POST' && a === 'market' && c === 'install') {
      const r = (await fetchCatalog()).find((x) => x.id === b);
      if (!r) ctx.fail(404, 'Resource not found on the market');
      const zip = await download(r.download);
      if ((await sha256(zip)) !== r.sha256.toLowerCase()) ctx.fail(400, 'The downloaded file is corrupted (checksum mismatch)');
      const pkg = readPackage(zip);
      if (pkg.manifest.id !== r.id || pkg.manifest.type !== r.type) ctx.fail(400, 'The package does not match the listed resource');
      return keep(pkg, zip, 'market', true, r.iconUrl ?? null);
    }
    if (method === 'POST' && a === 'upload') {
      // The engine turns the uploaded file into a data: address.
      const dataUrl = String(body?.dataUrl ?? '');
      if (!dataUrl.startsWith('data:')) ctx.fail(400, 'No file received');
      const zip = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
      if (zip.byteLength > MAX_BYTES) ctx.fail(400, 'Package too large (20 MB maximum)');
      let pkg: DemoPackage;
      try {
        pkg = readPackage(zip);
      } catch (e) {
        return ctx.fail(400, (e as Error).message);
      }
      // A file is "verified" when it is the exact package published on the market.
      const hash = await sha256(zip);
      const listed = await fetchCatalog().catch(() => [] as MarketResource[]);
      const verified = listed.some((r) => r.id === pkg.manifest.id && r.sha256.toLowerCase() === hash);
      if (!verified && !ext().allowUnverified) {
        ctx.fail(403, 'This package is not signed by the market. Turn on "Allow unverified extensions" if you trust its source.');
      }
      return keep(pkg, zip, 'upload', verified, null);
    }
    if (route === 'GET themes') {
      return { items: list().filter((e) => e.type === 'theme'), active: ext().theme, allowUnverified: ext().allowUnverified };
    }
    if (route === 'PUT themes/active') {
      const id = body?.id ?? null;
      if (id) {
        mustExist(id);
        if (!get(id).verified && !ext().allowUnverified) ctx.fail(403, 'Unverified theme: allow unverified extensions to use it');
      }
      ext().theme = id;
      ctx.record('theme.activate', id ?? 'default');
      return { active: id };
    }
    if (method === 'GET' && b === 'settings') {
      mustExist(a);
      return { settings: get(a).manifest.settings ?? [], values: values(a) };
    }
    if (method === 'PUT' && b === 'settings') {
      mustExist(a);
      get(a).settings = { ...(body ?? {}) };
      ctx.record('extensions.settings', a);
      return { values: values(a) };
    }
    if (method === 'PUT' && a && !b) {
      mustExist(a);
      if (get(a).manifest.type !== 'plugin') ctx.fail(400, 'A theme is enabled from the Themes page');
      if (body?.enabled && !get(a).verified && !ext().allowUnverified) ctx.fail(403, 'Unverified extension: allow unverified extensions to enable it');
      get(a).enabled = body?.enabled === true;
      ctx.record(body?.enabled ? 'extensions.enable' : 'extensions.disable', a);
      reloadSoon();
      return installed(a);
    }
    if (method === 'DELETE' && a && !b) {
      mustExist(a);
      delete ext().installed[a];
      if (ext().theme === a) ext().theme = null;
      await deletePackage(a).catch(() => {});
      ctx.record('extensions.remove', a);
      reloadSoon();
      return { ok: true };
    }
    ctx.fail(404, 'Not found');
  }

  /** Routes of the "bandeau" example plugin (those of its server.js, simulated in the browser). */
  function plugin(method: string, seg: string[]): Any {
    const [, id, path] = seg;
    if (!get(id)?.enabled) ctx.fail(404, 'Plugin not found or turned off');
    if (id !== 'bandeau') ctx.fail(501, 'The server part of this plugin does not run in the demo');
    const c = values('bandeau');
    if (method === 'GET' && path === 'config') {
      const message = String(c.message ?? '').trim();
      if (!message || (c.until && today() > String(c.until))) return null;
      return { message, link: c.link || null, linkLabel: c.linkLabel || 'Learn more', style: c.style, dismissible: c.dismissible !== false };
    }
    if (method === 'POST' && path === 'clicks') {
      ext().clicks[today()] = (ext().clicks[today()] ?? 0) + 1;
      return { ok: true };
    }
    if (method === 'GET' && path === 'stats') {
      const days = Object.entries(ext().clicks)
        .sort(([x], [y]) => (x < y ? 1 : -1))
        .slice(0, 30)
        .map(([day, clicks]) => ({ day, clicks }));
      return { total: days.reduce((n, d) => n + d.clicks, 0), days };
    }
    ctx.fail(404, 'Not found');
  }

  function boot(): BootExtensions {
    const e = ext();
    const usable = (id: string) => {
      const i = e.installed[id];
      return !!i && satisfiesVersion(ctx.version, i.manifest.palcms) && (i.verified || e.allowUnverified);
    };
    const rev = (id: string) => `${e.installed[id].manifest.version}-${e.installed[id].installedAt.toString(36)}`;
    const theme = e.theme && usable(e.theme) ? e.installed[e.theme] : null;
    const fr = lang() === 'fr';
    return {
      theme: theme
        ? {
            id: theme.manifest.id,
            version: theme.manifest.version,
            rev: rev(theme.manifest.id),
            web: theme.hasWeb,
            css: theme.hasCss,
            settings: values(theme.manifest.id),
            menuFixed: (theme.manifest.menu?.fixed ?? []).map((l) => ({ url: l.url, label: (fr && l.labelFr) || l.label })),
          }
        : null,
      plugins: Object.entries(e.installed)
        .filter(([id, i]) => i.enabled && i.manifest.type === 'plugin' && usable(id))
        .map(([id, i]) => ({ id, version: i.manifest.version, rev: rev(id), web: i.hasWeb, css: i.hasCss })),
    };
  }

  return { handle, plugin, boot };
}
