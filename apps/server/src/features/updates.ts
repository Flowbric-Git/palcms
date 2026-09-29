import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { FeatureHost } from '@palcms/shared';
import type { BackupService } from './operations';
import { errorText, every, httpError, parseBody, type Feature, type FeatureBus } from './util';

/** Compare deux versions "1.2.3" (le "v" initial est ignoré). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

/** Lit la sortie de "palctl check-update" (installed=… / latest=…). */
export function parseBuildIds(output: string): { installed: string | null; latest: string | null } {
  const get = (k: string) => new RegExp(`^${k}=(\\d+)$`, 'm').exec(output)?.[1] ?? null;
  return { installed: get('installed'), latest: get('latest') };
}

/** Dépôt GitHub des versions, lu dans install.sh (même valeur que pour l'installation). */
function releaseRepo(): string | null {
  for (const p of [path.resolve('../install.sh'), path.resolve('../../install.sh')]) {
    try {
      const m = /PALCMS_REPO="\$\{PALCMS_REPO:-([\w.-]+\/[\w.-]+)\}"/.exec(fs.readFileSync(p, 'utf8'));
      if (m) return m[1];
    } catch {
      // fichier absent, on essaie le suivant
    }
  }
  return null;
}

interface ServerUpdateSettings {
  auto: boolean;
  checkMinutes: number;
  warnings: number[];
}
const DEFAULT_SERVER_UPDATE: ServerUpdateSettings = { auto: true, checkMinutes: 30, warnings: [15, 5, 1] };

