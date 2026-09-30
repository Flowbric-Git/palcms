// Démo : market, plugins et thèmes. Les extensions d'exemple (sdk/examples) sont copiées dans la démo
// au build (dist-demo/extensions/<id>/) : on peut les installer, les activer et les régler pour de vrai.

import type { BootExtensions, ExtensionManifest, ExtensionSettingValues, InstalledExtension, MarketEntry } from '@palcms/shared';
import bandeau from '../../../../sdk/examples/plugin-bandeau/palcms.json';
import aurora from '../../../../sdk/examples/theme-aurora/palcms.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface DemoExtensionsContext {
  state: () => Any;
  version: string;
  record: (action: string, target?: string | null) => void;
  fail: (status: number, message: string) => never;
}

interface ExtState {
  installed: Record<string, { enabled: boolean; installedAt: number; settings: ExtensionSettingValues }>;
  theme: string | null;
  allowUnverified: boolean;
  clicks: Record<string, number>;
}

const CATALOG: { manifest: ExtensionManifest; downloads: number; hasServer: boolean; hasWeb: boolean; hasCss: boolean }[] = [
  { manifest: bandeau as ExtensionManifest, downloads: 128, hasServer: true, hasWeb: true, hasCss: true },
  { manifest: aurora as ExtensionManifest, downloads: 96, hasServer: false, hasWeb: true, hasCss: true },
];

const base = import.meta.env.BASE_URL;
const iconOf = (m: ExtensionManifest) => (m.icon ? `extensions/${m.id}/${m.icon}` : null);
const today = () => new Date().toISOString().slice(0, 10);

// Le chargement des extensions se fait au démarrage du site : on recharge la page pour appliquer un changement.
const reloadSoon = () => setTimeout(() => location.reload(), 400);

