import { z } from 'zod';
import { PALDEX, paldexId, type FeatureContext, type FeatureHost } from '@palcms/shared';
import { MAP_POINTS, itemName, palName, passiveName } from '../gamedata';
import { addMenuOnce, errorText, every, httpError, parseBody, type Feature, type FeatureBus } from './util';

// Format produit par sav_cli (palworld-server-tool)

interface SavItem {
  ItemId: string;
  SlotIndex: number;
  StackCount: number;
}
interface SavPal {
  nickname: string;
  level: number;
  type: string;
  gender: string;
  is_lucky: boolean;
  is_boss: boolean;
  rank: number;
  melee: number;
  ranged: number;
  defense: number;
  skills: string[];
}
interface SavPlayer {
  player_uid: string;
  nickname: string;
  level: number;
  exp: number;
  hp: number;
  full_stomach: number;
  status_point: Record<string, number>;
  pals: SavPal[];
  items: Record<string, SavItem[]>;
}
interface SavGuild {
  name: string;
  base_camp_level: number;
  admin_player_uid: string;
  players: { player_uid: string; nickname: string; last_online: string }[];
  base_camp: { id: string; area: number; location_x: number; location_y: number }[];
}
export interface SavWorld {
  players: SavPlayer[];
  guilds: SavGuild[];
}

/**
 * sav_cli identifie un joueur par les 8 premiers caractères hexadécimaux de son PlayerUId, en décimal.
 * L'API REST donne le PlayerUId complet ("9E967EB0000…") : on fait la même conversion pour les relier.
 */
export function worldUidFromPlayerId(playerId: string | null | undefined): string | null {
  const hex = (playerId ?? '').replace(/-/g, '').slice(0, 8);
  return /^[0-9a-fA-F]{8}$/.test(hex) ? String(parseInt(hex, 16)) : null;
}

export const CONTAINERS: Record<string, string> = {
  CommonContainerId: 'Inventaire',
  EssentialContainerId: 'Objets essentiels',
  WeaponLoadOutContainerId: 'Armes',
  PlayerEquipArmorContainerId: 'Équipement',
  FoodEquipContainerId: 'Nourriture',
  DropSlotContainerId: 'Objets déposés',
};

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Vérifie et nettoie l'export de sav_cli (on ne fait pas confiance aveuglément à un fichier externe). */
export function parseWorld(json: string): SavWorld {
  const data = JSON.parse(json) as { players?: unknown; guilds?: unknown };
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.guilds)) throw new Error('Export du monde invalide');
  const players = (data.players as Partial<SavPlayer>[])
    .filter((p) => p && str(p.player_uid))
    .map((p) => ({
      player_uid: str(p.player_uid),
      nickname: str(p.nickname).slice(0, 64) || 'Inconnu',
      level: num(p.level, 1),
      exp: num(p.exp),
      hp: num(p.hp),
      full_stomach: num(p.full_stomach),
      status_point: p.status_point && typeof p.status_point === 'object' ? p.status_point : {},
      pals: Array.isArray(p.pals) ? p.pals.filter((x) => x && str(x.type)) : [],
      items: p.items && typeof p.items === 'object' ? p.items : {},
    }));
  const guilds = (data.guilds as Partial<SavGuild>[])
    .filter((g) => g && str(g.admin_player_uid))
    .map((g) => ({
      name: str(g.name).slice(0, 64) || 'Guilde sans nom',
      base_camp_level: num(g.base_camp_level),
      admin_player_uid: str(g.admin_player_uid),
      players: Array.isArray(g.players) ? g.players.filter((m) => m && str(m.player_uid)) : [],
      base_camp: Array.isArray(g.base_camp) ? g.base_camp.filter((b) => b && str(b.id)) : [],
    }));
  return { players, guilds };
}

