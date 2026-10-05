// Demo mode: a fake PalCMS server running entirely in the browser.
// Starting data comes from data.json (responses of a real install),
// changes are kept in the visitor's localStorage.
import { ALL_PERMISSIONS, type WsServerMessage } from '@palcms/shared';
import seed from './data.json';
import { version } from '../../package.json';
import { createWorldDemo } from './world';
import { createExtensionsDemo } from './extensions';
import { clearPackages } from './packages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const STORAGE_KEY = 'palcms-demo';
const DAY = 86_400_000;
const START = Date.now();

class DemoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const notInDemo = () => {
  throw new DemoError(400, 'This action is not available in the demo.');
};

// Simulated world

const NAMES = ['Lyra', 'Kaito', 'Nova', 'Bastien', 'Mira', 'Oskar', 'Zelie', 'Tanuki', 'Ember', 'Yuki'];

interface Player {
  uid: string;
  publicId: string;
  name: string;
  level: number;
  playtimeSeconds: number;
  firstSeen: number;
  lastSeen: number;
  buildings: number;
  online: boolean;
  x: number;
  y: number;
  ping: number;
  ip: string;
}

// Seeded pseudo-random generator: the starting world is the same for everyone.
function rng(seedValue: number) {
  let s = seedValue;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function createPlayers(): Player[] {
  const r = rng(42);
  return NAMES.map((name, i) => {
    const days = 14 - i;
    const level = Math.max(3, Math.round(48 - i * 4.5 + r() * 6));
    return {
      uid: `steam_7656119800000${String(1000 + i)}`,
      publicId: Array.from({ length: 12 }, () => Math.floor(r() * 16).toString(16)).join(''),
      name,
      level,
      playtimeSeconds: Math.round(days * (1.2 + r() * 2.5) * 3600),
      firstSeen: START - days * DAY + Math.round(r() * DAY),
      lastSeen: START - Math.round(r() * 3 * DAY),
      buildings: Math.round(10 + r() * 90 - i * 4),
      online: i < 5 || r() < 0.3,
      x: -560000 + r() * 640000,
      y: -250000 + r() * 500000,
      ping: Math.round(15 + r() * 60),
      ip: `203.0.113.${20 + i}`,
    };
  });
}

// Site state (the visitor can change it)

function hydrate(value: Any): Any {
  // In data.json, negative dates are offsets from now.
  if (Array.isArray(value)) return value.map(hydrate);
  if (value && typeof value === 'object') {
    const out: Any = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = typeof v === 'number' && v < 0 && /(At|Seen)$/.test(k) ? START + v : hydrate(v);
    }
    return out;
  }
  return value;
}

function initialState(): Any {
  const s = hydrate(structuredClone(seed));
  const backups = [3, 2, 1, 0].map((h) => {
    const at = START - h * 3600_000 - 120_000;
    return { name: backupName(at, h === 0 ? 'manual' : 'auto'), size: 48_000_000 + h * 350_000, createdAt: at, tag: h === 0 ? 'manual' : 'auto' };
  });
  return {
    v: 2,
    user: null,
    service: 'active',
    serviceSince: START - 5 * 3600_000,
    site: s.site,
    modules: s.modules,
    pages: s.pages,
    news: s.news,
    members: [adminMember(s.adminUser), s.pendingMember],
    config: s.config.entries,
    team: s.team,
    discord: s.discord,
    rcon: { enabled: true, port: s.rcon.port },
    schedules: { ...s.schedules.settings, enabled: true, times: ['06:00', '18:00'] },
    pendingRestart: null,
    theme: s.theme,
    whitelist: s.whitelist,
    bans: [{ uid: 'steam_76561198000009999', name: 'Griefer42', reason: 'Destroying bases', bannedAt: START - 3 * DAY, bannedBy: 'admin' }],
    backupSettings: s.backupSettings,
    backups,
    map: { public: true, settings: s.map.settings, pois: s.map.pois },
    announcements: [{ id: 1, message: 'Remember to join the Discord!', runAt: START + 2 * 3600_000, repeat: 'daily', createdBy: 'admin' }],
    audit: [
      audit('backup.create', backups[3].name, START - 120_000),
      audit('news.create', 'new-live-map', START - DAY),
      audit('map.poi.create', 'Merchant', START - 2 * DAY),
      audit('news.create', 'weekend-event-alpha-hunt', START - 4 * DAY),
      audit('player.ban', 'Griefer42', START - 3 * DAY),
      audit('settings.update', 'site', START - 12 * DAY),
    ],
    steamApiKeySet: false,
    nextId: 100,
  };
}

