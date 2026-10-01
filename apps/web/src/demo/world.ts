// Demo: world data, monitoring, events, sanctions, reports and updates.

import { INI_FIELDS, PALDEX, paldexId } from '@palcms/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface DemoPlayer {
  uid: string;
  publicId: string;
  name: string;
  level: number;
  online: boolean;
  x: number;
  y: number;
  lastSeen: number;
  firstSeen: number;
}

export interface DemoContext {
  players: DemoPlayer[];
  state: () => Any;
  start: number;
  online: () => boolean;
  status: () => Any;
  metrics: () => { ts: number; fps: number; players: number }[];
  log: (line: string) => void;
  record: (action: string, target?: string | null) => void;
  fail: (status: number, message: string) => never;
}

const DAY = 86_400_000;

const PALS: [string, string][] = [
  ['SheepBall', 'Lamball'], ['PinkCat', 'Cattiva'], ['ChickenPal', 'Chikipi'], ['Kitsunebi', 'Foxparks'], ['Penguin', 'Pengullet'],
  ['Carbunclo', 'Lifmunk'], ['Anubis', 'Anubis'], ['JetDragon', 'Jetragon'], ['Garm', 'Direhowl'], ['WoolFox', 'Cremis'],
  ['Mutant', 'Lunaris'], ['FlameBuffalo', 'Arsox'], ['LazyDragon', 'Relaxaurus'], ['ThunderDragonMan', 'Orserk'], ['HadesBird', 'Helzephyr'],
  ['SakuraSaurus', 'Broncherry'], ['Alpaca', 'Melpaca'], ['GrassMammoth', 'Mammorest'], ['NightFox', 'Nox'], ['FlowerDinosaur', 'Dinossom'],
  ['IceHorse', 'Frostallion'], ['Horus', 'Faleris'], ['BlackGriffon', 'Shadowbeak'], ['ElecPanda', 'Grizzbolt'],
];
const PASSIVES = ['Lucky', 'Legend', 'Artisan', 'Ferocious', 'Hard Skin', 'Flame Emperor', 'Insomniac', 'Mine Foreman'];
const ITEMS: [string, string, number][] = [
  ['money', 'Gold Coin', 80000], ['stone', 'Stone', 900], ['wood', 'Wood', 700], ['palsphere', 'Pal Sphere', 40], ['palsphere_mega', 'Mega Sphere', 15],
  ['copperingot', 'Ingot', 120], ['berries', 'Red Berries', 60], ['honey', 'Honey', 12], ['palfluid', 'Aquatic Pal Fluids', 30], ['cloth', 'Cloth', 80],
];
const GUILDS = [
  { id: 'g1a2b3c4d5e6', name: 'The Pioneers', level: 22, members: [0, 1, 2], bases: [[-250000, 150000], [-180000, 60000]] },
  { id: 'g7f8a9b0c1d2', name: 'Order of the Phoenix', level: 17, members: [3, 4, 5], bases: [[-420000, -60000]] },
  { id: 'ge3f4a5b6c7d', name: 'Tanuki Corp', level: 9, members: [6, 7], bases: [[-60000, 220000]] },
  { id: 'g8e9f0a1b2c3', name: 'The Nomads', level: 4, members: [8, 9], bases: [] },
];
// Fixed points (sample) for the map layers
const FAST_TRAVEL: [number, number][] = [
  [-266563, 174506], [-361695, -112009], [81363, 90183], [29975, 413325], [-321596, 209085], [-778215, -36026], [-108093, 77936], [-29427, -115900],
  [-470000, 120000], [-150000, -250000], [60000, -180000], [-560000, -300000],
];
const BOSS_TOWERS: [number, number][] = [[-266563, 174506], [-361695, -112009], [81363, 90183], [29975, 413325], [-778215, -36026]];

