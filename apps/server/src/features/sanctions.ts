import { z } from 'zod';
import type { FeatureHost, HostUser } from '@palcms/shared';
import { itemName } from '../gamedata';
import { every, httpError, parseBody, type Feature, type FeatureBus } from './util';
import type { WorldService } from './world';

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string, details?: unknown) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target, details });

export type SanctionType = 'warning' | 'note' | 'kick' | 'ban' | 'tempban' | 'unban';

/** Records a sanction in the player's history (also used by regular moderation). */
export function recordSanction(host: FeatureHost, uid: string, name: string, type: SanctionType, reason: string, by: string | null, expiresAt: number | null = null) {
  host.db
    .prepare('INSERT INTO pro_sanctions (uid, name, type, reason, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uid, name, type, reason, expiresAt, Date.now(), by);
}

const nameOf = (host: FeatureHost, uid: string) =>
  (host.db.prepare('SELECT name FROM players WHERE uid = ?').get(uid) as { name: string } | undefined)?.name ??
  host.server.onlinePlayers().find((p) => p.userId === uid)?.name ??
  uid;

// Sanctions

export function createSanctions(host: FeatureHost): Feature {
  const { db } = host;
  let stopTimer: (() => void) | null = null;

  /** Expired temporary bans: lifted automatically. */
  const expire = async () => {
    const rows = db.prepare('SELECT uid, name FROM pro_bans WHERE expires_at IS NOT NULL AND expires_at <= ?').all(Date.now()) as { uid: string; name: string }[];
    for (const b of rows) {
      try {
        await host.palworld.unban(b.uid);
      } catch {
        continue; // server offline: try again next minute
      }
      db.prepare('DELETE FROM pro_bans WHERE uid = ?').run(b.uid);
      recordSanction(host, b.uid, b.name, 'unban', 'Temporary ban ended', null);
    }
  };

  return {
    start() {
      stopTimer = every(60_000, expire);
    },
    stop() {
      stopTimer?.();
    },
    routes: [
      {
        method: 'GET',
        path: 'sanctions/:uid',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ params }) => ({
          name: nameOf(host, params.uid),
          ban: db.prepare('SELECT reason, banned_at AS bannedAt, banned_by AS bannedBy, expires_at AS expiresAt FROM pro_bans WHERE uid = ?').get(params.uid) ?? null,
          history: db
            .prepare('SELECT id, type, reason, expires_at AS expiresAt, created_at AS createdAt, created_by AS createdBy FROM pro_sanctions WHERE uid = ? ORDER BY created_at DESC')
            .all(params.uid),
          warnings: (db.prepare("SELECT COUNT(*) AS c FROM pro_sanctions WHERE uid = ? AND type = 'warning'").get(params.uid) as { c: number }).c,
          flags: db
            .prepare('SELECT id, kind, severity, details, created_at AS createdAt, resolved_at AS resolvedAt, resolution FROM pro_flags WHERE uid = ? ORDER BY created_at DESC LIMIT 20')
            .all(params.uid),
        }),
      },
      {
        method: 'POST',
        path: 'sanctions/:uid/warn',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, body, user }) => {
          const b = parseBody(z.object({ reason: z.string().trim().min(1).max(300), announce: z.boolean().default(false), kick: z.boolean().default(false) }), body);
          const name = nameOf(host, params.uid);
          recordSanction(host, params.uid, name, 'warning', b.reason, user!.username);
          // The Palworld API has no private message: the announcement is seen by every online player.
          if (b.announce) await host.palworld.announce(host.t('Warning for {name}: {reason}', { name, reason: b.reason })).catch(() => {});
          if (b.kick) {
            await host.palworld.kick(params.uid, host.t('Warning: {reason}', { reason: b.reason })).catch(() => {});
            recordSanction(host, params.uid, name, 'kick', b.reason, user!.username);
          }
          audit(host, user, 'player.warn', name, { reason: b.reason });
          const count = (db.prepare("SELECT COUNT(*) AS c FROM pro_sanctions WHERE uid = ? AND type = 'warning'").get(params.uid) as { c: number }).c;
          return { ok: true, warnings: count };
        },
      },
      {
        method: 'POST',
        path: 'sanctions/:uid/note',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ params, body, user }) => {
          const { text } = parseBody(z.object({ text: z.string().trim().min(1).max(1000) }), body);
          recordSanction(host, params.uid, nameOf(host, params.uid), 'note', text, user!.username);
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'sanctions/:uid/tempban',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, body, user }) => {
          const b = parseBody(z.object({ reason: z.string().trim().max(300).default(''), hours: z.number().int().min(1).max(24 * 365) }), body);
          const name = nameOf(host, params.uid);
          const expiresAt = Date.now() + b.hours * 3600_000;
          await host.palworld.ban(params.uid, b.reason || host.t('Banned for {n} h', { n: b.hours }));
          db.prepare(
            `INSERT INTO pro_bans (uid, name, reason, banned_at, banned_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(uid) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at, banned_by = excluded.banned_by, expires_at = excluded.expires_at`,
          ).run(params.uid, name, b.reason, Date.now(), user!.username, expiresAt);
          recordSanction(host, params.uid, name, 'tempban', b.reason, user!.username, expiresAt);
          audit(host, user, 'player.tempban', name, { hours: b.hours, reason: b.reason });
          return { ok: true, expiresAt };
        },
      },
      {
        method: 'DELETE',
        path: 'sanctions/entry/:id',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ params, user }) => {
          const row = db.prepare("SELECT name, type FROM pro_sanctions WHERE id = ? AND type IN ('warning', 'note')").get(Number(params.id)) as
            | { name: string; type: string }
            | undefined;
          if (!row) throw httpError(404, 'Only warnings and notes can be removed');
          db.prepare('DELETE FROM pro_sanctions WHERE id = ?').run(Number(params.id));
          audit(host, user, `sanction.remove`, row.name, { type: row.type });
          return { ok: true };
        },
      },
    ],
  };
}

