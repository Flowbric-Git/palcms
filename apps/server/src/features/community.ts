import { z } from 'zod';
import type { HostUser, FeatureHost } from '@palcms/shared';
import { rconCommand } from './rcon';
import { recordSanction } from './sanctions';
import { errorText, httpError, parseBody, type Feature, type FeatureBus } from './util';

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string, details?: unknown) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target, details });

// Moderation

interface WhitelistSettings {
  enabled: boolean;
  message: string;
}

export function createModeration(host: FeatureHost): Feature {
  const { db } = host;
  const wl = () => ({ enabled: false, message: host.t('This server is whitelisted.'), ...host.settings.get<Partial<WhitelistSettings>>('feature.whitelist', {}) });
  let off: (() => void) | null = null;
  const kicked = new Map<string, number>();

  const nameOf = (uid: string) =>
    (db.prepare('SELECT name FROM players WHERE uid = ?').get(uid) as { name: string } | undefined)?.name ??
    host.server.onlinePlayers().find((p) => p.userId === uid)?.name ??
    uid;

  return {
    start() {
      // Whitelist: any player missing from the list is kicked as soon as they connect.
      off = host.events.on('tick', ({ players }) => {
        const s = wl();
        if (!s.enabled) return;
        const allowed = new Set((db.prepare('SELECT uid FROM pro_whitelist').all() as { uid: string }[]).map((r) => r.uid));
        for (const p of players) {
          if (allowed.has(p.userId)) continue;
          if (Date.now() - (kicked.get(p.userId) ?? 0) < 20_000) continue;
          kicked.set(p.userId, Date.now());
          host.palworld.kick(p.userId, s.message).catch(() => {});
        }
      });
    },
    stop() {
      off?.();
    },
    routes: [
      {
        method: 'POST',
        path: 'players/:uid/kick',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, body, user }) => {
          const { message } = parseBody(z.object({ message: z.string().trim().max(200).default(host.t('Kicked by an administrator')) }), body);
          await host.palworld.kick(params.uid, message);
          recordSanction(host, params.uid, nameOf(params.uid), 'kick', message, user!.username);
          audit(host, user, 'player.kick', nameOf(params.uid), { message });
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'players/:uid/ban',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, body, user }) => {
          const { reason } = parseBody(z.object({ reason: z.string().trim().max(200).default('') }), body);
          await host.palworld.ban(params.uid, reason || host.t('Banned by an administrator'));
          db.prepare(
            `INSERT INTO pro_bans (uid, name, reason, banned_at, banned_by) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(uid) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at, banned_by = excluded.banned_by, expires_at = NULL`,
          ).run(params.uid, nameOf(params.uid), reason, Date.now(), user!.username);
          recordSanction(host, params.uid, nameOf(params.uid), 'ban', reason, user!.username);
          audit(host, user, 'player.ban', nameOf(params.uid), { reason });
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'bans',
        access: 'staff',
        permission: 'server.moderation',
        handler: () =>
          db.prepare('SELECT uid, name, reason, banned_at AS bannedAt, banned_by AS bannedBy, expires_at AS expiresAt FROM pro_bans ORDER BY banned_at DESC').all(),
      },
      {
        method: 'DELETE',
        path: 'bans/:uid',
        access: 'staff',
        permission: 'server.moderation',
        handler: async ({ params, user }) => {
          await host.palworld.unban(params.uid);
          db.prepare('DELETE FROM pro_bans WHERE uid = ?').run(params.uid);
          recordSanction(host, params.uid, nameOf(params.uid), 'unban', '', user!.username);
          audit(host, user, 'player.unban', nameOf(params.uid));
          return { ok: true };
        },
      },
      {
        method: 'GET',
        path: 'whitelist',
        access: 'staff',
        permission: 'server.moderation',
        handler: () => ({
          settings: wl(),
          entries: db.prepare('SELECT uid, name, added_at AS addedAt, added_by AS addedBy FROM pro_whitelist ORDER BY name').all(),
        }),
      },
      {
        method: 'PUT',
        path: 'whitelist/settings',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ body, user }) => {
          const s = parseBody(z.object({ enabled: z.boolean(), message: z.string().trim().min(1).max(200) }), body);
          if (s.enabled && !(db.prepare('SELECT 1 FROM pro_whitelist LIMIT 1').get())) {
            throw httpError(400, 'Add at least one player to the list before turning it on (otherwise everyone would be kicked)');
          }
          host.settings.set('feature.whitelist', s);
          audit(host, user, s.enabled ? 'whitelist.enable' : 'whitelist.disable');
          return s;
        },
      },
      {
        method: 'POST',
        path: 'whitelist',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ body, user }) => {
          const e = parseBody(z.object({ uid: z.string().trim().min(3).max(100), name: z.string().trim().max(60).optional() }), body);
          db.prepare('INSERT OR REPLACE INTO pro_whitelist (uid, name, added_at, added_by) VALUES (?, ?, ?, ?)').run(
            e.uid,
            e.name || nameOf(e.uid),
            Date.now(),
            user!.username,
          );
          audit(host, user, 'whitelist.add', e.name || nameOf(e.uid));
          return { ok: true };
        },
      },
      {
        method: 'DELETE',
        path: 'whitelist/:uid',
        access: 'staff',
        permission: 'server.moderation',
        handler: ({ params, user }) => {
          db.prepare('DELETE FROM pro_whitelist WHERE uid = ?').run(params.uid);
          audit(host, user, 'whitelist.remove', nameOf(params.uid));
          return { ok: true };
        },
      },
    ],
  };
}

