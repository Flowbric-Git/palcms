import fs from 'node:fs';
import os from 'node:os';
import { z } from 'zod';
import type { FeatureHost } from '@palcms/shared';
import { every, httpError, localDay, parseBody, type Feature, type FeatureBus } from './util';

interface Thresholds {
  enabled: boolean;
  fpsLow: number;
  memoryHigh: number;
  diskLow: number;
}
const DEFAULT_THRESHOLDS: Thresholds = { enabled: true, fpsLow: 20, memoryHigh: 90, diskLow: 10 };

export function diskUsage(path = '/'): { total: number; free: number } | null {
  try {
    const s = fs.statfsSync(path);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

export function memoryUsage() {
  // Sous Linux, os.freemem() ignore le cache disque : on lit MemAvailable quand c'est possible.
  let available = os.freemem();
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (m) available = Number(m[1]) * 1024;
  } catch {
    // pas de /proc (Windows, macOS en développement)
  }
  return { total: os.totalmem(), available };
}

/**
 * Heures de présence : pour chaque session, ajoute 1 dans la case [jour de la semaine][heure]
 * de chaque heure touchée. Divisé par le nombre de semaines, ça donne le nombre moyen de joueurs.
 */
export function attendanceHeatmap(sessions: { started_at: number; ended_at: number | null }[], from: number, to: number): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of sessions) {
    let t = Math.max(s.started_at, from);
    const end = Math.min(s.ended_at ?? to, to);
    t -= t % 3600_000;
    for (; t < end; t += 3600_000) {
      const d = new Date(t);
      grid[(d.getDay() + 6) % 7][d.getHours()]++;
    }
  }
  const weeks = Math.max(1, (to - from) / (7 * 86_400_000));
  return grid.map((row) => row.map((v) => Math.round((v / weeks) * 10) / 10));
}

