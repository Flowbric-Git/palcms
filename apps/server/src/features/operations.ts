import { z } from 'zod';
import type { HostUser, FeatureFile, FeatureHost } from '@palcms/shared';
import { errorText, every, httpError, parseBody, type Feature, type FeatureBus } from './util';

const BACKUP_RE = /^palworld-(\d{8})-(\d{6})-(manual|auto|prerestart|preupdate|prerestore)\.tar\.gz$/;
type BackupTag = 'manual' | 'auto' | 'prerestart' | 'preupdate' | 'prerestore';

export interface BackupItem {
  name: string;
  size: number;
  createdAt: number;
  tag: BackupTag;
}

export function parseBackupList(output: string): BackupItem[] {
  return output
    .split('\n')
    .map((l) => l.trim().split('\t'))
    .filter(([name]) => name && BACKUP_RE.test(name))
    .map(([name, size, mtime]) => ({
      name,
      size: Number(size) || 0,
      createdAt: Math.round(Number(mtime) * 1000) || 0,
      tag: BACKUP_RE.exec(name)![3] as BackupTag,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Names of the automatic backups to delete so that only "keep" remain. */
export function backupsToPrune(items: BackupItem[], keep: number): string[] {
  return items
    .filter((b) => b.tag === 'auto')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(keep)
    .map((b) => b.name);
}

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target });

// Backups

interface BackupSettings {
  enabled: boolean;
  intervalMinutes: number;
  keep: number;
}
const DEFAULT_BACKUPS: BackupSettings = { enabled: true, intervalMinutes: 60, keep: 48 };

export interface BackupService {
  create(tag: BackupTag): Promise<string>;
}

export function createBackups(host: FeatureHost, bus: FeatureBus): Feature & BackupService {
  const settings = () => ({ ...DEFAULT_BACKUPS, ...host.settings.get<Partial<BackupSettings>>('feature.backups', {}) });
  const list = async () => parseBackupList(await host.palctl(['backup-list']));
  let running = false;
  let stopTimer: (() => void) | null = null;

  const create = async (tag: BackupTag): Promise<string> => {
    if (running) throw httpError(409, 'A backup is already running');
    running = true;
    try {
      try {
        await host.palworld.save(); // writes the world to disk before archiving
      } catch {
        /* server stopped: files are already up to date */
      }
      const name = (await host.palctl(['backup-create', tag], { timeoutMs: 10 * 60_000 })).trim().split('\n').pop()!;
      host.settings.set('feature.backups.last', Date.now());
      bus.emit('backup:done', { name, tag });
      if (tag === 'auto') {
        for (const old of backupsToPrune(await list(), settings().keep)) await host.palctl(['backup-delete', old]);
      }
      return name;
    } catch (e) {
      bus.emit('backup:failed', { tag, error: errorText(e) });
      throw e;
    } finally {
      running = false;
    }
  };

  const checkName = (name: string) => {
    if (!BACKUP_RE.test(name)) throw httpError(400, 'Invalid backup name');
  };

  return {
    create,
    start() {
      let failedAt = 0;
      stopTimer = every(60_000, async () => {
        if (host.server.mode() !== 'managed') return;
        const s = settings();
        const last = host.settings.get<number>('feature.backups.last', 0);
        // After a failure, wait 15 minutes before trying again instead of retrying every minute.
        const due = Date.now() - last >= s.intervalMinutes * 60_000 && Date.now() - failedAt >= 15 * 60_000;
        if (s.enabled && due && !running) {
          await create('auto').catch(() => {
            failedAt = Date.now();
          });
        }
      });
    },
    stop() {
      stopTimer?.();
    },
    routes: [
      {
        method: 'GET',
        path: 'backups',
        access: 'staff',
        permission: 'server.backups',
        handler: async () => ({ settings: settings(), running, lastAt: host.settings.get<number>('feature.backups.last', 0), items: await list() }),
      },
      {
        method: 'PUT',
        path: 'backups/settings',
        access: 'staff',
        permission: 'server.backups',
        handler: ({ body, user }) => {
          const s = parseBody(
            z.object({ enabled: z.boolean(), intervalMinutes: z.number().int().min(15).max(24 * 60), keep: z.number().int().min(1).max(500) }),
            body,
          );
          host.settings.set('feature.backups', s);
          audit(host, user, 'backup.settings');
          return s;
        },
      },
      {
        method: 'POST',
        path: 'backups',
        access: 'staff',
        permission: 'server.backups',
        handler: async ({ user }) => {
          const name = await create('manual');
          audit(host, user, 'backup.create', name);
          return { name };
        },
      },
      {
        method: 'POST',
        path: 'backups/:name/restore',
        access: 'staff',
        permission: 'server.backups',
        handler: async ({ params, user }) => {
          checkName(params.name);
          // Safety net: the current state is backed up before being replaced.
          const safety = await create('prerestore');
          bus.emit('intentional', {});
          await host.palctl(['backup-restore', params.name], { timeoutMs: 10 * 60_000 });
          audit(host, user, 'backup.restore', params.name);
          return { ok: true, safety };
        },
      },
      {
        method: 'DELETE',
        path: 'backups/:name',
        access: 'staff',
        permission: 'server.backups',
        handler: async ({ params, user }) => {
          checkName(params.name);
          await host.palctl(['backup-delete', params.name]);
          audit(host, user, 'backup.delete', params.name);
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'backups/:name/download',
        access: 'staff',
        permission: 'server.backups',
        handler: ({ params, user }): FeatureFile => {
          checkName(params.name);
          audit(host, user, 'backup.download', params.name);
          return { kind: 'file', stream: host.palctlStream(['backup-download', params.name]), filename: params.name, contentType: 'application/gzip' };
        },
      },
    ],
  };
}

// Scheduled restarts and updates

interface ScheduleSettings {
  enabled: boolean;
  times: string[];
  warnings: number[];
  updateOnRestart: boolean;
  message: string;
}
const DEFAULT_SCHEDULE: Omit<ScheduleSettings, 'message'> = {
  enabled: false,
  times: ['06:00'],
  warnings: [15, 5, 1],
  updateOnRestart: true,
};
const DEFAULT_RESTART_MESSAGE = 'Server restarting in {min} minute(s). Get to safety!';

/** Next occurrence (ms) of a local "HH:MM" time, from "from". */
export function nextOccurrence(time: string, from: number): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function createSchedules(host: FeatureHost, bus: FeatureBus, backups: BackupService): Feature {
  const settings = (): ScheduleSettings => ({
    ...DEFAULT_SCHEDULE,
    message: host.t(DEFAULT_RESTART_MESSAGE),
    ...host.settings.get<Partial<ScheduleSettings>>('feature.schedules', {}),
  });
  /** Restart currently counting down (scheduled or manual). */
  let pending: { at: number; update: boolean; sent: Set<number> } | null = null;
  let busy = false;
  let stopTimer: (() => void) | null = null;

  const announce = (min: number) =>
    host.palworld.announce(settings().message.replace('{min}', String(min))).catch(() => {});

  const runRestart = async (update: boolean) => {
    busy = true;
    bus.emit('intentional', {});
    try {
      await backups.create(update ? 'preupdate' : 'prerestart').catch(() => {});
      if (update) {
        await host.server.stop();
        await host.palctl(['update-palworld'], { timeoutMs: 60 * 60_000 });
        await host.server.start();
      } else {
        await host.server.restart();
      }
      bus.emit('restart:done', { updated: update });
    } catch (e) {
      bus.emit('restart:failed', { error: errorText(e) });
    } finally {
      busy = false;
    }
  };

  const tick = async () => {
    if (host.server.mode() !== 'managed') return;
    const s = settings();
    const now = Date.now();
    if (!pending && s.enabled && s.times.length) {
      const next = Math.min(...s.times.map((t) => nextOccurrence(t, now)));
      const lead = Math.max(0, ...s.warnings) * 60_000;
      if (next - now <= lead + 30_000) pending = { at: next, update: s.updateOnRestart, sent: new Set() };
    }
    if (!pending || busy) return;
    const left = pending.at - now;
    for (const w of s.warnings) {
      if (!pending.sent.has(w) && left <= w * 60_000 && left > (w - 1) * 60_000 - 30_000) {
        pending.sent.add(w);
        await announce(w);
        bus.emit('restart:warning', { minutes: w });
      }
    }
    if (left <= 0) {
      const job = pending;
      pending = null;
      await runRestart(job.update);
    }
  };

  return {
    start() {
      stopTimer = every(15_000, tick);
    },
    stop() {
      stopTimer?.();
      pending = null;
    },
    routes: [
      {
        method: 'GET',
        path: 'schedules',
        access: 'staff',
        permission: 'server.schedules',
        handler: () => {
          const s = settings();
          const next = s.enabled && s.times.length ? Math.min(...s.times.map((t) => nextOccurrence(t, Date.now()))) : null;
          return { settings: s, next, pending: pending ? { at: pending.at, update: pending.update } : null, busy };
        },
      },
      {
        method: 'PUT',
        path: 'schedules',
        access: 'staff',
        permission: 'server.schedules',
        handler: ({ body, user }) => {
          const s = parseBody(
            z.object({
              enabled: z.boolean(),
              times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time (HH:MM)')).max(12),
              warnings: z.array(z.number().int().min(1).max(60)).max(6),
              updateOnRestart: z.boolean(),
              message: z.string().trim().min(1).max(200),
            }),
            body,
          );
          s.warnings = [...new Set(s.warnings)].sort((a, b) => b - a);
          host.settings.set('feature.schedules', s);
          audit(host, user, 'schedule.settings');
          return s;
        },
      },
      {
        method: 'POST',
        path: 'schedules/restart-now',
        access: 'staff',
        permission: 'server.schedules',
        handler: ({ body, user }) => {
          const { delayMinutes, update } = parseBody(z.object({ delayMinutes: z.number().int().min(0).max(60), update: z.boolean().default(false) }), body);
          if (busy || pending) throw httpError(409, 'A restart is already planned or running');
          audit(host, user, update ? 'server.update' : 'server.restart-planned', `${delayMinutes} min`);
          if (delayMinutes === 0) {
            void runRestart(update);
          } else {
            // Warnings longer than the chosen delay count as already sent.
            const sent = new Set(settings().warnings.filter((w) => w > delayMinutes));
            pending = { at: Date.now() + delayMinutes * 60_000, update, sent };
          }
          return { ok: true };
        },
      },
      {
        method: 'DELETE',
        path: 'schedules/pending',
        access: 'staff',
        permission: 'server.schedules',
        handler: async ({ user }) => {
          if (!pending) throw httpError(404, 'No restart planned');
          pending = null;
          await host.palworld.announce(host.t('The planned restart is cancelled.')).catch(() => {});
          audit(host, user, 'schedule.cancel');
          return { ok: true };
        },
      },
    ],
  };
}

// In-game announcements

const announcementSchema = z.object({
  message: z.string().trim().min(1).max(200),
  runAt: z.number().int().positive(),
  repeat: z.enum(['none', 'hourly', 'daily']),
});

export function createAnnouncements(host: FeatureHost): Feature {
  const { db } = host;
  let stopTimer: (() => void) | null = null;

  const due = async () => {
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM pro_announcements WHERE run_at <= ?').all(now) as {
      id: number;
      message: string;
      run_at: number;
      repeat: 'none' | 'hourly' | 'daily';
    }[];
    for (const a of rows) {
      await host.palworld.announce(a.message).catch(() => {});
      if (a.repeat === 'none') {
        db.prepare('DELETE FROM pro_announcements WHERE id = ?').run(a.id);
      } else {
        const step = a.repeat === 'hourly' ? 3600_000 : 24 * 3600_000;
        let next = a.run_at + step;
        while (next <= now) next += step;
        db.prepare('UPDATE pro_announcements SET run_at = ?, last_sent_at = ? WHERE id = ?').run(next, now, a.id);
      }
    }
  };

  return {
    start() {
      stopTimer = every(20_000, due);
    },
    stop() {
      stopTimer?.();
    },
    routes: [
      {
        method: 'POST',
        path: 'announce',
        access: 'staff',
        permission: 'server.announce',
        handler: async ({ body, user }) => {
          const { message } = parseBody(z.object({ message: z.string().trim().min(1).max(200) }), body);
          await host.palworld.announce(message);
          audit(host, user, 'server.announce', message);
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'announcements',
        access: 'staff',
        permission: 'server.announce',
        handler: () =>
          db
            .prepare('SELECT id, message, run_at AS runAt, repeat, last_sent_at AS lastSentAt, created_by AS createdBy FROM pro_announcements ORDER BY run_at')
            .all(),
      },
      {
        method: 'POST',
        path: 'announcements',
        access: 'staff',
        permission: 'server.announce',
        handler: ({ body, user }) => {
          const a = parseBody(announcementSchema, body);
          db.prepare('INSERT INTO pro_announcements (message, run_at, repeat, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(
            a.message,
            a.runAt,
            a.repeat,
            user!.username,
            Date.now(),
          );
          audit(host, user, 'announcement.create', a.message);
          return { ok: true };
        },
      },
      {
        method: 'DELETE',
        path: 'announcements/:id',
        access: 'staff',
        permission: 'server.announce',
        handler: ({ params, user }) => {
          db.prepare('DELETE FROM pro_announcements WHERE id = ?').run(Number(params.id));
          audit(host, user, 'announcement.delete', params.id);
          return { ok: true };
        },
      },
    ],
  };
}