// RCON console

export function createRcon(host: FeatureHost): Feature {
  const read = async (): Promise<{ enabled: boolean; port: number; password: string; host: string; managed: boolean }> => {
    const mode = host.server.mode();
    if (mode === 'external') {
      // Existing server: RCON is available if the admin entered its port in "Server connection".
      const ext = host.server.external();
      return { enabled: !!ext?.rconPort, port: ext?.rconPort ?? 25575, password: ext?.adminPassword ?? '', host: ext?.apiHost ?? '', managed: false };
    }
    if (mode === 'none') return { enabled: false, port: 25575, password: '', host: '', managed: false };
    const cfg = await host.server.readConfig();
    return {
      enabled: cfg.RCONEnabled === true,
      port: Number(cfg.RCONPort) || 25575,
      password: String(cfg.AdminPassword ?? ''),
      host: '127.0.0.1',
      managed: true,
    };
  };
  return {
    routes: [
      {
        method: 'GET',
        path: 'rcon',
        access: 'staff',
        permission: 'server.rcon',
        handler: async () => {
          const { enabled, port, managed } = await read();
          return { enabled, port, managed, mode: host.server.mode() };
        },
      },
      {
        method: 'POST',
        path: 'rcon/enable',
        access: 'staff',
        permission: 'server.rcon',
        handler: async ({ user }) => {
          if (host.server.mode() !== 'managed') throw httpError(409, 'For an external server, enter its RCON port in "Server connection"');
          // The RCON port is never opened in the firewall: only the CMS (locally) can connect to it.
          const { restarted } = await host.server.updateConfig({ RCONEnabled: true }, true);
          audit(host, user, 'rcon.enable');
          return { ok: true, restarted };
        },
      },
      {
        method: 'POST',
        path: 'rcon/exec',
        access: 'staff',
        permission: 'server.rcon',
        handler: async ({ body, user }) => {
          const { command } = parseBody(z.object({ command: z.string().trim().min(1).max(300) }), body);
          const { enabled, port, password, host: rconHost } = await read();
          if (!enabled) throw httpError(409, 'RCON is disabled: turn it on first');
          audit(host, user, 'rcon.exec', command.split(' ')[0], { command });
          try {
            return { output: await rconCommand(rconHost, port, password, command) };
          } catch (e) {
            throw httpError(502, errorText(e));
          }
        },
      },
    ],
  };
}

// Discord

interface DiscordSettings {
  webhookUrl: string;
  events: { server: boolean; schedule: boolean; content: boolean; alerts: boolean };
}
const DEFAULT_DISCORD: DiscordSettings = { webhookUrl: '', events: { server: true, schedule: true, content: true, alerts: true } };
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const COLORS = { green: 0x22c55e, red: 0xef4444, amber: 0xf59e0b, blue: 0x3b82f6, purple: 0xa855f7 };