export function createExtensionsDemo(ctx: DemoExtensionsContext) {
  const ext = (): ExtState => {
    const s = ctx.state();
    s.extensions ??= { installed: {}, theme: null, allowUnverified: false, clicks: {} };
    return s.extensions;
  };
  const find = (id: string) => CATALOG.find((c) => c.manifest.id === id);

  const values = (id: string): ExtensionSettingValues => {
    const c = find(id)!;
    const saved = ext().installed[id]?.settings ?? {};
    const out: ExtensionSettingValues = {};
    for (const d of c.manifest.settings ?? []) {
      const v = saved[d.key] ?? d.default;
      if (v !== undefined) out[d.key] = v;
    }
    return out;
  };

  const installed = (id: string): InstalledExtension => {
    const c = find(id)!;
    const i = ext().installed[id];
    const m = c.manifest;
    return {
      id,
      type: m.type,
      name: m.name,
      version: m.version,
      description: m.description ?? '',
      author: m.author ?? '',
      homepage: m.homepage ?? null,
      iconUrl: iconOf(m),
      enabled: i.enabled,
      active: m.type === 'theme' && ext().theme === id,
      verified: true,
      source: 'market',
      installedAt: i.installedAt,
      compatible: true,
      palcms: m.palcms ?? null,
      hasServer: c.hasServer,
      hasWeb: c.hasWeb,
      hasCss: c.hasCss,
      settings: m.settings ?? [],
      error: null,
    };
  };

  const list = () => Object.keys(ext().installed).filter(find).map(installed);
  const mustExist = (id: string) => {
    if (!ext().installed[id] || !find(id)) ctx.fail(404, 'Extension introuvable');
  };

  function handle(method: string, seg: string[], body: Any, q: URLSearchParams): Any {
    const [, , a, b, c] = seg;
    const route = `${method} ${[a, b, c].filter(Boolean).join('/')}`;

    if (route === 'GET ') return { items: list(), allowUnverified: ext().allowUnverified, version: ctx.version };
    if (route === 'PUT options') {
      ext().allowUnverified = body?.allowUnverified === true;
      return { allowUnverified: ext().allowUnverified };
    }
    if (route === 'GET market') {
      void q;
      const resources: MarketEntry[] = CATALOG.map(({ manifest: m, downloads }) => ({
        id: m.id,
        type: m.type,
        name: m.name,
        summary: m.description ?? '',
        author: m.author ?? '',
        version: m.version,
        iconUrl: `${location.origin}${base}${iconOf(m)}`,
        downloads,
        palcms: m.palcms,
        download: '',
        sha256: '',
        signature: '',
        installed: ext().installed[m.id] ? m.version : null,
        update: false,
        compatible: true,
      }));
      return { resources, error: null };
    }
    if (method === 'POST' && a === 'market' && c === 'install') {
      if (!find(b)) ctx.fail(404, 'Ressource introuvable sur le market');
      ext().installed[b] = { enabled: false, installedAt: Date.now(), settings: {} };
      ctx.record('extensions.install', b);
      return installed(b);
    }
    if (method === 'POST' && a === 'upload') {
      ctx.fail(400, "L'envoi d'un fichier .zip n'est pas disponible dans la démo : installe les exemples depuis le Market.");
    }
    if (route === 'GET themes') {
      return { items: list().filter((e) => e.type === 'theme'), active: ext().theme, allowUnverified: ext().allowUnverified };
    }
    if (route === 'PUT themes/active') {
      const id = body?.id ?? null;
      if (id) mustExist(id);
      ext().theme = id;
      ctx.record('theme.activate', id ?? 'défaut');
      return { active: id };
    }
    if (method === 'GET' && b === 'settings') {
      mustExist(a);
      return { settings: find(a)!.manifest.settings ?? [], values: values(a) };
    }
    if (method === 'PUT' && b === 'settings') {
      mustExist(a);
      ext().installed[a].settings = { ...(body ?? {}) };
      ctx.record('extensions.settings', a);
      return { values: values(a) };
    }
    if (method === 'PUT' && a && !b) {
      mustExist(a);
      ext().installed[a].enabled = body?.enabled === true;
      ctx.record(body?.enabled ? 'extensions.enable' : 'extensions.disable', a);
      reloadSoon();
      return installed(a);
    }
    if (method === 'DELETE' && a && !b) {
      mustExist(a);
      delete ext().installed[a];
      if (ext().theme === a) ext().theme = null;
      ctx.record('extensions.remove', a);
      reloadSoon();
      return { ok: true };
    }
    ctx.fail(404, 'Introuvable');
  }

  /** Routes du plugin d'exemple "bandeau" (celles de son server.js, simulées dans le navigateur). */
  function plugin(method: string, seg: string[]): Any {
    const [, id, path] = seg;
    if (id !== 'bandeau' || !ext().installed.bandeau?.enabled) ctx.fail(404, 'Plugin introuvable ou désactivé');
    const c = values('bandeau');
    if (method === 'GET' && path === 'config') {
      const message = String(c.message ?? '').trim();
      if (!message || (c.until && today() > String(c.until))) return null;
      return { message, link: c.link || null, linkLabel: c.linkLabel || 'En savoir plus', style: c.style, dismissible: c.dismissible !== false };
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
    ctx.fail(404, 'Introuvable');
  }

  function boot(): BootExtensions {
    const e = ext();
    const rev = (id: string) => `${find(id)!.manifest.version}-${e.installed[id].installedAt.toString(36)}`;
    const theme = e.theme && e.installed[e.theme] && find(e.theme) ? e.theme : null;
    return {
      theme: theme ? { id: theme, version: find(theme)!.manifest.version, rev: rev(theme), web: true, css: true, settings: values(theme) } : null,
      plugins: Object.entries(e.installed)
        .filter(([id, i]) => i.enabled && find(id)?.manifest.type === 'plugin')
        .map(([id]) => ({ id, version: find(id)!.manifest.version, rev: rev(id), web: find(id)!.hasWeb, css: find(id)!.hasCss })),
    };
  }

  return { handle, plugin, boot };
}