export function createUpdates(host: FeatureHost, bus: FeatureBus, backups: BackupService): Feature {
  const settings = () => ({ ...DEFAULT_SERVER_UPDATE, ...host.settings.get<Partial<ServerUpdateSettings>>('feature.serverUpdate', {}) });
  const server = {
    installed: null as string | null,
    latest: null as string | null,
    checkedAt: 0,
    error: null as string | null,
    pending: null as { at: number; sent: Set<number> } | null,
    running: false,
    lastResult: null as string | null,
  };
  const palcms = {
    latest: null as string | null,
    notes: '',
    url: '',
    checkedAt: 0,
    error: null as string | null,
    notified: host.settings.get<string | null>('feature.updates.notified', null),
  };
  const offs: (() => void)[] = [];

  const checkServer = async () => {
    if (host.server.mode() !== 'managed') return;
    try {
      const ids = parseBuildIds(await host.palctl(['check-update'], { timeoutMs: 3 * 60_000 }));
      server.installed = ids.installed;
      server.latest = ids.latest;
      server.error = ids.latest ? null : 'Version en ligne introuvable (steamcmd)';
    } catch (e) {
      server.error = errorText(e);
    }
    server.checkedAt = Date.now();
  };
  const serverOutdated = () => !!server.installed && !!server.latest && server.installed !== server.latest;

  const runServerUpdate = async () => {
    server.running = true;
    bus.emit('intentional', {});
    try {
      await backups.create('preupdate').catch(() => {});
      await host.server.stop();
      await host.palctl(['update-palworld'], { timeoutMs: 60 * 60_000 });
      await host.server.start();
      server.lastResult = `Mis à jour le ${new Date().toLocaleString('fr-FR')}`;
      bus.emit('restart:done', { updated: true });
      await checkServer();
    } catch (e) {
      server.lastResult = `Échec : ${errorText(e)}`;
      bus.emit('restart:failed', { error: errorText(e) });
    } finally {
      server.running = false;
    }
  };

  const schedule = (minutes: number) => {
    const s = settings();
    // Les avertissements plus longs que le délai sont considérés comme déjà envoyés.
    server.pending = { at: Date.now() + minutes * 60_000, sent: new Set(s.warnings.filter((w) => w > minutes)) };
  };

  const tickServer = async () => {
    if (host.server.mode() !== 'managed' || server.running) return;
    const s = settings();
    if (Date.now() - server.checkedAt >= s.checkMinutes * 60_000) {
      await checkServer();
      if (s.auto && serverOutdated() && !server.pending) schedule(Math.max(0, ...s.warnings));
    }
    if (!server.pending) return;
    const left = server.pending.at - Date.now();
    for (const w of s.warnings) {
      if (!server.pending.sent.has(w) && left <= w * 60_000 && left > (w - 1) * 60_000 - 30_000) {
        server.pending.sent.add(w);
        await host.palworld.announce(`Mise à jour du serveur dans ${w} minute(s). Pensez à vous mettre à l'abri !`).catch(() => {});
        bus.emit('restart:warning', { minutes: w });
      }
    }
    if (left <= 0) {
      server.pending = null;
      await runServerUpdate();
    }
  };

  const checkPalcms = async () => {
    const repo = releaseRepo();
    if (!repo) {
      palcms.error = 'Dépôt GitHub inconnu';
      return;
    }
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PalCMS' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
      const r = (await res.json()) as { tag_name?: string; body?: string; html_url?: string };
      palcms.latest = r.tag_name ?? null;
      palcms.notes = (r.body ?? '').slice(0, 5000);
      palcms.url = r.html_url ?? '';
      palcms.error = null;
      if (palcms.latest && compareVersions(palcms.latest, host.version) > 0 && palcms.notified !== palcms.latest) {
        palcms.notified = palcms.latest;
        host.settings.set('feature.updates.notified', palcms.latest);
        bus.emit('update:available', { current: host.version, latest: palcms.latest });
      }
    } catch (e) {
      palcms.error = errorText(e);
    }
    palcms.checkedAt = Date.now();
  };

  const palcmsInfo = () => ({
    current: host.version,
    latest: palcms.latest,
    available: !!palcms.latest && compareVersions(palcms.latest, host.version) > 0,
    notes: palcms.notes,
    url: palcms.url,
    checkedAt: palcms.checkedAt || null,
    error: palcms.error,
    canInstall: host.server.mode() === 'managed' || fs.existsSync('/usr/local/lib/palcms/palctl'),
  });

  return {
    start() {
      offs.push(
        every(60_000, tickServer),
        every(6 * 3600_000, checkPalcms),
      );
      setTimeout(() => void checkPalcms(), 30_000).unref?.();
    },
    stop() {
      offs.splice(0).forEach((o) => o());
    },
    routes: [
      {
        method: 'GET',
        path: 'updates/server',
        access: 'staff',
        permission: 'server.schedules',
        handler: () => ({
          settings: settings(),
          installed: server.installed,
          latest: server.latest,
          outdated: serverOutdated(),
          checkedAt: server.checkedAt || null,
          error: server.error,
          pending: server.pending ? { at: server.pending.at } : null,
          running: server.running,
          lastResult: server.lastResult,
        }),
      },
      {
        method: 'PUT',
        path: 'updates/server/settings',
        access: 'staff',
        permission: 'server.schedules',
        handler: ({ body, user }) => {
          const s = parseBody(
            z.object({ auto: z.boolean(), checkMinutes: z.number().int().min(10).max(24 * 60), warnings: z.array(z.number().int().min(1).max(60)).max(6) }),
            body,
          );
          s.warnings = [...new Set(s.warnings)].sort((a, b) => b - a);
          host.settings.set('feature.serverUpdate', s);
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'server-update.settings' });
          return s;
        },
      },
      {
        method: 'POST',
        path: 'updates/server/check',
        access: 'staff',
        permission: 'server.schedules',
        handler: async () => {
          if (host.server.mode() !== 'managed') throw httpError(409, 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS');
          await checkServer();
          return { installed: server.installed, latest: server.latest, outdated: serverOutdated(), error: server.error };
        },
      },
      {
        method: 'POST',
        path: 'updates/server/now',
        access: 'staff',
        permission: 'server.schedules',
        handler: ({ body, user }) => {
          if (host.server.mode() !== 'managed') throw httpError(409, 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS');
          const { delayMinutes } = parseBody(z.object({ delayMinutes: z.number().int().min(0).max(60) }), body);
          if (server.running || server.pending) throw httpError(409, 'Une mise à jour est déjà prévue ou en cours');
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'server.update', target: `${delayMinutes} min` });
          if (delayMinutes === 0) void runServerUpdate();
          else schedule(delayMinutes);
          return { ok: true };
        },
      },
      {
        method: 'DELETE',
        path: 'updates/server/pending',
        access: 'staff',
        permission: 'server.schedules',
        handler: async () => {
          if (!server.pending) throw httpError(404, 'Aucune mise à jour prévue');
          server.pending = null;
          await host.palworld.announce('La mise à jour prévue est annulée.').catch(() => {});
          return { ok: true };
        },
      },
      { method: 'GET', path: 'updates/palcms', access: 'staff', permission: 'admin.updates', handler: () => palcmsInfo() },
      {
        method: 'POST',
        path: 'updates/palcms/check',
        access: 'staff',
        permission: 'admin.updates',
        handler: async () => {
          await checkPalcms();
          return palcmsInfo();
        },
      },
      {
        method: 'POST',
        path: 'updates/palcms/install',
        access: 'staff',
        permission: 'admin.updates',
        handler: async ({ user }) => {
          const info = palcmsInfo();
          if (!info.available || !info.latest) throw httpError(409, 'Aucune nouvelle version à installer');
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'palcms.update', target: info.latest });
          const out = await host.palctl(['self-update', info.latest], { timeoutMs: 2 * 60_000 });
          return { ok: true, version: info.latest, output: out.trim().split('\n').pop() };
        },
      },
    ],
  };
}
