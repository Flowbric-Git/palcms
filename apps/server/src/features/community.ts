import { z } from 'zod';
import type { HostUser, FeatureHost } from '@palcms/shared';
import { rconCommand } from './rcon';
import { recordSanction } from './sanctions';
import { errorText, httpError, parseBody, type Feature, type FeatureBus } from './util';

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string, details?: unknown) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target, details });

// Modération

interface WhitelistSettings {
  enabled: boolean;
  message: string;
}

export function createModeration(host: FeatureHost): Feature {
  const { db } = host;
  const wl = () => ({ enabled: false, message: 'Ce serveur est sur liste blanche.', ...host.settings.get<Partial<WhitelistSettings>>('feature.whitelist', {}) });
  let off: (() => void) | null = null;
  const kicked = new Map<string, number>();

  const nameOf = (uid: string) =>
    (db.prepare('SELECT name FROM players WHERE uid = ?').get(uid) as { name: string } | undefined)?.name ??
    host.server.onlinePlayers().find((p) => p.userId === uid)?.name ??
    uid;

  return {
    start() {
      // Liste blanche : tout joueur absent de la liste est expulsé dès sa connexion.
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
          const { message } = parseBody(z.object({ message: z.string().trim().max(200).default('Expulsé par un administrateur') }), body);
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
          await host.palworld.ban(params.uid, reason || 'Banni par un administrateur');
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
            throw httpError(400, 'Ajoute au moins un joueur à la liste avant de l’activer (sinon tout le monde serait expulsé)');
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

// Console RCON

export function createRcon(host: FeatureHost): Feature {
  const read = async (): Promise<{ enabled: boolean; port: number; password: string; host: string; managed: boolean }> => {
    const mode = host.server.mode();
    if (mode === 'external') {
      // Serveur existant : RCON disponible si l'admin a indiqué son port dans "Connexion au serveur".
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
          if (host.server.mode() !== 'managed') throw httpError(409, 'Pour un serveur externe, indique son port RCON dans « Connexion au serveur »');
          // Le port RCON n'est jamais ouvert dans le pare-feu : seul le CMS (en local) peut s'y connecter.
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
          if (!enabled) throw httpError(409, 'RCON est désactivé : active-le d’abord');
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
        host.log(`Discord : envoi impossible (${errorText(e)})`);
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
            const label = { start: 'démarré', stop: 'arrêté', restart: 'redémarré' }[d.action];
            send(`Serveur ${label}`, d.by ? `Action de **${d.by}** depuis le panel.` : 'Action depuis le panel.', COLORS.blue);
          }
        }),
        bus.on('intentional', () => (lastIntentional = Date.now())),
        host.events.on(
          'server:online',
          on(() => ev().server, () => send('🟢 Serveur en ligne', `Rejoignez-nous : \`${host.server.status().address}\``, COLORS.green)),
        ),
        host.events.on(
          'server:offline',
          on(
            () => ev().server,
            () => {
              // Hors ligne sans action récente de l'équipe : on considère que le serveur a planté.
              if (Date.now() - lastIntentional < 10 * 60_000) send('🔴 Serveur hors ligne', 'Arrêt prévu par l’équipe.', COLORS.amber);
              else send('💥 Crash détecté', 'Le serveur ne répond plus alors qu’aucun arrêt n’était prévu. Il redémarre automatiquement si possible.', COLORS.red);
            },
          ),
        ),
        bus.on(
          'restart:warning',
          on(() => ev().schedule, (d) => send('⏳ Redémarrage prévu', `Le serveur redémarre dans **${d.minutes} minute(s)**.`, COLORS.amber)),
        ),
        bus.on(
          'restart:done',
          on(() => ev().schedule, (d) => send('🔄 Redémarrage terminé', d.updated ? 'Le serveur a été mis à jour et redémarré.' : 'Le serveur a redémarré.', COLORS.green)),
        ),
        bus.on('restart:failed', on(() => ev().schedule, (d) => send('⚠️ Échec du redémarrage', d.error, COLORS.red))),
        bus.on(
          'backup:done',
          on(() => ev().schedule, (d) => d.tag !== 'auto' && send('💾 Sauvegarde effectuée', `\`${d.name}\``, COLORS.blue)),
        ),
        bus.on('backup:failed', on(() => ev().schedule, (d) => send('⚠️ Échec de la sauvegarde', d.error, COLORS.red))),
        host.events.on(
          'news:published',
          on(() => ev().content, (d) => send(`📰 ${d.title}`, 'Nouvel article sur le site !', COLORS.purple, siteUrl(`actualites/${d.slug}`))),
        ),
        // Le crash a déjà son propre message (server:offline) : on ne le double pas.
        bus.on(
          'alert',
          on(
            () => ev().alerts,
            (d) => d.kind !== 'crash' && send(d.level === 'critical' ? '🚨 Alerte critique' : '⚠️ Alerte', d.message, d.level === 'critical' ? COLORS.red : COLORS.amber, siteUrl('admin/serveur/surveillance')),
          ),
        ),
        bus.on(
          'flag:new',
          on(() => ev().alerts, (d) => send('🕵️ Soupçon de triche', `**${d.name}** : ${d.details}`, COLORS.red, siteUrl('admin/serveur/anti-triche'))),
        ),
        bus.on(
          'update:available',
          on(() => ev().alerts, (d) => send('⬆️ Mise à jour disponible', `PalCMS ${d.latest} est disponible (version actuelle : ${d.current}).`, COLORS.blue, siteUrl('admin/mises-a-jour'))),
        ),
        bus.on('event:started', on(() => ev().schedule, (d) => send('🎉 Événement commencé', `**${d.name}** a commencé !`, COLORS.purple, siteUrl('evenements')))),
        bus.on('event:ended', on(() => ev().schedule, (d) => send('🏁 Événement terminé', `**${d.name}** est terminé.`, COLORS.blue))),
        bus.on(
          'ticket:new',
          on(
            () => ev().content,
            (d) => send(d.kind === 'report' ? '🚩 Nouveau signalement' : '💡 Nouvelle suggestion', `**${d.subject}** (par ${d.username})`, COLORS.amber, siteUrl('admin/site/signalements')),
          ),
        ),
        host.events.on(
          'member:pending',
          on(
            () => ev().content,
            (d) => send('👤 Nouvelle inscription à valider', `**${d.username}** (pseudo en jeu : ${d.inGameName ?? '—'})`, COLORS.amber, siteUrl('admin/site/membres')),
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
            if (b.webhookUrl && !WEBHOOK_RE.test(b.webhookUrl)) throw httpError(400, 'Lien de webhook Discord invalide');
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
          if (!settings().webhookUrl) throw httpError(400, 'Aucun webhook configuré');
          send('✅ Test PalCMS', 'Les notifications Discord fonctionnent !', COLORS.green, siteUrl(''));
          await queue;
          return { ok: true };
        },
      },
    ],
  };
}

// Thèmes avancés

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
                .refine((v) => v === '' || v.startsWith('/') || /^https:\/\//.test(v), 'Lien invalide'),
              glass: z.boolean(),
              // CSS libre réservé à l'équipe ; on bloque tout ce qui pourrait sortir de la balise <style>.
              customCss: z
                .string()
                .max(20_000)
                .refine((v) => !/<\/?\s*(style|script)/i.test(v), 'Balises interdites dans le CSS'),
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
