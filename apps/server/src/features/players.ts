import { z } from 'zod';
import type { FeatureHost, FeatureContext, WsServerMessage } from '@palcms/shared';
import { httpError, localDay, parseBody, type Feature } from './util';

// Map

/** Calibration of the official map: world coordinates [maxX, maxY, minX, minY]. */
export const OFFICIAL_BOUNDS: [number, number, number, number] = [349400, 724400, -1099400, -724400];

export interface MapSettings {
  image: 'official' | 'custom' | 'neutral';
  customUrl: string;
  bounds: [number, number, number, number];
}

const DEFAULT_MAP: MapSettings = { image: 'official', customUrl: '', bounds: OFFICIAL_BOUNDS };

const poiSchema = z.object({
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(''),
  icon: z.enum(['pin', 'home', 'shop', 'sword', 'flag', 'star', 'skull', 'tent']).default('pin'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f59e0b'),
  x: z.number().finite().min(-2_000_000).max(2_000_000),
  y: z.number().finite().min(-2_000_000).max(2_000_000),
});

const mapSettingsSchema = z.object({
  image: z.enum(['official', 'custom', 'neutral']),
  customUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || v.startsWith('/') || /^https?:\/\//.test(v), 'Invalid link'),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).refine(([maxX, maxY, minX, minY]) => maxX > minX && maxY > minY, 'Limites invalides'),
});

export function createMap(host: FeatureHost): Feature {
  const settings = () => ({ ...DEFAULT_MAP, ...host.settings.get<Partial<MapSettings>>('feature.map', {}) });
  const isPublic = () => host.modules.isEnabled('map');
  const canSee = (ctx: FeatureContext) => isPublic() || ctx.can('site.map') || ctx.can('server.players');

  const positions = () =>
    host.server.onlinePlayers().map((p) => ({
      id: host.server.publicPlayerId(p.userId),
      name: p.name,
      level: p.level,
      x: p.location_x,
      y: p.location_y,
    }));

  const message = (): WsServerMessage => ({ type: 'feature', event: 'map', data: positions() });
  let off: (() => void) | null = null;

  return {
    start() {
      // First start: the map is added to the site menu, right after the leaderboard.
      if (!host.settings.get('feature.map.menuAdded', false)) {
        const site = host.site.get();
        if (!site.menu.some((m) => m.url === '/map')) {
          const i = site.menu.findIndex((m) => m.url === '/leaderboard');
          const menu = [...site.menu];
          menu.splice(i >= 0 ? i + 1 : menu.length, 0, { label: host.t('Map'), url: '/map' });
          host.site.save({ ...site, menu: menu.slice(0, 20) });
        }
        host.settings.set('feature.map.menuAdded', true);
      }
      // Every 5 seconds: positions sent to everyone (public map) or to the team only.
      off = host.events.on('tick', () => {
        const msg = message();
        host.realtime.broadcast('admin', msg);
        if (isPublic()) host.realtime.broadcast('public', msg);
      });
      host.realtime.setSnapshot('admin', 'map', () => [message()]);
      host.realtime.setSnapshot('public', 'map', () => (isPublic() ? [message()] : []));
    },
    stop() {
      off?.();
      host.realtime.setSnapshot('admin', 'map', null);
      host.realtime.setSnapshot('public', 'map', null);
    },
    routes: [
      {
        method: 'GET',
        path: 'map',
        access: 'public',
        handler: (ctx) => {
          if (!canSee(ctx)) throw httpError(403, 'The map is reserved for the team');
          return {
            public: isPublic(),
            settings: settings(),
            officialUrl: `${host.basePath}map-palpagos.jpg`,
            pois: host.db.prepare('SELECT id, label, description, icon, color, x, y FROM pro_map_poi ORDER BY label').all(),
            players: positions(),
          };
        },
      },
      {
        method: 'PUT',
        path: 'map/settings',
        access: 'staff',
        permission: 'site.map',
        handler: ({ body, user }) => {
          const s = parseBody(mapSettingsSchema, body);
          host.settings.set('feature.map', s);
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'map.settings' });
          return s;
        },
      },
      {
        method: 'POST',
        path: 'map/image',
        access: 'staff',
        permission: 'site.map',
        handler: async (ctx) => {
          const url = await ctx.saveUpload(25 * 1024 * 1024);
          const s = { ...settings(), image: 'custom' as const, customUrl: url };
          host.settings.set('feature.map', s);
          host.events.emit('audit', { userId: ctx.user!.id, username: ctx.user!.username, action: 'map.image' });
          return s;
        },
      },
      {
        method: 'POST',
        path: 'map/poi',
        access: 'staff',
        permission: 'site.map',
        handler: ({ body }) => {
          const p = parseBody(poiSchema, body);
          const r = host.db
            .prepare('INSERT INTO pro_map_poi (label, description, icon, color, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(p.label, p.description, p.icon, p.color, p.x, p.y, Date.now());
          return { id: Number(r.lastInsertRowid), ...p };
        },
      },
      {
        method: 'PUT',
        path: 'map/poi/:id',
        access: 'staff',
        permission: 'site.map',
        handler: ({ params, body }) => {
          const p = parseBody(poiSchema, body);
          const r = host.db
            .prepare('UPDATE pro_map_poi SET label = ?, description = ?, icon = ?, color = ?, x = ?, y = ? WHERE id = ?')
            .run(p.label, p.description, p.icon, p.color, p.x, p.y, Number(params.id));
          if (!r.changes) throw httpError(404, 'Point not found');
          return { id: Number(params.id), ...p };
        },
      },
      {
        method: 'DELETE',
        path: 'map/poi/:id',
        access: 'staff',
        permission: 'site.map',
        handler: ({ params }) => {
          host.db.prepare('DELETE FROM pro_map_poi WHERE id = ?').run(Number(params.id));
          return { ok: true };
        },
      },
    ],
  };
}