function adminMember(u: Any) {
  return {
    id: u.id, username: u.username, displayName: u.displayName, email: 'admin@palcms.demo', role: u.role, status: 'active', inGameName: null,
    steam: 0, playerUid: null, playerName: null, playerLevel: null, createdAt: START - 14 * DAY, lastLoginAt: START,
  };
}

function audit(action: string, target: string | null, ts = Date.now(), details: string | null = null) {
  return { id: Math.round(ts / 1000), ts, username: 'admin', action, target, details };
}

function backupName(at: number, tag: string) {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `palworld-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${tag}.tar.gz`;
}

function load(): Any {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // v1 = French demo data (before 1.1.0): start again from the English data.
      if (s?.v === 2) return s;
    }
  } catch {
    // localStorage unavailable (private browsing...): the demo starts from scratch on each visit
  }
  return initialState();
}

let state: Any = load();

// Modules added since data.json was created (also for a demo already saved in the browser)
const NEW_MODULES = [
  ['guilds', 'Guilds', 'Public guild pages: members, level and bases on the map (read from the save files).', 'public', true],
  ['paldex', 'Server Paldex', 'All 288 Pals by server, player and guild, with the top collectors (read from the save files).', 'public', true],
  ['character', 'My character', 'Registered players see their Pals, inventory and guild.', 'public', true],
  ['calendar', 'Events calendar', 'Upcoming events on the site, with a countdown on the home page.', 'public', true],
  ['uptime', 'Uptime page', 'Server uptime over 30 days, attendance and next restart.', 'public', true],
  ['tickets', 'Reports and suggestions', 'Registered players report a problem or suggest an idea to the team.', 'public', true],
  ['world', 'World data', 'Reads the save files: inventories, Pals, guilds and bases.', 'server', false],
  ['monitoring', 'Monitoring', 'Alerts, connection status, crash detection and attendance statistics.', 'server', false],
  ['events', 'Events and presets', 'Scheduled temporary settings (XP x3 weekend…) and configuration presets.', 'server', false],
] as const;
for (const [id, name, description, area, toggleable] of NEW_MODULES) {
  if (!state.modules.some((m: Any) => m.id === id)) state.modules.push({ id, name, description, area, toggleable, enabled: true });
}
for (const item of [
  { label: 'Events', url: '/events', after: '/news' },
  { label: 'Guilds', url: '/guilds', after: '/map' },
  { label: 'Paldex', url: '/paldex', after: '/guilds' },
]) {
  if (state.site.menu.some((m: Any) => m.url === item.url)) continue;
  const i = state.site.menu.findIndex((m: Any) => m.url === item.after);
  state.site.menu.splice(i >= 0 ? i + 1 : state.site.menu.length, 0, { label: item.label, url: item.url });
}
// Direct link to /admin (e.g. from the README): enter the panel without logging in.
if (!state.user && location.pathname.startsWith(`${import.meta.env.BASE_URL}admin`)) state.user = seed.adminUser;
const players = createPlayers();
const metrics: { ts: number; fps: number; players: number }[] = [];
const logs: string[] = [];

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // never mind, the demo still works
  }
}

export async function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to do
  }
  await clearPackages().catch(() => {});
  location.href = import.meta.env.BASE_URL;
}

// Real time

type Listener = (msg: WsServerMessage) => void;
const listeners = new Set<Listener>();