// Light anti-cheat

interface AntiCheatSettings {
  enabled: boolean;
  /** Levels gained in under 5 minutes that trigger an alert. */
  levelJump: number;
  /** Levels gained in one hour. */
  levelsPerHour: number;
  /** Amount of one item (coins excluded) above which duplication is suspected. */
  itemStack: number;
  /** Gold coins. */
  money: number;
}
export const DEFAULT_ANTICHEAT: AntiCheatSettings = { enabled: true, levelJump: 6, levelsPerHour: 20, itemStack: 20000, money: 10_000_000 };

/** A player's level history: returns the suspicions (pure, tested). Details are English templates, translated on display. */
export function levelAnomalies(history: { ts: number; level: number }[], now: number, s: Pick<AntiCheatSettings, 'levelJump' | 'levelsPerHour'>) {
  const found: { kind: string; severity: number; details: string }[] = [];
  if (history.length < 2) return found;
  const current = history[history.length - 1].level;
  const fiveMin = history.filter((h) => h.ts >= now - 5 * 60_000);
  const hour = history.filter((h) => h.ts >= now - 3600_000);
  const gain5 = current - Math.min(...fiveMin.map((h) => h.level));
  const gainHour = current - Math.min(...hour.map((h) => h.level));
  if (gain5 >= s.levelJump) found.push({ kind: 'level-jump', severity: 3, details: `+${gain5} levels in under 5 minutes (level ${current})` });
  else if (gainHour >= s.levelsPerHour) found.push({ kind: 'level-rate', severity: 2, details: `+${gainHour} levels in under an hour (level ${current})` });
  return found;
}

/** Suspicious amounts in a sav_cli inventory (pure, tested). */
export function itemAnomalies(items: Record<string, { ItemId: string; StackCount: number }[]>, s: Pick<AntiCheatSettings, 'itemStack' | 'money'>) {
  const totals = new Map<string, number>();
  for (const list of Object.values(items)) for (const i of list ?? []) if (i?.ItemId) totals.set(i.ItemId, (totals.get(i.ItemId) ?? 0) + (i.StackCount || 0));
  const found: { kind: string; severity: number; details: string }[] = [];
  for (const [id, count] of totals) {
    const limit = id.toLowerCase() === 'money' ? s.money : s.itemStack;
    if (count > limit) found.push({ kind: `items:${id.toLowerCase()}`, severity: 3, details: `${count} × ${itemName(id)} (threshold ${limit})` });
  }
  return found;
}