/** Les 288 entrées du Paldex, avec ce qui a été capturé (pur, testé). */
export function buildPaldex(rows: { type: string; owner: string; lucky: number; alpha: number; level: number }[]) {
  const by = new Map<string, { count: number; owners: Set<string>; lucky: number; alpha: number; maxLevel: number }>();
  for (const r of rows) {
    const id = paldexId(r.type);
    const cur = by.get(id) ?? { count: 0, owners: new Set<string>(), lucky: 0, alpha: 0, maxLevel: 0 };
    cur.count++;
    cur.owners.add(r.owner);
    cur.lucky += r.lucky ? 1 : 0;
    cur.alpha += r.alpha ? 1 : 0;
    cur.maxLevel = Math.max(cur.maxLevel, r.level);
    by.set(id, cur);
  }
  return PALDEX.map((s) => {
    const c = by.get(s.id);
    return { ...s, count: c?.count ?? 0, owners: c?.owners.size ?? 0, lucky: c?.lucky ?? 0, alpha: c?.alpha ?? 0, maxLevel: c?.maxLevel ?? 0 };
  });
}

interface WorldSettings {
  enabled: boolean;
  intervalMinutes: number;
}
const DEFAULT_WORLD: WorldSettings = { enabled: true, intervalMinutes: 15 };

interface SyncState {
  running: boolean;
  lastAt: number;
  lastDurationMs: number;
  lastError: string | null;
  installing: boolean;
}

export interface WorldService {
  /** Personnage de la sauvegarde lié à un joueur PalCMS (uid REST). */
  linkedUid(uid: string): string | null;
  onSynced(fn: () => void): () => void;
}