export function onDemoMessage(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const emit = (msg: WsServerMessage) => listeners.forEach((l) => l(msg));

const serverOnline = () => state.service === 'active';
const onlinePlayers = () => (serverOnline() ? players.filter((p) => p.online) : []);
const isOn = (id: string) => state.modules.find((m: Any) => m.id === id)?.enabled !== false;

function log(line: string) {
  const entry = `${new Date().toISOString()} palworld[4242]: ${line}`;
  logs.push(entry);
  if (logs.length > 300) logs.shift();
  emit({ type: 'log', data: entry });
}

function status() {
  const on = onlinePlayers();
  return {
    online: serverOnline(),
    name: serverName(),
    version: serverOnline() ? 'v1.0.5.102999' : null,
    players: on.length,
    maxPlayers: Number(configValue('ServerPlayerMaxNum') ?? 16),
    fps: serverOnline() ? 55 + Math.round(Math.random() * 5) : null,
    days: serverOnline() ? 14 + Math.floor((Date.now() - START) / 1_200_000) : null,
    uptime: serverOnline() ? Math.round((Date.now() - state.serviceSince) / 1000) : null,
    address: state.site.serverAddress || 'play.palpagos.net:8211',
    updatedAt: Date.now(),
  };
}

const serverName = () => String(configValue('ServerName') ?? state.site.name);
const configValue = (key: string) => state.config.find((e: Any) => e.key === key)?.value;
const publicPlayers = () => onlinePlayers().map((p) => ({ id: p.publicId, name: p.name, level: p.level, online: true }));
const mapPlayers = () => onlinePlayers().map((p) => ({ id: p.publicId, name: p.name, level: p.level, x: p.x, y: p.y }));

function leaderboard(by = 'level') {
  const sorted = [...players].sort((a, b) => {
    if (by === 'playtime') return b.playtimeSeconds - a.playtimeSeconds;
    if (by === 'seniority') return a.firstSeen - b.firstSeen;
    if (by === 'buildings') return b.buildings - a.buildings;
    return b.level - a.level || b.playtimeSeconds - a.playtimeSeconds;
  });
  return sorted.map((p, i) => ({
    rank: i + 1, id: p.publicId, name: p.name, level: p.level, online: serverOnline() && p.online,
    playtimeSeconds: Math.round(p.playtimeSeconds), firstSeen: p.firstSeen, buildings: p.buildings,
  }));
}

let last = Date.now();
function tick() {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  if (serverOnline()) {
    for (const p of players) {
      if (Math.random() < 0.004) {
        p.online = !p.online;
        log(`${p.name} ${p.online ? 'joined' : 'left'} the server. (User id: ${p.uid})`);
      }
      if (!p.online) continue;
      p.x += (Math.random() - 0.5) * 9000;
      p.y += (Math.random() - 0.5) * 9000;
      p.playtimeSeconds += dt;
      p.lastSeen = now;
      if (Math.random() < 0.003 && p.level < 60) p.level++;
      if (Math.random() < 0.01) p.buildings++;
    }
  }
  if (now - metrics[metrics.length - 1].ts >= 300_000) {
    metrics.push({ ts: now, fps: serverOnline() ? 55 + Math.round(Math.random() * 5) : 0, players: onlinePlayers().length });
    metrics.shift();
  }
  emit({ type: 'status', data: status() });
  if (isOn('status')) emit({ type: 'players', data: publicPlayers() });
  if (isOn('leaderboard')) emit({ type: 'leaderboard', data: leaderboard().slice(0, 20) });
  if (isOn('map') && (state.map.public || state.user)) emit({ type: 'feature', event: 'map', data: mapPlayers() });
}

// Starting history for the dashboard and the logs
// 24 h of measures every 5 minutes, with more players in the evening
for (let i = 287; i >= 0; i--) {
  const ts = START - i * 300_000;
  const hour = new Date(ts).getHours();
  const crowd = Math.max(0, Math.sin(((hour - 8) / 24) * 2 * Math.PI)) * 7;
  metrics.push({ ts, fps: 54 + Math.round(Math.random() * 6), players: Math.round(1 + crowd + Math.random() * 2) });
}
for (const p of players.filter((x) => x.online)) logs.push(`${new Date(START - 600_000).toISOString()} palworld[4242]: ${p.name} joined the server. (User id: ${p.uid})`);
logs.unshift(`${new Date(state.serviceSince).toISOString()} palworld[4242]: Running Palworld dedicated server on :8211`);
setInterval(tick, 3000);

// Router

const requireStaff = () => {
  if (!state.user) throw new DemoError(401, 'Login required');
};

const findPlayer = (id: string) => players.find((p) => p.publicId === id || p.uid === id);

function profile(p: Player) {
  const rank = leaderboard().find((e) => e.id === p.publicId)?.rank ?? null;
  return {
    id: p.publicId, name: p.name, level: p.level, online: serverOnline() && p.online, playtimeSeconds: Math.round(p.playtimeSeconds),
    firstSeen: p.firstSeen, lastSeen: p.lastSeen, rank, member: null,
  };
}

function playerStats(p: Player) {
  const r = rng(p.name.length * 97 + p.level);
  const days = [];
  const count = Math.min(14, Math.ceil((Date.now() - p.firstSeen) / DAY));
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    days.push({
      day: d.toISOString().slice(0, 10),
      level: Math.max(1, Math.round(p.level - (i * p.level) / (count + 2))),
      playtimeSeconds: Math.round((0.5 + r() * 3.5) * 3600),
    });
  }
  return { days, buildings: p.buildings };
}