export function createDiscord(host: FeatureHost, bus: FeatureBus): Feature {
  const settings = () => {
    const s = host.settings.get<Partial<DiscordSettings>>('feature.discord', {});
    return { ...DEFAULT_DISCORD, ...s, events: { ...DEFAULT_DISCORD.events, ...s.events } };
  };
  const offs: (() => void)[] = [];
  let queue = Promise.resolve();
  let lastIntentional = 0;

  const send = (title: string, description: string, color: number, url?: string) => {
    const { webhookUrl } = settings();
    if (!webhookUrl) return;
    queue = queue.then(async () => {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: host.site.get().name.slice(0, 80) || 'PalCMS',
            embeds: [{ title, description, color, url, timestamp: new Date().toISOString(), footer: { text: 'PalCMS' } }],
          }),
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        host.log(`Discord: could not send (${errorText(e)})`);
      }
    });
  };

  const siteUrl = (path: string) => `${host.publicUrl}${host.basePath}${path}`;
  const on = <T>(enabled: () => boolean, fn: (d: T) => void) => (d: T) => {
    if (enabled()) fn(d);
  };
  const ev = () => settings().events;

  return {
    start() {
      offs.push(
        host.events.on('server:action', (d) => {
          lastIntentional = Date.now();
          if (ev().server) {
            const title = { start: 'Server started', stop: 'Server stopped', restart: 'Server restarted' }[d.action];
            send(host.t(title), d.by ? host.t('Action by **{name}** from the panel.', { name: d.by }) : host.t('Action from the panel.'), COLORS.blue);
          }
        }),
        bus.on('intentional', () => (lastIntentional = Date.now())),
        host.events.on(
          'server:online',
          on(() => ev().server, () => send(`🟢 ${host.t('Server online')}`, host.t('Join us: {address}', { address: `\`${host.server.status().address}\`` }), COLORS.green)),
        ),
        host.events.on(
          'server:offline',
          on(
            () => ev().server,
            () => {
              // Offline without a recent team action: the server is considered to have crashed.
              if (Date.now() - lastIntentional < 10 * 60_000) send(`🔴 ${host.t('Server offline')}`, host.t('Stop planned by the team.'), COLORS.amber);
              else send(`💥 ${host.t('Crash detected')}`, host.t('The server stopped answering although no stop was planned. It restarts automatically if possible.'), COLORS.red);
            },
          ),
        ),
        bus.on(
          'restart:warning',
          on(() => ev().schedule, (d) => send(`⏳ ${host.t('Restart planned')}`, host.t('The server restarts in **{n} minute(s)**.', { n: d.minutes }), COLORS.amber)),
        ),
        bus.on(
          'restart:done',
          on(() => ev().schedule, (d) => send(`🔄 ${host.t('Restart finished')}`, host.t(d.updated ? 'The server was updated and restarted.' : 'The server restarted.'), COLORS.green)),
        ),
        bus.on('restart:failed', on(() => ev().schedule, (d) => send(`⚠️ ${host.t('Restart failed')}`, host.tMessage(d.error), COLORS.red))),
        bus.on(
          'backup:done',
          on(() => ev().schedule, (d) => d.tag !== 'auto' && send(`💾 ${host.t('Backup done')}`, `\`${d.name}\``, COLORS.blue)),
        ),
        bus.on('backup:failed', on(() => ev().schedule, (d) => send(`⚠️ ${host.t('Backup failed')}`, host.tMessage(d.error), COLORS.red))),
        host.events.on(
          'news:published',
          on(() => ev().content, (d) => send(`📰 ${d.title}`, host.t('New article on the site!'), COLORS.purple, siteUrl(`news/${d.slug}`))),
        ),
        // A crash already has its own message (server:offline): do not send it twice.
        bus.on(
          'alert',
          on(
            () => ev().alerts,
            (d) => d.kind !== 'crash' && send(d.level === 'critical' ? `🚨 ${host.t('Critical alert')}` : `⚠️ ${host.t('Alert')}`, host.tMessage(d.message), d.level === 'critical' ? COLORS.red : COLORS.amber, siteUrl('admin/server/monitoring')),
          ),
        ),
        bus.on(
          'flag:new',
          on(() => ev().alerts, (d) => send(`🕵️ ${host.t('Suspected cheating')}`, `**${d.name}**: ${host.tMessage(d.details)}`, COLORS.red, siteUrl('admin/server/anti-cheat'))),
        ),
        bus.on(
          'update:available',
          on(() => ev().alerts, (d) => send(`⬆️ ${host.t('Update available')}`, host.t('PalCMS {latest} is available (current version: {current}).', { latest: d.latest, current: d.current }), COLORS.blue, siteUrl('admin/updates'))),
        ),
        bus.on('event:started', on(() => ev().schedule, (d) => send(`🎉 ${host.t('Event started')}`, host.t('**{name}** has started!', { name: d.name }), COLORS.purple, siteUrl('events')))),
        bus.on('event:ended', on(() => ev().schedule, (d) => send(`🏁 ${host.t('Event ended')}`, host.t('**{name}** is over.', { name: d.name }), COLORS.blue))),
        bus.on(
          'ticket:new',
          on(
            () => ev().content,
            (d) => send(d.kind === 'report' ? `🚩 ${host.t('New report')}` : `💡 ${host.t('New suggestion')}`, host.t('**{subject}** (by {name})', { subject: d.subject, name: d.username }), COLORS.amber, siteUrl('admin/site/reports')),
          ),
        ),
        host.events.on(
          'member:pending',
          on(
            () => ev().content,
            (d) => send(`👤 ${host.t('New sign-up to approve')}`, host.t('**{name}** (in-game name: {ingame})', { name: d.username, ingame: d.inGameName ?? '—' }), COLORS.amber, siteUrl('admin/site/members')),
          ),
        ),
      );
    },
    stop() {
      offs.splice(0).forEach((o) => o());
    },
    routes: [
      {
        method: 'GET',
        path: 'discord',
        access: 'staff',
        permission: 'site.discord',
        handler: () => {
          const s = settings();
          return { ...s, webhookUrl: s.webhookUrl ? `${s.webhookUrl.slice(0, 45)}…` : '', configured: !!s.webhookUrl };
        },
      },
      {
        method: 'PUT',
        path: 'discord',
        access: 'staff',
        permission: 'site.discord',
        handler: ({ body, user }) => {
          const b = parseBody(
            z.object({
              webhookUrl: z.string().trim().max(300).optional(),
              events: z.object({ server: z.boolean(), schedule: z.boolean(), content: z.boolean(), alerts: z.boolean().default(true) }),
            }),
            body,
          );
          const current = settings();
          let webhookUrl = current.webhookUrl;
          if (b.webhookUrl !== undefined && !b.webhookUrl.endsWith('…')) {
            if (b.webhookUrl && !WEBHOOK_RE.test(b.webhookUrl)) throw httpError(400, 'Invalid Discord webhook link');
            webhookUrl = b.webhookUrl;
          }
          host.settings.set('feature.discord', { webhookUrl, events: b.events });
          audit(host, user, 'discord.settings');
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'discord/test',
        access: 'staff',
        permission: 'site.discord',
        handler: async () => {
          if (!settings().webhookUrl) throw httpError(400, 'No webhook configured');
          send(`✅ ${host.t('PalCMS test')}`, host.t('Discord notifications work!'), COLORS.green, siteUrl(''));
          await queue;
          return { ok: true };
        },
      },
    ],
  };
}