// Full leaderboard

export type RankBy = 'level' | 'playtime' | 'seniority' | 'buildings';

export interface RankRow {
  public_id: string;
  name: string;
  level: number;
  online: number;
  playtime_seconds: number;
  first_seen: number;
  building_count: number;
}

const SORTS: Record<RankBy, (a: RankRow, b: RankRow) => number> = {
  level: (a, b) => b.level - a.level || b.playtime_seconds - a.playtime_seconds,
  playtime: (a, b) => b.playtime_seconds - a.playtime_seconds || b.level - a.level,
  seniority: (a, b) => a.first_seen - b.first_seen,
  buildings: (a, b) => b.building_count - a.building_count || b.level - a.level,
};

const VALUE: Record<RankBy, (r: RankRow) => number> = {
  level: (r) => r.level,
  playtime: (r) => r.playtime_seconds,
  seniority: (r) => r.first_seen,
  buildings: (r) => r.building_count,
};

/** Leaderboard by several criteria; ties on the displayed value share the same rank. */
export function rankBy(rows: RankRow[], by: RankBy, limit = 100) {
  const sorted = [...rows].sort((a, b) => SORTS[by](a, b) || a.name.localeCompare(b.name));
  let rank = 0;
  return sorted.slice(0, limit).map((r, i) => {
    if (i === 0 || VALUE[by](sorted[i - 1]) !== VALUE[by](r)) rank = i + 1;
    return {
      rank,
      id: r.public_id,
      name: r.name,
      level: r.level,
      online: r.online === 1,
      playtimeSeconds: r.playtime_seconds,
      firstSeen: r.first_seen,
      buildings: r.building_count,
    };
  });
}

export function createLeaderboard(host: FeatureHost): Feature {
  return {
    routes: [
      {
        method: 'GET',
        path: 'leaderboard',
        access: 'public',
        handler: ({ query }) => {
          if (!host.modules.isEnabled('leaderboard')) throw httpError(404, 'Leaderboard disabled');
          const by = (['level', 'playtime', 'seniority', 'buildings'] as RankBy[]).includes(query.by as RankBy) ? (query.by as RankBy) : 'level';
          const rows = host.db
            .prepare('SELECT public_id, name, level, online, playtime_seconds, first_seen, building_count FROM players')
            .all() as RankRow[];
          return { by, entries: rankBy(rows, by) };
        },
      },
    ],
  };
}

// Per-player statistics

export function createStats(host: FeatureHost): Feature {
  let off: (() => void) | null = null;
  let last = 0;

  return {
    start() {
      // Once a minute: level and total playtime of the day, for each online player.
      off = host.events.on('tick', ({ players }) => {
        if (Date.now() - last < 60_000 || players.length === 0) return;
        last = Date.now();
        const day = localDay();
        const upsert = host.db.prepare(
          `INSERT INTO pro_player_daily (uid, day, level, playtime_seconds)
           SELECT uid, ?, level, playtime_seconds FROM players WHERE uid = ?
           ON CONFLICT(uid, day) DO UPDATE SET level = excluded.level, playtime_seconds = excluded.playtime_seconds`,
        );
        host.db.transaction(() => {
          for (const p of players) upsert.run(day, p.userId);
        })();
      });
    },
    stop() {
      off?.();
    },
    routes: [
      {
        method: 'GET',
        path: 'players/:id/stats',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('player-stats') && !ctx.can('server.players')) throw httpError(404, 'Statistics disabled');
          const player = host.db.prepare('SELECT uid, building_count FROM players WHERE public_id = ?').get(ctx.params.id) as
            | { uid: string; building_count: number }
            | undefined;
          if (!player) throw httpError(404, 'Player not found');
          const rows = host.db
            .prepare('SELECT day, level, playtime_seconds FROM pro_player_daily WHERE uid = ? ORDER BY day DESC LIMIT 60')
            .all(player.uid) as { day: string; level: number; playtime_seconds: number }[];
          rows.reverse();
          // Playtime of each day = total of the day − total of the previous day.
          const days = rows.map((r, i) => ({
            day: r.day,
            level: r.level,
            playtimeSeconds: i === 0 ? 0 : Math.max(0, r.playtime_seconds - rows[i - 1].playtime_seconds),
          }));
          return { days, buildings: player.building_count };
        },
      },
    ],
  };
}