const newsSummary = (n: Any) => ({
  id: n.id, slug: n.slug, title: n.title, excerpt: n.excerpt, coverUrl: n.coverUrl, publishedAt: n.publishedAt, author: n.author,
});

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `article-${state.nextId}`;

// The active theme's locked links come first in the menu (as applyFixedMenu on the server).
const withFixedMenu = (site: Any, fixed: { url: string; label: string }[] = []) => {
  if (fixed.length === 0) return site;
  const urls = new Set(fixed.map((f) => f.url));
  const locked = fixed.map((f) => ({ label: site.menu.find((m: Any) => m.url === f.url)?.label ?? f.label, url: f.url }));
  return { ...site, menu: [...locked, ...site.menu.filter((m: Any) => !urls.has(m.url))].slice(0, 20) };
};

const bootstrap = () => ({
  setupDone: true,
  version,
  serverMode: 'managed',
  site: withFixedMenu(state.site, extensions.boot().theme?.menuFixed),
  modules: Object.fromEntries(state.modules.map((m: Any) => [m.id, m.enabled])),
  // In the demo, the visitor has every panel permission.
  user: state.user ? { ...state.user, permissions: ALL_PERMISSIONS } : null,
  extensions: extensions.boot(),
});

function record(action: string, target: string | null = null) {
  state.audit.unshift(audit(action, target));
}

const extensions = createExtensionsDemo({
  state: () => state,
  version,
  record,
  fail: (code, message) => {
    throw new DemoError(code, message);
  },
});

const extra = createWorldDemo({
  players,
  state: () => state,
  start: START,
  online: serverOnline,
  status,
  metrics: () => metrics,
  log,
  record,
  fail: (code, message) => {
    throw new DemoError(code, message);
  },
});

function handle(method: string, fullPath: string, body: Any): Any {
  const [path, qs] = fullPath.split('?');
  const q = new URLSearchParams(qs ?? '');
  const seg = path.split('/');
  const route = `${method} ${path}`;

  // Public
  if (route === 'GET public/bootstrap') return bootstrap();
  if (route === 'GET public/status') return { status: status(), players: publicPlayers() };
  if (route === 'GET public/news') {
    const items = state.news.filter((n: Any) => n.published).sort((a: Any, b: Any) => b.publishedAt - a.publishedAt);
    return { items: items.map(newsSummary), page: 1, pages: 1 };
  }
  if (method === 'GET' && seg[0] === 'public' && seg[1] === 'news') {
    const n = state.news.find((x: Any) => x.slug === seg[2] && x.published);
    if (!n) throw new DemoError(404, 'Article not found');
    return n;
  }
  if (method === 'GET' && seg[0] === 'public' && seg[1] === 'pages') {
    const p = state.pages.find((x: Any) => x.slug === seg[2] && x.published);
    if (!p) throw new DemoError(404, 'Page not found');
    return p;
  }
  if (method === 'GET' && seg[0] === 'public' && seg[1] === 'players') {
    const p = findPlayer(seg[2]);
    if (!p) throw new DemoError(404, 'Player not found');
    return profile(p);
  }

  // Accounts: in the demo, any login opens the administrator session.
  if (route === 'POST auth/login') {
    state.user = seed.adminUser;
    return { user: state.user };
  }
  if (route === 'POST auth/logout') {
    state.user = null;
    return { ok: true };
  }
  if (route === 'POST auth/register') throw new DemoError(400, 'Sign-up is turned off in the demo. Use "Enter the admin panel".');
  if (route === 'PATCH auth/me') {
    requireStaff();
    if (body?.newPassword) notInDemo();
    if (body?.displayName) state.user = { ...state.user, displayName: body.displayName };
    return { user: state.user };
  }

  // Map (public if the admin left it public)
  if (route === 'GET features/map') {
    if (!state.map.public && !state.user) throw new DemoError(403, 'The map is for the team only');
    return { ...state.map, officialUrl: `${import.meta.env.BASE_URL}map-palpagos.jpg`, players: mapPlayers() };
  }
  if (route === 'GET features/leaderboard') return { by: q.get('by') ?? 'level', entries: leaderboard(q.get('by') ?? 'level') };
  if (method === 'GET' && seg[0] === 'features' && seg[1] === 'players' && seg[3] === 'stats') {
    const p = findPlayer(seg[2]);
    if (!p) throw new DemoError(404, 'Player not found');
    return playerStats(p);
  }
  if (route === 'GET features/theme') return state.theme;
  if (seg[0] === 'features' && seg[1] === 'extensions') return extensions.handle(method, seg, body, q);
  if (seg[0] === 'plugins') return extensions.plugin(method, seg);

  const fromExtra = extra.publicRoute(method, path, seg, q, body);
  if (fromExtra !== undefined) return fromExtra;

  if (seg[0] === 'setup') notInDemo();

  // Everything else is for the team only
  requireStaff();
  return handleAdmin(method, path, seg, q, body);
}