// Advanced themes

export interface ThemeSettings {
  font: 'system' | 'Inter' | 'Poppins' | 'Nunito' | 'Rajdhani' | 'Orbitron';
  background: 'plain' | 'gradient' | 'dots' | 'image';
  backgroundImage: string;
  glass: boolean;
  customCss: string;
}
const DEFAULT_THEME: ThemeSettings = { font: 'system', background: 'plain', backgroundImage: '', glass: false, customCss: '' };

export function createThemes(host: FeatureHost): Feature {
  const get = () => ({ ...DEFAULT_THEME, ...host.settings.get<Partial<ThemeSettings>>('feature.theme', {}) });
  return {
    routes: [
      { method: 'GET', path: 'theme', access: 'public', handler: get },
      {
        method: 'PUT',
        path: 'theme',
        access: 'staff',
        permission: 'site.appearance',
        handler: ({ body, user }) => {
          const t = parseBody(
            z.object({
              font: z.enum(['system', 'Inter', 'Poppins', 'Nunito', 'Rajdhani', 'Orbitron']),
              background: z.enum(['plain', 'gradient', 'dots', 'image']),
              backgroundImage: z
                .string()
                .trim()
                .max(500)
                .refine((v) => v === '' || v.startsWith('/') || /^https:\/\//.test(v), 'Invalid link'),
              glass: z.boolean(),
              // Free CSS reserved for the team; block anything that could escape the <style> tag.
              customCss: z
                .string()
                .max(20_000)
                .refine((v) => !/<\/?\s*(style|script)/i.test(v), 'Forbidden tags in the CSS'),
            }),
            body,
          );
          host.settings.set('feature.theme', t);
          audit(host, user, 'theme.update');
          return t;
        },
      },
    ],
  };
}