export function createWorld(host: FeatureHost, bus: FeatureBus): Feature & WorldService {
  const { db } = host;
  const settings = () => ({ ...DEFAULT_WORLD, ...host.settings.get<Partial<WorldSettings>>('feature.world', {}) });
  const state: SyncState = {
    running: false,
    lastAt: host.settings.get<number>('feature.world.lastAt', 0),
    lastDurationMs: 0,
    lastError: null,
    installing: false,
  };
  let stopTimer: (() => void) | null = null;
  let playedSinceSync = true;
  let lastAttempt = state.lastAt;
  let offTick: (() => void) | null = null;
  const syncedListeners = new Set<() => void>();

  const available = () => host.server.mode() === 'managed';

  const store = (world: SavWorld) => {
    const insPlayer = db.prepare(
      `INSERT INTO world_players (player_uid, nickname, level, exp, hp, full_stomach, status_points, items, pal_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insPal = db.prepare(
      `INSERT INTO world_pals (owner_uid, type, nickname, level, gender, is_lucky, is_boss, rank, talent_hp, talent_shot, talent_defense, skills)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insGuild = db.prepare('INSERT OR REPLACE INTO world_guilds (id, name, level, admin_uid) VALUES (?, ?, ?, ?)');
    const insMember = db.prepare('INSERT INTO world_guild_members (guild_id, player_uid, nickname, last_online) VALUES (?, ?, ?, ?)');
    const insBase = db.prepare('INSERT OR REPLACE INTO world_bases (id, guild_id, x, y, area) VALUES (?, ?, ?, ?, ?)');
    const insLink = db.prepare('INSERT OR REPLACE INTO world_links (uid, player_uid) VALUES (?, ?)');

    db.transaction(() => {
      db.exec('DELETE FROM world_players; DELETE FROM world_pals; DELETE FROM world_guilds; DELETE FROM world_guild_members; DELETE FROM world_bases; DELETE FROM world_links;');
      for (const p of world.players) {
        insPlayer.run(p.player_uid, p.nickname, p.level, p.exp, p.hp, p.full_stomach, JSON.stringify(p.status_point), JSON.stringify(p.items), p.pals.length);
        for (const pal of p.pals) {
          insPal.run(
            p.player_uid,
            str(pal.type),
            str(pal.nickname).slice(0, 64),
            num(pal.level, 1),
            str(pal.gender),
            pal.is_lucky ? 1 : 0,
            pal.is_boss ? 1 : 0,
            num(pal.rank, 1),
            num(pal.melee),
            num(pal.ranged),
            num(pal.defense),
            JSON.stringify(Array.isArray(pal.skills) ? pal.skills.filter((s) => typeof s === 'string') : []),
          );
        }
      }
      for (const g of world.guilds) {
        const id = g.admin_player_uid;
        insGuild.run(id, g.name, g.base_camp_level, g.admin_player_uid);
        for (const m of g.players) insMember.run(id, str(m.player_uid), str(m.nickname).slice(0, 64), str(m.last_online) || null);
        for (const b of g.base_camp) insBase.run(str(b.id), id, num(b.location_x), num(b.location_y), num(b.area));
      }
      const known = new Set(world.players.map((p) => p.player_uid));
      for (const row of db.prepare('SELECT uid, player_id FROM players WHERE player_id IS NOT NULL').all() as { uid: string; player_id: string }[]) {
        const wuid = worldUidFromPlayerId(row.player_id);
        if (wuid && known.has(wuid)) insLink.run(row.uid, wuid);
      }
    })();
  };

  const ensureTools = async () => {
    const status = (await host.palctl(['savtools-status'])).trim();
    if (status.startsWith('installed')) return;
    state.installing = true;
    try {
      await host.palctl(['savtools-install'], { timeoutMs: 10 * 60_000 });
    } finally {
      state.installing = false;
    }
  };

  const sync = async () => {
    if (state.running) throw httpError(409, 'Lecture déjà en cours');
    if (!available()) throw httpError(409, 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS');
    state.running = true;
    const t0 = Date.now();
    try {
      await ensureTools();
      // Le serveur écrit d'abord le monde sur le disque pour que la lecture soit à jour.
      await host.palworld.save().catch(() => {});
      await new Promise((r) => setTimeout(r, 3000));
      const world = parseWorld(await host.palctlText(['world-export'], { timeoutMs: 16 * 60_000 }));
      store(world);
      state.lastAt = Date.now();
      state.lastDurationMs = state.lastAt - t0;
      state.lastError = null;
      playedSinceSync = host.server.onlinePlayers().length > 0;
      host.settings.set('feature.world.lastAt', state.lastAt);
      syncedListeners.forEach((fn) => fn());
      bus.emit('world:synced', { players: world.players.length, guilds: world.guilds.length });
    } catch (e) {
      state.lastError = errorText(e);
      bus.emit('world:failed', { error: state.lastError });
      throw e;
    } finally {
      state.running = false;
    }
  };

  const canWorld = (ctx: FeatureContext) => ctx.can('server.world');
  const guildPublicId = (id: string) => host.server.publicPlayerId(`guild:${id}`);
  const publicIdOfWorldUid = (wuid: string) =>
    (db.prepare('SELECT p.public_id FROM world_links l JOIN players p ON p.uid = l.uid WHERE l.player_uid = ?').get(wuid) as
      | { public_id: string }
      | undefined)?.public_id ?? null;

  const palRow = (p: Record<string, unknown>) => ({
    type: p.type as string,
    name: palName(p.type as string),
    nickname: p.nickname as string,
    level: p.level as number,
    gender: p.gender as string,
    lucky: p.is_lucky === 1,
    boss: p.is_boss === 1,
    rank: p.rank as number,
    talents: { hp: p.talent_hp as number, attack: p.talent_shot as number, defense: p.talent_defense as number },
    passives: (JSON.parse(p.skills as string) as string[]).map((s) => ({ id: s, name: passiveName(s) })),
  });

  const inventory = (itemsJson: string) => {
    const items = JSON.parse(itemsJson) as Record<string, SavItem[]>;
    return Object.entries(CONTAINERS)
      .map(([key, label]) => ({
        key,
        label,
        items: (items[key] ?? [])
          .filter((i) => i && i.ItemId)
          .sort((a, b) => a.SlotIndex - b.SlotIndex)
          .map((i) => ({ id: i.ItemId, name: itemName(i.ItemId), count: i.StackCount, slot: i.SlotIndex })),
      }))
      .filter((c) => c.items.length > 0);
  };

  const guildOf = (wuid: string) =>
    db.prepare('SELECT g.id, g.name, g.level FROM world_guild_members m JOIN world_guilds g ON g.id = m.guild_id WHERE m.player_uid = ?').get(wuid) as
      | { id: string; name: string; level: number }
      | undefined;

  const guildDetail = (id: string, withBases: boolean) => {
    const g = db.prepare('SELECT id, name, level, admin_uid FROM world_guilds WHERE id = ?').get(id) as
      | { id: string; name: string; level: number; admin_uid: string }
      | undefined;
    if (!g) return null;
    const members = (db.prepare('SELECT player_uid, nickname, last_online FROM world_guild_members WHERE guild_id = ? ORDER BY nickname').all(id) as {
      player_uid: string;
      nickname: string;
      last_online: string | null;
    }[]).map((m) => {
      const wp = db.prepare('SELECT level, pal_count FROM world_players WHERE player_uid = ?').get(m.player_uid) as
        | { level: number; pal_count: number }
        | undefined;
      return {
        name: m.nickname,
        publicId: publicIdOfWorldUid(m.player_uid),
        level: wp?.level ?? null,
        pals: wp?.pal_count ?? 0,
        leader: m.player_uid === g.admin_uid,
        lastOnline: m.last_online,
      };
    });
    const bases = db.prepare('SELECT x, y, area FROM world_bases WHERE guild_id = ?').all(id) as { x: number; y: number; area: number }[];
    return {
      id: guildPublicId(g.id),
      name: g.name,
      level: g.level,
      members,
      baseCount: bases.length,
      bases: withBases ? bases : [],
    };
  };

  const findGuild = (publicId: string) => {
    const ids = db.prepare('SELECT id FROM world_guilds').all() as { id: string }[];
    return ids.find((r) => guildPublicId(r.id) === publicId)?.id ?? null;
  };

  const requireData = () => {
    if (!state.lastAt) throw httpError(404, 'Les données du monde ne sont pas encore disponibles');
  };

  return {
    linkedUid: (uid) => (db.prepare('SELECT player_uid FROM world_links WHERE uid = ?').get(uid) as { player_uid: string } | undefined)?.player_uid ?? null,
    onSynced(fn) {
      syncedListeners.add(fn);
      return () => syncedListeners.delete(fn);
    },
    start() {
      addMenuOnce(
        host,
        'feature.world.menuAdded',
        [
          { label: 'Guildes', url: '/guildes' },
          { label: 'Paldex', url: '/paldex' },
        ],
        '/carte',
      );
      offTick = host.events.on('tick', ({ players }) => {
        if (players.length) playedSinceSync = true;
      });
      stopTimer = every(60_000, async () => {
        const s = settings();
        if (!s.enabled || !available() || state.running) return;
        // Rien n'a changé si personne n'a joué depuis la dernière lecture réussie.
        // Après une erreur, on attend aussi un intervalle complet avant de réessayer.
        const due = Date.now() - lastAttempt >= s.intervalMinutes * 60_000 && (playedSinceSync || !state.lastAt || !!state.lastError);
        if (due) {
          lastAttempt = Date.now();
          await sync().catch(() => {});
        }
      });
    },
    stop() {
      stopTimer?.();
      offTick?.();
    },
    routes: [
      {
        method: 'GET',
        path: 'world/status',
        access: 'staff',
        permission: 'server.world',
        handler: () => {
          const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
          return {
            available: available(),
            settings: settings(),
            running: state.running,
            installing: state.installing,
            lastAt: state.lastAt || null,
            lastDurationMs: state.lastDurationMs || null,
            lastError: state.lastError,
            counts: { players: count('world_players'), pals: count('world_pals'), guilds: count('world_guilds'), bases: count('world_bases') },
          };
        },
      },
      {
        method: 'PUT',
        path: 'world/settings',
        access: 'staff',
        permission: 'server.world',
        handler: ({ body, user }) => {
          const s = parseBody(z.object({ enabled: z.boolean(), intervalMinutes: z.number().int().min(5).max(24 * 60) }), body);
          host.settings.set('feature.world', s);
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'world.settings' });
          return s;
        },
      },
      {
        method: 'POST',
        path: 'world/sync',
        access: 'staff',
        permission: 'server.world',
        handler: async ({ user }) => {
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'world.sync' });
          await sync();
          return { ok: true, lastAt: state.lastAt, durationMs: state.lastDurationMs };
        },
      },
      {
        method: 'GET',
        path: 'world/players/:id',
        access: 'staff',
        permission: 'server.world',
        handler: ({ params }) => {
          requireData();
          const player = db.prepare('SELECT uid, name FROM players WHERE public_id = ?').get(params.id) as { uid: string; name: string } | undefined;
          if (!player) throw httpError(404, 'Joueur introuvable');
          const wuid = (db.prepare('SELECT player_uid FROM world_links WHERE uid = ?').get(player.uid) as { player_uid: string } | undefined)?.player_uid;
          const wp = wuid ? (db.prepare('SELECT * FROM world_players WHERE player_uid = ?').get(wuid) as Record<string, unknown> | undefined) : undefined;
          if (!wuid || !wp) throw httpError(404, 'Personnage absent de la dernière lecture du monde (il faut qu’il se soit connecté depuis)');
          const pals = (db.prepare('SELECT * FROM world_pals WHERE owner_uid = ? ORDER BY level DESC, type').all(wuid) as Record<string, unknown>[]).map(palRow);
          const guild = guildOf(wuid);
          return {
            name: wp.nickname,
            level: wp.level,
            exp: wp.exp,
            hp: wp.hp,
            stomach: wp.full_stomach,
            statusPoints: JSON.parse(wp.status_points as string),
            inventory: inventory(wp.items as string),
            pals,
            guild: guild ? { id: guildPublicId(guild.id), name: guild.name, level: guild.level } : null,
            syncedAt: state.lastAt,
          };
        },
      },
      {
        method: 'GET',
        path: 'world/items',
        access: 'staff',
        permission: 'server.world',
        handler: ({ query }) => {
          requireData();
          const q = (query.q ?? '').trim().toLowerCase();
          if (q.length < 2) return { results: [] };
          const results: { item: string; itemName: string; player: string; publicId: string | null; count: number; container: string }[] = [];
          for (const p of db.prepare('SELECT player_uid, nickname, items FROM world_players').all() as { player_uid: string; nickname: string; items: string }[]) {
            const items = JSON.parse(p.items) as Record<string, SavItem[]>;
            for (const [key, list] of Object.entries(items)) {
              const totals = new Map<string, number>();
              for (const i of list ?? []) {
                if (!i?.ItemId) continue;
                if (i.ItemId.toLowerCase().includes(q) || itemName(i.ItemId).toLowerCase().includes(q)) {
                  totals.set(i.ItemId, (totals.get(i.ItemId) ?? 0) + (i.StackCount || 0));
                }
              }
              for (const [id, count] of totals) {
                results.push({ item: id, itemName: itemName(id), player: p.nickname, publicId: publicIdOfWorldUid(p.player_uid), count, container: CONTAINERS[key] ?? key });
              }
            }
          }
          results.sort((a, b) => b.count - a.count);
          return { results: results.slice(0, 200) };
        },
      },
      {
        method: 'GET',
        path: 'guilds',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('guilds') && !canWorld(ctx)) throw httpError(404, 'Page désactivée');
          if (!state.lastAt) return { syncedAt: null, guilds: [] };
          const guilds = (db.prepare('SELECT id FROM world_guilds ORDER BY level DESC, name').all() as { id: string }[])
            .map((g) => guildDetail(g.id, false)!)
            .map(({ members, ...g }) => ({ ...g, memberCount: members.length, leader: members.find((m) => m.leader)?.name ?? null }));
          return { syncedAt: state.lastAt, guilds };
        },
      },
      {
        method: 'GET',
        path: 'guilds/:id',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('guilds') && !canWorld(ctx)) throw httpError(404, 'Page désactivée');
          const id = findGuild(ctx.params.id);
          const detail = id ? guildDetail(id, host.modules.isEnabled('map') || canWorld(ctx)) : null;
          if (!detail) throw httpError(404, 'Guilde introuvable');
          return { ...detail, syncedAt: state.lastAt };
        },
      },
      {
        method: 'GET',
        path: 'paldex',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('paldex') && !canWorld(ctx)) throw httpError(404, 'Page désactivée');
          const players = db.prepare('SELECT player_uid, nickname FROM world_players').all() as { player_uid: string; nickname: string }[];
          // Identifiant public d'un personnage : celui de son profil s'il existe, sinon dérivé de la sauvegarde.
          const idOf = (wuid: string) => publicIdOfWorldUid(wuid) ?? host.server.publicPlayerId(`world:${wuid}`);

          // Portée : tout le serveur, un joueur ou une guilde
          let scope: { type: 'server' | 'player' | 'guild'; id: string | null; name: string; guild: { id: string; name: string } | null } = {
            type: 'server',
            id: null,
            name: 'Serveur',
            guild: null,
          };
          let owners: string[] | null = null;
          if (ctx.query.joueur) {
            const p = players.find((x) => idOf(x.player_uid) === ctx.query.joueur);
            if (!p) throw httpError(404, 'Joueur introuvable dans la sauvegarde');
            const g = guildOf(p.player_uid);
            scope = { type: 'player', id: ctx.query.joueur, name: p.nickname, guild: g ? { id: guildPublicId(g.id), name: g.name } : null };
            owners = [p.player_uid];
          } else if (ctx.query.guilde) {
            const gid = findGuild(ctx.query.guilde);
            if (!gid) throw httpError(404, 'Guilde introuvable');
            const g = db.prepare('SELECT name FROM world_guilds WHERE id = ?').get(gid) as { name: string };
            scope = { type: 'guild', id: ctx.query.guilde, name: g.name, guild: null };
            owners = (db.prepare('SELECT player_uid FROM world_guild_members WHERE guild_id = ?').all(gid) as { player_uid: string }[]).map((m) => m.player_uid);
          }

          const where = owners ? `WHERE owner_uid IN (${owners.map(() => '?').join(',') || "''"})` : '';
          const rows = db
            .prepare(
              `SELECT type, owner_uid AS owner, is_lucky AS lucky, is_boss AS alpha, level FROM world_pals ${where}`,
            )
            .all(...(owners ?? [])) as { type: string; owner: string; lucky: number; alpha: number; level: number }[];
          const entries = buildPaldex(rows);

          // Classements : joueurs et guildes par nombre d'espèces capturées
          const all = db.prepare('SELECT type, owner_uid AS owner FROM world_pals').all() as { type: string; owner: string }[];
          const speciesBy = new Map<string, Set<string>>();
          const palsBy = new Map<string, number>();
          for (const r of all) {
            if (!speciesBy.has(r.owner)) speciesBy.set(r.owner, new Set());
            speciesBy.get(r.owner)!.add(paldexId(r.type));
            palsBy.set(r.owner, (palsBy.get(r.owner) ?? 0) + 1);
          }
          const collectors = players
            .map((p) => ({ id: idOf(p.player_uid), name: p.nickname, species: speciesBy.get(p.player_uid)?.size ?? 0, pals: palsBy.get(p.player_uid) ?? 0 }))
            .filter((c) => c.pals > 0)
            .sort((a, b) => b.species - a.species || b.pals - a.pals)
            .slice(0, 20);
          const guilds = (db.prepare('SELECT id, name FROM world_guilds').all() as { id: string; name: string }[])
            .map((g) => {
              const members = (db.prepare('SELECT player_uid FROM world_guild_members WHERE guild_id = ?').all(g.id) as { player_uid: string }[]).map((m) => m.player_uid);
              const species = new Set(members.flatMap((m) => [...(speciesBy.get(m) ?? [])]));
              return { id: guildPublicId(g.id), name: g.name, species: species.size, pals: members.reduce((n, m) => n + (palsBy.get(m) ?? 0), 0) };
            })
            .filter((g) => g.pals > 0)
            .sort((a, b) => b.species - a.species || b.pals - a.pals)
            .slice(0, 10);

          return {
            syncedAt: state.lastAt || null,
            scope,
            total: PALDEX.length,
            caught: entries.filter((e) => e.count > 0).length,
            pals: rows.length,
            lucky: rows.filter((r) => r.lucky).length,
            entries,
            collectors,
            guilds,
          };
        },
      },
      {
        method: 'GET',
        path: 'me/character',
        access: 'user',
        handler: ({ user }) => {
          if (!host.modules.isEnabled('character')) throw httpError(404, 'Page désactivée');
          const u = db.prepare('SELECT player_uid, steam_id FROM users WHERE id = ?').get(user!.id) as { player_uid: string | null; steam_id: string | null };
          const uid = u.player_uid ?? (u.steam_id ? `steam_${u.steam_id}` : null);
          if (!uid) return { linked: false };
          const player = db.prepare('SELECT public_id, name FROM players WHERE uid = ?').get(uid) as { public_id: string; name: string } | undefined;
          if (!player) return { linked: false };
          const wuid = (db.prepare('SELECT player_uid FROM world_links WHERE uid = ?').get(uid) as { player_uid: string } | undefined)?.player_uid;
          const wp = wuid ? (db.prepare('SELECT * FROM world_players WHERE player_uid = ?').get(wuid) as Record<string, unknown> | undefined) : undefined;
          if (!wuid || !wp) return { linked: true, publicId: player.public_id, name: player.name, world: null, syncedAt: state.lastAt || null };
          const guild = guildOf(wuid);
          const bases = guild
            ? (db.prepare('SELECT x, y FROM world_bases WHERE guild_id = ?').all(guild.id) as { x: number; y: number }[])
            : [];
          return {
            linked: true,
            publicId: player.public_id,
            name: player.name,
            syncedAt: state.lastAt,
            world: {
              level: wp.level,
              statusPoints: JSON.parse(wp.status_points as string),
              inventory: inventory(wp.items as string),
              pals: (db.prepare('SELECT * FROM world_pals WHERE owner_uid = ? ORDER BY level DESC, type').all(wuid) as Record<string, unknown>[]).map(palRow),
              guild: guild ? { id: guildPublicId(guild.id), name: guild.name, level: guild.level } : null,
              bases,
            },
          };
        },
      },
      {
        method: 'GET',
        path: 'world/map',
        access: 'public',
        handler: (ctx) => {
          const staff = canWorld(ctx) || ctx.can('site.map');
          if (!host.modules.isEnabled('map') && !staff) throw httpError(403, 'La carte est réservée à l’équipe');
          const showBases = staff || host.modules.isEnabled('guilds');
          const bases = showBases
            ? (db.prepare('SELECT b.x, b.y, g.id, g.name, g.level FROM world_bases b JOIN world_guilds g ON g.id = b.guild_id').all() as {
                x: number;
                y: number;
                id: string;
                name: string;
                level: number;
              }[]).map((b) => ({ x: b.x, y: b.y, guild: b.name, guildId: guildPublicId(b.id), level: b.level }))
            : [];
          return { bases, fastTravel: MAP_POINTS.fastTravel, bossTowers: MAP_POINTS.bossTowers };
        },
      },
    ],
  };
}