function handleAdmin(method: string, path: string, seg: string[], q: URLSearchParams, body: Any): Any {
  const route = `${method} ${path}`;
  const id = Number(seg[3]);
  const fromExtra = extra.adminRoute(method, path, seg, q, body);
  if (fromExtra !== undefined) return fromExtra;

  // Serveur
  if (route === 'GET admin/server/overview') {
    return {
      mode: 'managed', service: state.service, status: status(),
      host: { cpus: 8, load: 0.8 + Math.random() * 0.6, memTotal: 17_179_869_184, memFree: 7_600_000_000 + Math.random() * 400_000_000, uptime: (Date.now() - START) / 1000 + 864_000 },
      metrics,
    };
  }
  if (method === 'POST' && seg[0] === 'admin' && seg[1] === 'server' && ['start', 'stop', 'restart'].includes(seg[2])) {
    const action = seg[2];
    if (action === 'stop') {
      state.service = 'inactive';
      log('Shutdown handler: server stopped by PalCMS');
    } else {
      state.service = 'active';
      state.serviceSince = Date.now();
      log('Running Palworld dedicated server on :8211');
    }
    record(`server.${action}`);
    return { message: { start: 'Server started', stop: 'Server stopped', restart: 'Server restarted' }[action] };
  }
  if (route === 'GET admin/server/config') return { entries: state.config };
  if (route === 'PUT admin/server/config') {
    for (const [key, value] of Object.entries(body.values ?? {})) {
      const e = state.config.find((x: Any) => x.key === key);
      if (e && !e.locked) e.value = value;
    }
    record('server.config');
    if (body.restart) state.serviceSince = Date.now();
    return { message: body.restart ? 'Configuration saved, server restarted' : 'Configuration saved (applied on next restart)' };
  }
  if (route === 'GET admin/server/logs') return { lines: logs.slice(-Number(q.get('lines') ?? 300)) };
  if (route === 'GET admin/server/players') {
    return {
      online: onlinePlayers().map((p) => ({ uid: p.uid, name: p.name, level: p.level, ping: p.ping, ip: p.ip })),
      history: players.map((p) => ({
        uid: p.uid, publicId: p.publicId, name: p.name, level: p.level, online: serverOnline() && p.online ? 1 : 0, firstSeen: p.firstSeen,
        lastSeen: p.lastSeen, playtimeSeconds: Math.round(p.playtimeSeconds), member: null,
      })),
    };
  }
  if (route === 'GET admin/server/connection') return { mode: 'managed', external: null };
  if (seg[0] === 'admin' && seg[1] === 'server' && seg[2] === 'connection') notInDemo();

  // Site
  if (route === 'GET admin/site/settings') return { site: state.site, steamApiKeySet: state.steamApiKeySet };
  if (route === 'PUT admin/site/settings') {
    state.site = { ...state.site, ...body };
    record('settings.update', 'site');
    return { site: state.site };
  }
  if (route === 'PUT admin/site/steam-api-key') {
    state.steamApiKeySet = !!body?.key;
    return { ok: true };
  }
  if (route === 'GET admin/site/modules') return state.modules;
  if (method === 'PUT' && path.startsWith('admin/site/modules/')) {
    const m = state.modules.find((x: Any) => x.id === seg[3]);
    if (m) m.enabled = !!body.enabled;
    record('module.toggle', seg[3]);
    return state.modules;
  }
  if (route === 'GET admin/site/pages') return state.pages;
  if (route === 'POST admin/site/pages') {
    if (state.pages.some((p: Any) => p.slug === body.slug)) throw new DemoError(409, 'This address is already used');
    const p = { ...body, id: state.nextId++, updatedAt: Date.now() };
    state.pages.push(p);
    record('page.create', p.slug);
    return p;
  }
  if (seg[0] === 'admin' && seg[1] === 'site' && seg[2] === 'pages') {
    const i = state.pages.findIndex((p: Any) => p.id === id);
    if (i < 0) throw new DemoError(404, 'Page not found');
    if (method === 'GET') return state.pages[i];
    if (method === 'PUT') {
      state.pages[i] = { ...state.pages[i], ...body, updatedAt: Date.now() };
      record('page.update', state.pages[i].slug);
      return state.pages[i];
    }
    if (method === 'DELETE') {
      record('page.delete', state.pages[i].slug);
      state.pages.splice(i, 1);
      return { ok: true };
    }
  }
  if (route === 'GET admin/site/news') return [...state.news].sort((a: Any, b: Any) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  if (route === 'POST admin/site/news') {
    const n = {
      ...body, id: state.nextId++, slug: body.slug || slugify(body.title), coverUrl: body.coverUrl || null, author: state.user.username,
      publishedAt: body.published ? Date.now() : null,
    };
    state.news.push(n);
    record('news.create', n.slug);
    return n;
  }
  if (seg[0] === 'admin' && seg[1] === 'site' && seg[2] === 'news') {
    const i = state.news.findIndex((n: Any) => n.id === id);
    if (i < 0) throw new DemoError(404, 'Article not found');
    if (method === 'GET') return state.news[i];
    if (method === 'PUT') {
      const old = state.news[i];
      state.news[i] = { ...old, ...body, slug: body.slug || old.slug, coverUrl: body.coverUrl || null, publishedAt: body.published ? old.publishedAt ?? Date.now() : null };
      record('news.update', state.news[i].slug);
      return state.news[i];
    }
    if (method === 'DELETE') {
      record('news.delete', state.news[i].slug);
      state.news.splice(i, 1);
      return { ok: true };
    }
  }
  if (route === 'POST admin/site/upload' || route === 'POST features/map/image') {
    // demoRequest already turned the file into a data URL
    const url = body?.dataUrl;
    if (!url) throw new DemoError(400, 'No file');
    if (path === 'features/map/image') {
      state.map.settings = { ...state.map.settings, image: 'custom', customUrl: url };
      return state.map.settings;
    }
    return { url };
  }

  // Membres
  if (route === 'GET admin/members') {
    const list = q.get('status') ? state.members.filter((m: Any) => m.status === q.get('status')) : state.members;
    return list;
  }
  if (route === 'GET admin/members/players') return players.map((p) => ({ uid: p.uid, name: p.name, level: p.level, lastSeen: p.lastSeen }));
  if (seg[0] === 'admin' && seg[1] === 'members') {
    const m = state.members.find((x: Any) => x.id === Number(seg[2]));
    if (!m) throw new DemoError(404, 'Member not found');
    if (m.role === 'superadmin') throw new DemoError(403, 'The main administrator account cannot be changed here');
    if (method === 'DELETE') {
      state.members = state.members.filter((x: Any) => x !== m);
      return { ok: true };
    }
    const action = seg[3];
    m.status = { approve: 'active', reject: 'rejected', ban: 'banned', unban: 'active' }[action as 'approve'] ?? m.status;
    if (action === 'approve' && body?.playerUid) {
      const p = findPlayer(body.playerUid);
      if (p) Object.assign(m, { playerUid: p.uid, playerName: p.name, playerLevel: p.level });
    }
    record(`member.${action}`, m.username);
    return { ok: true };
  }

  // Sauvegardes
  if (route === 'GET features/backups') {
    return { settings: state.backupSettings, running: false, lastAt: state.backups[state.backups.length - 1]?.createdAt ?? 0, items: [...state.backups].reverse() };
  }
  if (route === 'POST features/backups') {
    const at = Date.now();
    const b = { name: backupName(at, 'manual'), size: 48_600_000 + Math.round(Math.random() * 900_000), createdAt: at, tag: 'manual' };
    state.backups.push(b);
    record('backup.create', b.name);
    return { name: b.name };
  }
  if (route === 'PUT features/backups/settings') {
    state.backupSettings = { ...state.backupSettings, ...body };
    return { ok: true };
  }
  if (seg[0] === 'features' && seg[1] === 'backups') {
    const name = decodeURIComponent(seg[2]);
    if (method === 'DELETE') {
      state.backups = state.backups.filter((b: Any) => b.name !== name);
      record('backup.delete', name);
      return { ok: true };
    }
    if (seg[3] === 'restore') {
      const at = Date.now();
      state.backups.push({ name: backupName(at, 'prerestore'), size: 48_700_000, createdAt: at, tag: 'prerestore' });
      state.serviceSince = at;
      record('backup.restore', name);
      log(`World restored from ${name}`);
      return { ok: true };
    }
  }

  // Programmation
  if (route === 'GET features/schedules') {
    const next = state.schedules.enabled ? nextTime(state.schedules.times) : null;
    return { settings: state.schedules, next, pending: state.pendingRestart, busy: false };
  }
  if (route === 'PUT features/schedules') {
    state.schedules = { ...state.schedules, ...body };
    return { ok: true };
  }
  if (route === 'POST features/schedules/restart-now') {
    state.pendingRestart = { at: Date.now() + (body.delayMinutes ?? 0) * 60_000, update: !!body.update };
    return { ok: true };
  }
  if (route === 'DELETE features/schedules/pending') {
    state.pendingRestart = null;
    return { ok: true };
  }

  // Annonces
  if (route === 'POST features/announce') {
    log(`[CHAT] <SERVER> ${body.message}`);
    record('server.announce', null);
    return { ok: true };
  }
  if (route === 'GET features/announcements') return state.announcements;
  if (route === 'POST features/announcements') {
    state.announcements.push({ id: state.nextId++, message: body.message, runAt: body.runAt, repeat: body.repeat ?? 'none', createdBy: state.user.username });
    return { ok: true };
  }
  if (method === 'DELETE' && seg[0] === 'features' && seg[1] === 'announcements') {
    state.announcements = state.announcements.filter((a: Any) => a.id !== Number(seg[2]));
    return { ok: true };
  }

  // Moderation
  if (method === 'POST' && seg[0] === 'features' && seg[1] === 'players') {
    const p = findPlayer(decodeURIComponent(seg[2]));
    if (!p) throw new DemoError(404, 'Player not found');
    p.online = false;
    if (seg[3] === 'ban') state.bans.push({ uid: p.uid, name: p.name, reason: body.reason ?? '', bannedAt: Date.now(), bannedBy: state.user.username });
    log(`${p.name} was ${seg[3] === 'ban' ? 'banned' : 'kicked'} by PalCMS`);
    record(`player.${seg[3]}`, p.name);
    return { ok: true };
  }
  if (route === 'GET features/bans') return state.bans;
  if (method === 'DELETE' && seg[0] === 'features' && seg[1] === 'bans') {
    state.bans = state.bans.filter((b: Any) => b.uid !== decodeURIComponent(seg[2]));
    return { ok: true };
  }
  if (route === 'GET features/whitelist') return state.whitelist;
  if (route === 'PUT features/whitelist/settings') {
    state.whitelist.settings = { ...state.whitelist.settings, ...body };
    return { ok: true };
  }
  if (route === 'POST features/whitelist') {
    const p = findPlayer(body.uid);
    state.whitelist.entries.push({ uid: body.uid, name: p?.name ?? body.uid, addedAt: Date.now(), addedBy: state.user.username });
    return { ok: true };
  }
  if (method === 'DELETE' && seg[0] === 'features' && seg[1] === 'whitelist') {
    state.whitelist.entries = state.whitelist.entries.filter((e: Any) => e.uid !== decodeURIComponent(seg[2]));
    return { ok: true };
  }

  // RCON
  if (route === 'GET features/rcon') return { ...state.rcon, managed: true, mode: 'managed' };
  if (route === 'POST features/rcon/enable') {
    state.rcon.enabled = true;
    return { ok: true };
  }
  if (route === 'POST features/rcon/exec') return { output: rcon(String(body.command ?? '')) };

  // Discord
  if (route === 'GET features/discord') return { ...state.discord, configured: !!state.discord.webhookUrl };
  if (route === 'PUT features/discord') {
    state.discord = { ...state.discord, ...body };
    return { ok: true };
  }
  if (route === 'POST features/discord/test') throw new DemoError(400, 'Nothing is sent to Discord from the demo.');

  // Carte
  if (route === 'PUT features/map/settings') {
    const { public: isPublic, ...settings } = body;
    if (typeof isPublic === 'boolean') state.map.public = isPublic;
    state.map.settings = { ...state.map.settings, ...settings };
    return state.map.settings;
  }
  if (route === 'POST features/map/poi') {
    const p = { ...body, id: state.nextId++ };
    state.map.pois.push(p);
    record('map.poi.create', p.label);
    return p;
  }
  if (seg[0] === 'features' && seg[1] === 'map' && seg[2] === 'poi') {
    const pid = Number(seg[3]);
    if (method === 'PUT') state.map.pois = state.map.pois.map((p: Any) => (p.id === pid ? { ...body, id: pid } : p));
    if (method === 'DELETE') state.map.pois = state.map.pois.filter((p: Any) => p.id !== pid);
    return { ok: true };
  }

  // Theme
  if (route === 'PUT features/theme') {
    state.theme = { ...state.theme, ...body };
    return state.theme;
  }

  // Team and roles
  if (route === 'GET features/team') return state.team;
  if (route === 'GET features/team/candidates') {
    const term = (q.get('q') ?? '').toLowerCase();
    return state.members
      .filter((m: Any) => m.role === 'player' && m.status === 'active' && m.username.includes(term))
      .map((m: Any) => ({ id: m.id, username: m.username, displayName: m.displayName }));
  }
  if (method === 'PUT' && seg[0] === 'features' && seg[1] === 'team') {
    const mid = Number(seg[2]);
    const role = state.team.roles.find((r: Any) => r.id === body.roleId);
    const member = state.members.find((m: Any) => m.id === mid);
    state.team.staff = state.team.staff.filter((s: Any) => s.id !== mid || s.role === 'superadmin');
    if (role && member) {
      state.team.staff.push({ id: mid, username: member.username, displayName: member.displayName, role: 'admin', roleId: role.id, roleName: role.name, lastLoginAt: member.lastLoginAt });
    }
    return { ok: true };
  }
  if (route === 'POST features/roles') {
    state.team.roles.push({ id: state.nextId++, name: body.name, builtin: false, permissions: body.permissions ?? [] });
    return { ok: true };
  }
  if (seg[0] === 'features' && seg[1] === 'roles') {
    const rid = Number(seg[2]);
    const r = state.team.roles.find((x: Any) => x.id === rid);
    if (r?.builtin) throw new DemoError(403, 'Built-in roles cannot be changed in the demo');
    if (method === 'PUT') state.team.roles = state.team.roles.map((x: Any) => (x.id === rid ? { ...x, ...body } : x));
    if (method === 'DELETE') state.team.roles = state.team.roles.filter((x: Any) => x.id !== rid);
    return { ok: true };
  }

  // Journal
  if (route === 'GET features/audit') {
    const term = (q.get('q') ?? '').toLowerCase();
    const items = state.audit.filter((a: Any) => !term || `${a.action} ${a.target ?? ''}`.toLowerCase().includes(term));
    return { items: items.slice(0, 50), page: 1, pages: 1 };
  }

  throw new DemoError(404, 'Not found');
}

function nextTime(times: string[]): number | null {
  const now = new Date();
  let best: number | null = null;
  for (const t of times) {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    if (best === null || d.getTime() < best) best = d.getTime();
  }
  return best;
}

function rcon(command: string): string {
  const [name, ...rest] = command.trim().split(/\s+/);
  switch (name.toLowerCase()) {
    case 'info':
      return `Welcome to Pal Server[v1.0.5.102999] ${serverName()}`;
    case 'showplayers':
      return ['name,playeruid,steamid', ...onlinePlayers().map((p) => `${p.name},${p.publicId},${p.uid.replace('steam_', '')}`)].join('\n');
    case 'save':
      return 'Complete Save';
    case 'broadcast':
      log(`[CHAT] <SERVER> ${rest.join(' ')}`);
      return `Broadcasted: ${rest.join(' ')}`;
    case '':
      return '';
    default:
      return `Unknown command: ${name}`;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new DemoError(400, 'Unreadable file'));
    reader.readAsDataURL(file);
  });
}

// Entry point used by lib/api.ts

export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Small delay so the interface behaves as with a real server
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
  if (body instanceof FormData) {
    const file = body.get('file');
    body = file instanceof File ? { dataUrl: await readAsDataUrl(file) } : {};
  }
  try {
    const result = await handle(method, path, body);
    if (method !== 'GET') save();
    return structuredClone(result) as T;
  } catch (e) {
    if (e instanceof DemoError) throw Object.assign(new Error(e.message), { status: e.status });
    throw e;
  }
}