export function createMonitoring(host: FeatureHost, bus: FeatureBus): Feature {
  const { db } = host;
  const thresholds = () => ({ ...DEFAULT_THRESHOLDS, ...host.settings.get<Partial<Thresholds>>('feature.monitoring', {}) });
  const offs: (() => void)[] = [];
  let lastIntentional = 0;
  const strikes = new Map<string, number>();

  const openAlert = (kind: string) =>
    db.prepare('SELECT id FROM pro_alerts WHERE kind = ? AND resolved_at IS NULL').get(kind) as { id: number } | undefined;

  /** Crée une alerte (une seule ouverte par type) ; renvoie true si elle est nouvelle. */
  const raise = (level: 'info' | 'warning' | 'critical', kind: string, message: string) => {
    if (kind !== 'crash' && openAlert(kind)) return false;
    db.prepare('INSERT INTO pro_alerts (ts, level, kind, message) VALUES (?, ?, ?, ?)').run(Date.now(), level, kind, message);
    db.prepare('DELETE FROM pro_alerts WHERE ts < ?').run(Date.now() - 30 * 86_400_000);
    bus.emit('alert', { level, kind, message });
    return true;
  };
  const resolve = (kind: string) => {
    strikes.delete(kind);
    db.prepare('UPDATE pro_alerts SET resolved_at = ? WHERE kind = ? AND resolved_at IS NULL').run(Date.now(), kind);
  };
  /** Alerte après N mesures consécutives au-delà du seuil, pour ignorer les pics isolés. */
  const check = (kind: string, bad: boolean, times: number, level: 'warning' | 'critical', message: () => string) => {
    if (!bad) return resolve(kind);
    const n = (strikes.get(kind) ?? 0) + 1;
    strikes.set(kind, n);
    if (n >= times) raise(level, kind, message());
  };

  const minute = async () => {
    const status = host.server.status();
    const managed = host.server.mode() === 'managed';
    const connected = host.server.mode() !== 'none';

    // Disponibilité : une minute de plus au compteur du jour
    if (connected) {
      db.prepare(
        `INSERT INTO pro_uptime (day, online_minutes, total_minutes) VALUES (?, ?, 1)
         ON CONFLICT(day) DO UPDATE SET online_minutes = online_minutes + excluded.online_minutes, total_minutes = total_minutes + 1`,
      ).run(localDay(), status.online ? 1 : 0);
    }

    const t = thresholds();
    if (!t.enabled) return;
    const m = host.server.metrics();
    if (status.online && m) {
      check('fps', m.serverfps < t.fpsLow, 3, 'warning', () => `FPS du serveur bas : ${m.serverfps} (seuil ${t.fpsLow})`);
    } else resolve('fps');

    const mem = memoryUsage();
    const memPct = Math.round((1 - mem.available / mem.total) * 100);
    check('memory', memPct >= t.memoryHigh, 3, 'warning', () => `Mémoire du VPS utilisée à ${memPct} % (seuil ${t.memoryHigh} %)`);

    const disk = diskUsage();
    if (disk) {
      const freePct = Math.round((disk.free / disk.total) * 100);
      check('disk', freePct <= t.diskLow, 1, 'critical', () => `Disque presque plein : ${freePct} % libre (${(disk.free / 1e9).toFixed(1)} Go)`);
    }

    if (managed) {
      const active = (await host.server.state()) === 'active';
      // Service lancé mais l'API ne répond pas depuis 3 minutes : serveur bloqué ou mal configuré.
      check('api', active && !status.online && Date.now() - lastIntentional > 5 * 60_000, 3, 'warning', () => 'Le service Palworld tourne mais son API REST ne répond pas');
    }
  };

  const history = (range: string) => {
    const spans: Record<string, [number, number]> = { '24h': [86_400_000, 300_000], '7d': [7 * 86_400_000, 3600_000], '30d': [30 * 86_400_000, 4 * 3600_000] };
    const [span, step] = spans[range] ?? spans['24h'];
    return db
      .prepare(
        `SELECT (ts / ?) * ? AS ts, ROUND(AVG(fps), 1) AS fps, MAX(players) AS players, ROUND(AVG(frame_time), 1) AS frameTime
         FROM metrics WHERE ts > ? GROUP BY ts / ? ORDER BY ts`,
      )
      .all(step, step, Date.now() - span, step);
  };

  return {
    start() {
      offs.push(
        bus.on('intentional', () => (lastIntentional = Date.now())),
        host.events.on('server:action', () => (lastIntentional = Date.now())),
        host.events.on('server:offline', () => {
          if (Date.now() - lastIntentional > 10 * 60_000) raise('critical', 'crash', 'Le serveur s’est arrêté alors qu’aucun arrêt n’était prévu (crash probable)');
        }),
        host.events.on('server:online', () => resolve('api')),
        every(60_000, minute),
      );
    },
    stop() {
      offs.splice(0).forEach((o) => o());
    },
    routes: [
      {
        method: 'GET',
        path: 'monitoring/health',
        access: 'staff',
        permission: 'server.players',
        handler: async () => {
          const mode = host.server.mode();
          const status = host.server.status();
          const m = host.server.metrics();
          const mem = memoryUsage();
          const world = host.settings.get<number>('feature.world.lastAt', 0);
          let rcon: boolean | null = null;
          if (mode === 'managed') {
            try {
              rcon = (await host.server.readConfig()).RCONEnabled === true;
            } catch {
              rcon = null;
            }
          } else if (mode === 'external') rcon = !!host.server.external()?.rconPort;
          return {
            mode,
            service: mode === 'managed' ? await host.server.state() : mode,
            status,
            metrics: m
              ? { fps: m.serverfps, frameTime: Math.round(m.serverframetime * 10) / 10, players: m.currentplayernum, maxPlayers: m.maxplayernum, baseCamps: m.basecampnum ?? null, days: m.days ?? null, uptime: m.uptime }
              : null,
            host: { cpus: os.cpus().length, load: os.loadavg()[0], memory: mem, disk: diskUsage() },
            apis: { rest: status.online, rcon, world: world || null },
            thresholds: thresholds(),
            openAlerts: (db.prepare('SELECT COUNT(*) AS c FROM pro_alerts WHERE resolved_at IS NULL').get() as { c: number }).c,
          };
        },
      },
      {
        method: 'GET',
        path: 'monitoring/history',
        access: 'staff',
        permission: 'server.players',
        handler: ({ query }) => ({ range: query.range ?? '24h', points: history(query.range ?? '24h') }),
      },
      {
        method: 'GET',
        path: 'monitoring/alerts',
        access: 'staff',
        permission: 'server.logs',
        handler: () => ({
          items: db.prepare('SELECT id, ts, level, kind, message, resolved_at AS resolvedAt FROM pro_alerts ORDER BY ts DESC LIMIT 100').all(),
        }),
      },
      {
        method: 'POST',
        path: 'monitoring/alerts/clear',
        access: 'staff',
        permission: 'server.logs',
        handler: ({ user }) => {
          db.prepare('UPDATE pro_alerts SET resolved_at = ? WHERE resolved_at IS NULL').run(Date.now());
          strikes.clear();
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'alerts.clear' });
          return { ok: true };
        },
      },
      {
        method: 'PUT',
        path: 'monitoring/thresholds',
        access: 'staff',
        permission: 'server.config',
        handler: ({ body, user }) => {
          const t = parseBody(
            z.object({
              enabled: z.boolean(),
              fpsLow: z.number().int().min(1).max(60),
              memoryHigh: z.number().int().min(50).max(100),
              diskLow: z.number().int().min(1).max(50),
            }),
            body,
          );
          host.settings.set('feature.monitoring', t);
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'monitoring.thresholds' });
          return t;
        },
      },
      {
        method: 'POST',
        path: 'monitoring/save',
        access: 'staff',
        permission: 'server.control',
        handler: async ({ user }) => {
          if (!host.server.status().online) throw httpError(409, 'Le serveur est hors ligne');
          await host.palworld.save();
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'server.save' });
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'monitoring/shutdown',
        access: 'staff',
        permission: 'server.control',
        handler: async ({ body, user }) => {
          const { seconds, message } = parseBody(
            z.object({ seconds: z.number().int().min(10).max(3600), message: z.string().trim().min(1).max(200) }),
            body,
          );
          if (!host.server.status().online) throw httpError(409, 'Le serveur est hors ligne');
          bus.emit('intentional', {});
          host.events.emit('server:action', { action: 'stop', by: user!.username });
          await host.palworld.shutdown(seconds, message);
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'server.shutdown', target: `${seconds} s` });
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'stats/attendance',
        access: 'staff',
        permission: 'server.players',
        handler: () => {
          const now = Date.now();
          const from = now - 30 * 86_400_000;
          const sessions = db.prepare('SELECT uid, started_at, ended_at FROM player_sessions WHERE COALESCE(ended_at, ?) > ?').all(now, from) as {
            uid: string;
            started_at: number;
            ended_at: number | null;
          }[];
          const heatmap = attendanceHeatmap(sessions, from, now);
          // Joueurs uniques, nouveaux et habitués par jour
          const firstSeen = new Map((db.prepare('SELECT uid, first_seen FROM players').all() as { uid: string; first_seen: number }[]).map((r) => [r.uid, r.first_seen]));
          const days = new Map<string, Set<string>>();
          for (const s of sessions) {
            for (let t = Math.max(s.started_at, from); t <= Math.min(s.ended_at ?? now, now); t += 86_400_000) {
              const d = localDay(new Date(t));
              if (!days.has(d)) days.set(d, new Set());
              days.get(d)!.add(s.uid);
            }
            const endDay = localDay(new Date(Math.min(s.ended_at ?? now, now)));
            if (!days.has(endDay)) days.set(endDay, new Set());
            days.get(endDay)!.add(s.uid);
          }
          const daily = [...days.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([day, uids]) => {
              const newcomers = [...uids].filter((u) => localDay(new Date(firstSeen.get(u) ?? 0)) === day).length;
              return { day, unique: uids.size, newcomers, returning: uids.size - newcomers };
            });
          const finished = sessions.filter((s) => s.ended_at && s.started_at > from);
          const avgSession = finished.length ? finished.reduce((n, s) => n + (s.ended_at! - s.started_at), 0) / finished.length / 1000 : 0;
          const week = now - 7 * 86_400_000;
          const recent = new Set(sessions.filter((s) => (s.ended_at ?? now) > week).map((s) => s.uid));
          const loyal = [...recent].filter((u) => (firstSeen.get(u) ?? now) < week).length;
          return {
            heatmap,
            daily,
            averageSessionSeconds: Math.round(avgSession),
            activeLast7Days: recent.size,
            returningRate: recent.size ? Math.round((loyal / recent.size) * 100) : 0,
            totalPlayers: firstSeen.size,
          };
        },
      },
      {
        method: 'GET',
        path: 'uptime',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('uptime') && !ctx.can('server.players')) throw httpError(404, 'Page désactivée');
          const since = localDay(new Date(Date.now() - 29 * 86_400_000));
          const days = db.prepare('SELECT day, online_minutes AS online, total_minutes AS total FROM pro_uptime WHERE day >= ? ORDER BY day').all(since) as {
            day: string;
            online: number;
            total: number;
          }[];
          const online = days.reduce((n, d) => n + d.online, 0);
          const total = days.reduce((n, d) => n + d.total, 0);
          // Fréquentation moyenne par heure sur 30 jours
          const now = Date.now();
          const sessions = db.prepare('SELECT started_at, ended_at FROM player_sessions WHERE COALESCE(ended_at, ?) > ?').all(now, now - 30 * 86_400_000) as {
            started_at: number;
            ended_at: number | null;
          }[];
          const grid = attendanceHeatmap(sessions, now - 30 * 86_400_000, now);
          const hourly = Array.from({ length: 24 }, (_, h) => Math.round((grid.reduce((n, row) => n + row[h], 0) / 7) * 10) / 10);
          const sched = host.settings.get<{ enabled?: boolean; times?: string[] }>('feature.schedules', {});
          let nextRestart: number | null = null;
          if (sched.enabled && sched.times?.length) {
            nextRestart = Math.min(
              ...sched.times.map((t) => {
                const [h, m] = t.split(':').map(Number);
                const d = new Date();
                d.setHours(h, m, 0, 0);
                if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
                return d.getTime();
              }),
            );
          }
          return {
            status: host.server.status(),
            uptimePercent: total ? Math.round((online / total) * 1000) / 10 : null,
            days: days.map((d) => ({ day: d.day, percent: d.total ? Math.round((d.online / d.total) * 1000) / 10 : null })),
            hourly,
            nextRestart,
          };
        },
      },
    ],
  };
}