function rng(seedValue: number) {
  let s = seedValue;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface PalRow {
  type: string;
  name: string;
  nickname: string;
  level: number;
  gender: string;
  lucky: boolean;
  boss: boolean;
  rank: number;
  talents: { hp: number; attack: number; defense: number };
  passives: { id: string; name: string }[];
}

export function createWorldDemo(ctx: DemoContext) {
  // World data generated once, the same for every visitor
  const r = rng(7);
  const world = ctx.players.map((p, i) => {
    const pals: PalRow[] = Array.from({ length: 6 + Math.floor(r() * 26) }, () => {
      const [type, name] = PALS[Math.floor(r() * PALS.length)];
      const boss = r() < 0.08;
      return {
        type: boss ? `BOSS_${type}` : type,
        name,
        nickname: r() < 0.12 ? `${p.name.slice(0, 3)}${Math.floor(r() * 90 + 10)}` : '',
        level: 1 + Math.floor(r() * p.level),
        gender: r() < 0.5 ? 'Male' : 'Female',
        lucky: r() < 0.05,
        boss,
        rank: 1 + Math.floor(r() * 4),
        talents: { hp: Math.floor(r() * 100), attack: Math.floor(r() * 100), defense: Math.floor(r() * 100) },
        passives: PASSIVES.filter(() => r() < 0.18).map((n) => ({ id: n, name: n })),
      };
    }).sort((a, b) => b.level - a.level);
    const inventory = [
      { key: 'CommonContainerId', label: 'Inventory', items: ITEMS.filter(() => r() < 0.75).map(([id, name, max], slot) => ({ id, name, count: 1 + Math.floor(r() * max), slot })) },
      { key: 'WeaponLoadOutContainerId', label: 'Weapons', items: [{ id: 'assaultrifle_default1', name: 'Assault Rifle', count: 1, slot: 0 }] },
      { key: 'PlayerEquipArmorContainerId', label: 'Equipment', items: [{ id: 'clotharmor', name: 'Cloth Outfit', count: 1, slot: 0 }] },
      { key: 'EssentialContainerId', label: 'Key items', items: [{ id: 'glider_good', name: 'Mega Glider', count: 1, slot: 0 }] },
    ];
    if (i === 5) inventory[0].items.push({ id: 'palsphere_legend', name: 'Legendary Sphere', count: 45000, slot: 20 });
    const statusPoints = { 最大HP: Math.floor(r() * 20), 最大SP: Math.floor(r() * 10), 攻撃力: Math.floor(r() * 15), 所持重量: Math.floor(r() * 20) };
    return { publicId: p.publicId, pals, inventory, statusPoints };
  });
  const wOf = (publicId: string) => world.find((w) => w.publicId === publicId);
  const guildOf = (i: number) => GUILDS.find((g) => g.members.includes(i));

  const guildDetail = (g: (typeof GUILDS)[number]) => ({
    id: g.id,
    name: g.name,
    level: g.level,
    members: g.members.map((i, n) => ({
      name: ctx.players[i].name,
      publicId: ctx.players[i].publicId,
      level: ctx.players[i].level,
      pals: world[i].pals.length,
      leader: n === 0,
      lastOnline: new Date(ctx.players[i].lastSeen).toISOString(),
    })),
    baseCount: g.bases.length,
    bases: g.bases.map(([x, y]) => ({ x, y, area: 3500 })),
    syncedAt: syncedAt(),
  });
  const syncedAt = () => ctx.state().worldSyncedAt ?? ctx.start - 6 * 60_000;

  const s = () => {
    const st = ctx.state();
    // Defaults of newer features for a demo started before them
    st.extra ??= {
      tickets: [
        { id: 1, userId: 0, username: 'lyra', kind: 'report', subject: 'Endless spheres', message: 'Oskar has thousands of Legendary Spheres, that is odd.', target: 'Oskar', status: 'open', reply: null, repliedBy: null, createdAt: ctx.start - 3 * 3600_000 },
        { id: 2, userId: 0, username: 'kaito', kind: 'suggestion', subject: 'Egg hunt', message: 'How about an egg hunt event next weekend?', target: null, status: 'answered', reply: 'Great idea, it is planned!', repliedBy: 'admin', createdAt: ctx.start - 2 * DAY },
      ],
      myTickets: [] as Any[],
      events: [
        { id: 1, name: 'XP x3 weekend', description: 'Triple experience all weekend long!', startsAt: ctx.start + 2 * DAY, endsAt: ctx.start + 4 * DAY, values: { ExpRate: 3, PalCaptureRate: 2 }, restart: true, isPublic: true, status: 'scheduled', error: null },
        { id: 2, name: 'Capture night', description: 'Double capture rate.', startsAt: ctx.start - 3600_000, endsAt: ctx.start + 5 * 3600_000, values: { PalCaptureRate: 2 }, restart: true, isPublic: true, status: 'active', error: null },
        { id: 3, name: 'Server launch', description: 'First week with x2 rates.', startsAt: ctx.start - 14 * DAY, endsAt: ctx.start - 7 * DAY, values: { ExpRate: 2 }, restart: true, isPublic: true, status: 'done', error: null },
      ],
      presets: [] as Any[],
      flags: [
        { id: 1, uid: ctx.players[5].uid, name: ctx.players[5].name, publicId: ctx.players[5].publicId, kind: 'items:palsphere_legend', severity: 3, details: '45000 × Legendary Sphere (threshold 20000)', createdAt: ctx.start - 40 * 60_000, resolvedAt: null, resolvedBy: null, resolution: null },
      ],
      sanctions: [
        { id: 1, uid: ctx.players[5].uid, type: 'warning', reason: 'Inappropriate language in the chat', expiresAt: null, createdAt: ctx.start - 5 * DAY, createdBy: 'admin' },
        { id: 2, uid: ctx.players[5].uid, type: 'note', reason: 'Keep an eye on: abnormal sphere stock', expiresAt: null, createdAt: ctx.start - 3600_000, createdBy: 'admin' },
      ],
      alerts: [
        { id: 1, ts: ctx.start - 26 * 3600_000, level: 'critical', kind: 'crash', message: 'The server stopped although no stop was planned (probable crash)', resolvedAt: ctx.start - 26 * 3600_000 + 60_000 },
        { id: 2, ts: ctx.start - 3 * 3600_000, level: 'warning', kind: 'fps', message: 'Low server FPS: 17 (threshold 20)', resolvedAt: ctx.start - 3 * 3600_000 + 5 * 60_000 },
      ],
      thresholds: { enabled: true, fpsLow: 20, memoryHigh: 90, diskLow: 10 },
      anticheat: { enabled: true, levelJump: 6, levelsPerHour: 20, itemStack: 20000, money: 10000000 },
      worldSettings: { enabled: true, intervalMinutes: 15 },
      serverUpdate: { auto: true, checkMinutes: 30, warnings: [15, 5, 1] },
      nextId: 50,
    };
    return st.extra;
  };

  const publicEvent = (e: Any) => ({ id: e.id, name: e.name, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, status: e.status, changes: describe(e.values) });
  // Same wording as describeValues() on the server, translated on display.
  const describe = (v: Record<string, Any>) =>
    Object.entries(v).map(([k, x]) => `${INI_FIELDS[k]?.label ?? k}: ${typeof x === 'number' && /Rate/.test(k) ? `x${x}` : x}`);

  const PRESETS = [
    { id: 'casual', name: 'Casual', description: 'Relaxed play: more XP, easy captures, nothing lost on death.', values: { Difficulty: 'Casual', ExpRate: 1.5, PalCaptureRate: 1.5, DeathPenalty: 'None' } },
    { id: 'normal', name: 'Normal', description: 'The default game settings.', values: { Difficulty: 'None', ExpRate: 1, PalCaptureRate: 1, DeathPenalty: 'All' } },
    { id: 'hard', name: 'Hard', description: 'Stronger enemies, scarcer resources, everything lost on death.', values: { Difficulty: 'Hard', ExpRate: 0.8, CollectionDropRate: 0.8, DeathPenalty: 'All' } },
    { id: 'x2', name: 'Rates x2', description: 'Double experience, captures, gathering and loot.', values: { ExpRate: 2, PalCaptureRate: 2, CollectionDropRate: 2, EnemyDropItemRate: 2 } },
    { id: 'x3', name: 'Rates x3', description: 'Triple experience, captures, gathering and loot.', values: { ExpRate: 3, PalCaptureRate: 2, CollectionDropRate: 3, EnemyDropItemRate: 3 } },
  ];
  const applyValues = (values: Record<string, Any>) => {
    for (const [k, v] of Object.entries(values)) {
      const e = ctx.state().config.find((x: Any) => x.key === k);
      if (e) e.value = v;
    }
  };

  /** Public routes (or logged-in player). Returns undefined when the route is not handled here. */
  function publicRoute(method: string, path: string, seg: string[], q: URLSearchParams, body: Any): Any {
    const route = `${method} ${path}`;
    if (route === 'GET features/guilds') {
      return { syncedAt: syncedAt(), guilds: GUILDS.map((g) => ({ ...guildDetail(g), memberCount: g.members.length, leader: ctx.players[g.members[0]].name, members: undefined })) };
    }
    if (method === 'GET' && seg[0] === 'features' && seg[1] === 'guilds' && seg[2]) {
      const g = GUILDS.find((x) => x.id === seg[2]);
      if (!g) ctx.fail(404, 'Guild not found');
      return guildDetail(g!);
    }
    if (route === 'GET features/paldex') {
      const joueur = q.get('joueur');
      const guilde = q.get('guilde');
      let owners: number[] = ctx.players.map((_, i) => i);
      let scope: Any = { type: 'server', id: null, name: 'Serveur', guild: null };
      if (joueur) {
        const i = ctx.players.findIndex((p) => p.publicId === joueur);
        if (i < 0) ctx.fail(404, 'Player not found in the save file');
        const g = guildOf(i);
        scope = { type: 'player', id: joueur, name: ctx.players[i].name, guild: g ? { id: g.id, name: g.name } : null };
        owners = [i];
      } else if (guilde) {
        const g = GUILDS.find((x) => x.id === guilde);
        if (!g) ctx.fail(404, 'Guild not found');
        scope = { type: 'guild', id: guilde, name: g!.name, guild: null };
        owners = g!.members;
      }
      const pals = owners.flatMap((i) => world[i].pals.map((p) => ({ ...p, owner: i })));
      const entries = PALDEX.map((s) => {
        const mine = pals.filter((p) => paldexId(p.type) === s.id);
        return {
          ...s,
          count: mine.length,
          owners: new Set(mine.map((p) => p.owner)).size,
          lucky: mine.filter((p) => p.lucky).length,
          alpha: mine.filter((p) => p.boss).length,
          maxLevel: Math.max(0, ...mine.map((p) => p.level)),
        };
      });
      const species = (idx: number[]) => new Set(idx.flatMap((i) => world[i].pals.map((p) => paldexId(p.type)))).size;
      const collectors = ctx.players
        .map((p, i) => ({ id: p.publicId, name: p.name, species: species([i]), pals: world[i].pals.length }))
        .sort((a, b) => b.species - a.species || b.pals - a.pals);
      const guilds = GUILDS.map((g) => ({ id: g.id, name: g.name, species: species(g.members), pals: g.members.reduce((n, i) => n + world[i].pals.length, 0) })).sort(
        (a, b) => b.species - a.species,
      );
      return {
        syncedAt: syncedAt(),
        scope,
        total: PALDEX.length,
        caught: entries.filter((e) => e.count > 0).length,
        pals: pals.length,
        lucky: pals.filter((p) => p.lucky).length,
        entries,
        collectors,
        guilds,
      };
    }
    if (route === 'GET features/world/map') {
      return {
        bases: GUILDS.flatMap((g) => g.bases.map(([x, y]) => ({ x, y, guild: g.name, guildId: g.id, level: g.level }))),
        fastTravel: FAST_TRAVEL,
        bossTowers: BOSS_TOWERS,
      };
    }
    if (route === 'GET features/calendar') {
      const ev = s().events.filter((e: Any) => e.isPublic);
      return {
        upcoming: ev.filter((e: Any) => ['scheduled', 'active'].includes(e.status) && e.endsAt > Date.now()).sort((a: Any, b: Any) => a.startsAt - b.startsAt).map(publicEvent),
        past: ev.filter((e: Any) => e.status === 'done').map(publicEvent),
      };
    }
    if (route === 'GET features/uptime') {
      const days = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(ctx.start - (29 - i) * DAY);
        return { day: d.toISOString().slice(0, 10), percent: i === 28 ? 97.4 : i === 17 ? 99.1 : 100 };
      });
      const hourly = Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0.2, Math.sin(((h - 8) / 24) * 2 * Math.PI) * 6 + 1.5) * 10) / 10);
      const next = new Date();
      next.setHours(6, 0, 0, 0);
      if (next.getTime() < Date.now()) next.setDate(next.getDate() + 1);
      return { status: ctx.status(), uptimePercent: 99.9, days, hourly, nextRestart: next.getTime() };
    }
    // Logged-in player
    if (route === 'GET features/me/character') {
      if (!ctx.state().user) ctx.fail(401, 'Login required');
      const p = ctx.players[0];
      const w = world[0];
      const g = guildOf(0)!;
      return {
        linked: true,
        publicId: p.publicId,
        name: p.name,
        syncedAt: syncedAt(),
        world: { level: p.level, statusPoints: w.statusPoints, inventory: w.inventory, pals: w.pals, guild: { id: g.id, name: g.name, level: g.level }, bases: g.bases.map(([x, y]) => ({ x, y })) },
      };
    }
    if (route === 'GET features/me/tickets') {
      if (!ctx.state().user) ctx.fail(401, 'Login required');
      return s().myTickets;
    }
    if (route === 'POST features/tickets') {
      if (!ctx.state().user) ctx.fail(401, 'Login required');
      if (!body?.subject || String(body.subject).length < 3) ctx.fail(400, 'Subject too short');
      if (!body?.message || String(body.message).length < 10) ctx.fail(400, 'Message too short (10 characters minimum)');
      const t = { id: s().nextId++, userId: 0, username: ctx.state().user.username, kind: body.kind, subject: body.subject, message: body.message, target: body.target ?? null, status: 'open', reply: null, repliedBy: null, createdAt: Date.now() };
      s().tickets.unshift(t);
      s().myTickets.unshift(t);
      return { id: t.id };
    }
    return undefined;
  }

  /** Team routes (login already checked). */
  function adminRoute(method: string, path: string, seg: string[], q: URLSearchParams, body: Any): Any {
    const route = `${method} ${path}`;
    const v = s();

    // World data
    if (route === 'GET features/world/status') {
      return {
        available: true,
        settings: v.worldSettings,
        running: false,
        installing: false,
        lastAt: syncedAt(),
        lastDurationMs: 8400,
        lastError: null,
        counts: { players: world.length, pals: world.reduce((n, w) => n + w.pals.length, 0), guilds: GUILDS.length, bases: GUILDS.reduce((n, g) => n + g.bases.length, 0) },
      };
    }
    if (route === 'PUT features/world/settings') {
      v.worldSettings = body;
      return body;
    }
    if (route === 'POST features/world/sync') {
      ctx.state().worldSyncedAt = Date.now();
      ctx.record('world.sync');
      return { ok: true, lastAt: Date.now(), durationMs: 8400 };
    }
    if (method === 'GET' && path.startsWith('features/world/players/')) {
      const i = ctx.players.findIndex((p) => p.publicId === seg[3]);
      if (i < 0) ctx.fail(404, 'Player not found');
      const p = ctx.players[i];
      const w = wOf(p.publicId)!;
      const g = guildOf(i);
      return {
        name: p.name, level: p.level, exp: p.level * 12_345, hp: 50000, stomach: 80, statusPoints: w.statusPoints, inventory: w.inventory, pals: w.pals,
        guild: g ? { id: g.id, name: g.name, level: g.level } : null, syncedAt: syncedAt(),
      };
    }
    if (route === 'GET features/world/items') {
      const term = (q.get('q') ?? '').toLowerCase();
      if (term.length < 2) return { results: [] };
      const results = world.flatMap((w, i) =>
        w.inventory.flatMap((c) => c.items.filter((it) => it.id.includes(term) || it.name.toLowerCase().includes(term)).map((it) => ({ item: it.id, itemName: it.name, player: ctx.players[i].name, publicId: ctx.players[i].publicId, count: it.count, container: c.label }))),
      );
      return { results: results.sort((a, b) => b.count - a.count) };
    }

    // Surveillance
    if (route === 'GET features/monitoring/health') {
      const st = ctx.status();
      return {
        mode: 'managed',
        service: ctx.state().service,
        status: st,
        metrics: st.online ? { fps: st.fps, frameTime: 16.9, players: st.players, maxPlayers: st.maxPlayers, baseCamps: 5, days: st.days, uptime: st.uptime } : null,
        host: { cpus: 8, load: 1.1 + Math.random() * 0.5, memory: { total: 17_179_869_184, available: 7_900_000_000 }, disk: { total: 200e9, free: 162e9 } },
        apis: { rest: st.online, rcon: ctx.state().rcon.enabled, world: syncedAt() },
        thresholds: v.thresholds,
        openAlerts: v.alerts.filter((a: Any) => !a.resolvedAt).length,
      };
    }
    if (route === 'GET features/monitoring/history') {
      const range = q.get('range') ?? '24h';
      const count = { '24h': 288, '7d': 168, '30d': 180 }[range] ?? 288;
      const step = { '24h': 300_000, '7d': 3600_000, '30d': 4 * 3600_000 }[range] ?? 300_000;
      const pts = Array.from({ length: count }, (_, i) => {
        const ts = Date.now() - (count - i) * step;
        const hour = new Date(ts).getHours();
        const crowd = Math.max(0, Math.sin(((hour - 8) / 24) * 2 * Math.PI)) * 7;
        return { ts, fps: 55 + Math.round(Math.random() * 5), players: Math.round(1 + crowd + Math.random() * 2), frameTime: 16.8 };
      });
      return { range, points: range === '24h' ? pts.filter((_, i) => i % 4 === 0) : pts };
    }
    if (route === 'GET features/monitoring/alerts') return { items: [...v.alerts].sort((a: Any, b: Any) => b.ts - a.ts) };
    if (route === 'POST features/monitoring/alerts/clear') {
      v.alerts.forEach((a: Any) => (a.resolvedAt ??= Date.now()));
      return { ok: true };
    }
    if (route === 'PUT features/monitoring/thresholds') {
      v.thresholds = body;
      return body;
    }
    if (route === 'POST features/monitoring/save') {
      ctx.log('World saved');
      return { ok: true };
    }
    if (route === 'POST features/monitoring/shutdown') {
      ctx.state().service = 'inactive';
      ctx.log(`Shutdown in ${body.seconds} s: ${body.message}`);
      ctx.record('server.shutdown', `${body.seconds} s`);
      return { ok: true };
    }
    if (route === 'GET features/stats/attendance') {
      const heatmap = Array.from({ length: 7 }, (_, d) =>
        Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0, Math.sin(((h - 8) / 24) * 2 * Math.PI) * (d >= 4 ? 8 : 5) + (d >= 5 ? 2 : 0) + Math.random()) * 10) / 10),
      );
      const daily = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(Date.now() - (29 - i) * DAY);
        const unique = 4 + Math.round(Math.random() * 5) + (d.getDay() % 6 === 0 ? 3 : 0);
        const newcomers = i < 5 ? 3 : Math.round(Math.random() * 2);
        return { day: d.toISOString().slice(0, 10), unique, newcomers, returning: unique - newcomers };
      });
      return { heatmap, daily, averageSessionSeconds: 5820, activeLast7Days: 9, returningRate: 78, totalPlayers: ctx.players.length + 14 };
    }

    // Presets, import / export, events
    if (route === 'GET features/presets') return [...PRESETS.map((p) => ({ ...p, builtin: true, changes: describe(p.values) })), ...v.presets.map((p: Any) => ({ ...p, changes: describe(p.values) }))];
    if (route === 'POST features/presets') {
      const p = { id: String(v.nextId++), name: body.name, description: body.description ?? '', values: body.values, builtin: false };
      v.presets.push(p);
      return { id: p.id };
    }
    if (method === 'DELETE' && seg[1] === 'presets') {
      v.presets = v.presets.filter((p: Any) => p.id !== seg[2]);
      return { ok: true };
    }
    if (method === 'POST' && seg[1] === 'presets' && seg[3] === 'apply') {
      const p = [...PRESETS, ...v.presets].find((x: Any) => x.id === seg[2]);
      if (!p) ctx.fail(404, 'Preset not found');
      applyValues(p!.values);
      ctx.record('preset.apply', p!.name);
      return { ok: true, restarted: !!body?.restart };
    }
    if (route === 'GET features/config/export') {
      const values = Object.fromEntries(ctx.state().config.filter((e: Any) => !/Password/.test(e.key) && !e.locked).map((e: Any) => [e.key, e.value]));
      return { format: 'palcms-config', version: '1.0.0', exportedAt: Date.now(), values };
    }
    if (route === 'POST features/config/import') {
      const known = new Set(ctx.state().config.map((e: Any) => e.key));
      const values = Object.fromEntries(Object.entries(body.values ?? {}).filter(([k]) => known.has(k) && !/Password/.test(k)));
      applyValues(values);
      return { ok: true, applied: Object.keys(values).length, ignored: Object.keys(body.values ?? {}).length - Object.keys(values).length, restarted: !!body.restart };
    }
    if (route === 'GET features/events') return v.events.map((e: Any) => ({ ...e, changes: describe(e.values) })).sort((a: Any, b: Any) => b.startsAt - a.startsAt);
    if (route === 'POST features/events') {
      if (!body.name || !Object.keys(body.values ?? {}).length) ctx.fail(400, 'Choose at least one gameplay setting to change');
      if (body.endsAt <= body.startsAt) ctx.fail(400, 'The end must be after the start');
      const e = { id: v.nextId++, name: body.name, description: body.description ?? '', startsAt: body.startsAt, endsAt: body.endsAt, values: body.values, restart: !!body.restart, isPublic: !!body.isPublic, status: 'scheduled', error: null };
      v.events.push(e);
      ctx.record('event.create', e.name);
      return { id: e.id };
    }
    if (method === 'POST' && seg[1] === 'events' && seg[3] === 'start-now') {
      const e = v.events.find((x: Any) => x.id === Number(seg[2]));
      if (e) Object.assign(e, { status: 'active', startsAt: Date.now() });
      return { ok: true };
    }
    if (method === 'DELETE' && seg[1] === 'events') {
      const e = v.events.find((x: Any) => x.id === Number(seg[2]));
      if (e && ['scheduled', 'active'].includes(e.status)) e.status = 'cancelled';
      else v.events = v.events.filter((x: Any) => x.id !== Number(seg[2]));
      return { ok: true };
    }

    // Anti-triche
    if (route === 'GET features/anticheat') {
      const resolved = q.get('status') === 'resolved';
      return { settings: v.anticheat, flags: v.flags.filter((f: Any) => !!f.resolvedAt === resolved) };
    }
    if (route === 'PUT features/anticheat/settings') {
      v.anticheat = body;
      return body;
    }
    if (route === 'POST features/anticheat/scan') return { found: 0 };
    if (method === 'POST' && seg[1] === 'anticheat' && seg[4] === 'resolve') {
      const f = v.flags.find((x: Any) => x.id === Number(seg[3]));
      if (!f) ctx.fail(404, 'Alert not found or already handled');
      Object.assign(f, { resolvedAt: Date.now(), resolvedBy: ctx.state().user.username, resolution: { ignore: 'Ignored', kick: 'Player kicked', ban: 'Player banned' }[body.action as 'ignore'] });
      if (body.action !== 'ignore') {
        const p = ctx.players.find((x) => x.uid === f.uid);
        if (p) p.online = false;
      }
      return { ok: true };
    }

    // Sanctions
    if (seg[1] === 'sanctions') {
      if (method === 'DELETE' && seg[2] === 'entry') {
        v.sanctions = v.sanctions.filter((x: Any) => x.id !== Number(seg[3]));
        return { ok: true };
      }
      const uid = decodeURIComponent(seg[2]);
      const p = ctx.players.find((x) => x.uid === uid);
      const add = (type: string, reason: string, expiresAt: number | null = null) =>
        v.sanctions.unshift({ id: v.nextId++, uid, type, reason, expiresAt, createdAt: Date.now(), createdBy: ctx.state().user.username });
      if (method === 'GET') {
        const ban = ctx.state().bans.find((b: Any) => b.uid === uid);
        return {
          name: p?.name ?? uid,
          ban: ban ? { reason: ban.reason, bannedAt: ban.bannedAt, bannedBy: ban.bannedBy, expiresAt: ban.expiresAt ?? null } : null,
          history: v.sanctions.filter((x: Any) => x.uid === uid),
          warnings: v.sanctions.filter((x: Any) => x.uid === uid && x.type === 'warning').length,
          flags: v.flags.filter((f: Any) => f.uid === uid),
        };
      }
      if (seg[3] === 'warn') {
        add('warning', body.reason);
        if (body.kick && p) p.online = false;
        return { ok: true };
      }
      if (seg[3] === 'note') {
        add('note', body.text);
        return { ok: true };
      }
      if (seg[3] === 'tempban') {
        const expiresAt = Date.now() + body.hours * 3600_000;
        ctx.state().bans = ctx.state().bans.filter((b: Any) => b.uid !== uid);
        ctx.state().bans.push({ uid, name: p?.name ?? uid, reason: body.reason, bannedAt: Date.now(), bannedBy: ctx.state().user.username, expiresAt });
        if (p) p.online = false;
        add('tempban', body.reason, expiresAt);
        return { ok: true, expiresAt };
      }
    }

    // Signalements
    if (route === 'GET features/tickets') {
      const st = q.get('status') ?? 'open';
      const items = v.tickets.filter((t: Any) => (st === 'all' ? true : st === 'closed' ? t.status !== 'open' : t.status === 'open'));
      return { open: v.tickets.filter((t: Any) => t.status === 'open').length, items };
    }
    if (method === 'POST' && seg[1] === 'tickets' && seg[3] === 'reply') {
      const t = v.tickets.find((x: Any) => x.id === Number(seg[2]));
      if (!t) ctx.fail(404, 'Request not found');
      if (body.reply) Object.assign(t, { reply: body.reply, repliedBy: ctx.state().user.username });
      t.status = body.close ? 'closed' : 'answered';
      return { ok: true };
    }
    if (method === 'DELETE' && seg[1] === 'tickets') {
      v.tickets = v.tickets.filter((x: Any) => x.id !== Number(seg[2]));
      return { ok: true };
    }

    // Updates
    if (route === 'GET features/updates/server') {
      return { settings: v.serverUpdate, installed: '20304050', latest: '20304050', outdated: false, checkedAt: Date.now() - 12 * 60_000, error: null, pending: null, running: false, lastResult: `Updated on ${new Date(ctx.start - 3 * DAY).toISOString().slice(0, 16).replace('T', ' ')}` };
    }
    if (route === 'PUT features/updates/server/settings') {
      v.serverUpdate = body;
      return body;
    }
    if (route === 'POST features/updates/server/check') return { installed: '20304050', latest: '20304050', outdated: false, error: null };
    if (route === 'POST features/updates/server/now') {
      ctx.log('Server update started (demo)');
      return { ok: true };
    }
    if (route === 'GET features/updates/palcms' || route === 'POST features/updates/palcms/check') {
      return { current: ctx.state().version ?? '1.0.0', latest: 'v1.0.0', available: false, notes: '', url: '', checkedAt: Date.now(), error: null, canInstall: false };
    }
    return undefined;
  }

  return { publicRoute, adminRoute };
}