export function createAntiCheat(host: FeatureHost, bus: FeatureBus, world: WorldService): Feature {
  const { db } = host;
  const settings = () => ({ ...DEFAULT_ANTICHEAT, ...host.settings.get<Partial<AntiCheatSettings>>('feature.anticheat', {}) });
  const levels = new Map<string, { ts: number; level: number }[]>();
  const offs: (() => void)[] = [];

  const flag = (uid: string, name: string, f: { kind: string; severity: number; details: string }) => {
    if (db.prepare('SELECT 1 FROM pro_flags WHERE uid = ? AND kind = ? AND resolved_at IS NULL').get(uid, f.kind)) return;
    db.prepare('INSERT INTO pro_flags (uid, name, kind, severity, details, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(uid, name, f.kind, f.severity, f.details, Date.now());
    bus.emit('flag:new', { name, kind: f.kind, details: f.details });
  };

  const scanWorld = () => {
    const s = settings();
    const links = db.prepare('SELECT l.uid, l.player_uid, p.name FROM world_links l JOIN players p ON p.uid = l.uid').all() as { uid: string; player_uid: string; name: string }[];
    let found = 0;
    for (const l of links) {
      const wp = db.prepare('SELECT items FROM world_players WHERE player_uid = ?').get(l.player_uid) as { items: string } | undefined;
      if (!wp) continue;
      for (const f of itemAnomalies(JSON.parse(wp.items), s)) {
        flag(l.uid, l.name, f);
        found++;
      }
    }
    return found;
  };

  return {
    start() {
      offs.push(
        host.events.on('tick', ({ players }) => {
          const s = settings();
          if (!s.enabled) return;
          const now = Date.now();
          for (const p of players) {
            const h = levels.get(p.userId) ?? [];
            if (!h.length || h[h.length - 1].level !== p.level || now - h[h.length - 1].ts > 60_000) h.push({ ts: now, level: p.level });
            while (h.length && h[0].ts < now - 3600_000) h.shift();
            levels.set(p.userId, h);
            for (const f of levelAnomalies(h, now, s)) flag(p.userId, p.name, f);
          }
        }),
        world.onSynced(() => {
          if (settings().enabled) scanWorld();
        }),
      );
    },
    stop() {
      offs.splice(0).forEach((o) => o());
    },
    routes: [
      {
        method: 'GET',
        path: 'anticheat',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ query }) => ({
          settings: settings(),
          flags: db
            .prepare(
              `SELECT f.id, f.uid, f.name, f.kind, f.severity, f.details, f.created_at AS createdAt, f.resolved_at AS resolvedAt, f.resolved_by AS resolvedBy,
                      f.resolution, p.public_id AS publicId
               FROM pro_flags f LEFT JOIN players p ON p.uid = f.uid
               WHERE ${query.status === 'resolved' ? 'f.resolved_at IS NOT NULL' : 'f.resolved_at IS NULL'}
               ORDER BY f.created_at DESC LIMIT 200`,
            )
            .all(),
        }),
      },
      {
        method: 'PUT',
        path: 'anticheat/settings',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ body, user }) => {
          const s = parseBody(
            z.object({
              enabled: z.boolean(),
              levelJump: z.number().int().min(2).max(60),
              levelsPerHour: z.number().int().min(2).max(60),
              itemStack: z.number().int().min(100).max(10_000_000),
              money: z.number().int().min(1000).max(1_000_000_000),
            }),
            body,
          );
          host.settings.set('feature.anticheat', s);
          audit(host, user, 'anticheat.settings');
          return s;
        },
      },
      {
        method: 'POST',
        path: 'anticheat/scan',
        access: 'staff',
        permission: 'server.moderation',
        handler: () => ({ found: scanWorld() }),
      },
      {
        method: 'POST',
        path: 'anticheat/flags/:id/resolve',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, body, user }) => {
          const { action } = parseBody(z.object({ action: z.enum(['ignore', 'kick', 'ban']) }), body);
          const f = db.prepare('SELECT uid, name, details FROM pro_flags WHERE id = ? AND resolved_at IS NULL').get(Number(params.id)) as
            | { uid: string; name: string; details: string }
            | undefined;
          if (!f) throw httpError(404, 'Alert not found or already handled');
          const reason = `Anti-cheat: ${f.details}`;
          if (action === 'kick') {
            await host.palworld.kick(f.uid, host.t('Kicked by the anti-cheat'));
            recordSanction(host, f.uid, f.name, 'kick', reason, user!.username);
          } else if (action === 'ban') {
            await host.palworld.ban(f.uid, host.t('Banned by the anti-cheat'));
            db.prepare(
              `INSERT INTO pro_bans (uid, name, reason, banned_at, banned_by) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(uid) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at, banned_by = excluded.banned_by, expires_at = NULL`,
            ).run(f.uid, f.name, reason, Date.now(), user!.username);
            recordSanction(host, f.uid, f.name, 'ban', reason, user!.username);
          }
          const label = { ignore: 'Ignored', kick: 'Player kicked', ban: 'Player banned' }[action];
          db.prepare('UPDATE pro_flags SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE id = ?').run(Date.now(), user!.username, label, Number(params.id));
          audit(host, user, `anticheat.${action}`, f.name);
          return { ok: true };
        },
      },
    ],
  };
}
