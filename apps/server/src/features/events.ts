import { z } from 'zod';
import { INI_FIELDS, INI_LOCKED_KEYS, type IniGroup } from '@palcms/shared';
import type { FeatureHost, HostUser } from '@palcms/shared';
import { addMenuOnce, errorText, every, httpError, parseBody, type Feature, type FeatureBus } from './util';

type Values = Record<string, string | number | boolean>;

/** Réglages qu'un préréglage ou un événement peut changer : le jeu, jamais les mots de passe ni les ports. */
const GAME_GROUPS: IniGroup[] = ['Gameplay', 'Taux', 'Joueurs', 'Pals', 'Constructions', 'Guildes'];
export const isGameKey = (key: string) => GAME_GROUPS.includes(INI_FIELDS[key]?.group as IniGroup);
const SECRET_KEYS = Object.entries(INI_FIELDS)
  .filter(([, m]) => m.secret)
  .map(([k]) => k);

export const BUILTIN_PRESETS: { id: string; name: string; description: string; values: Values }[] = [
  {
    id: 'casual',
    name: 'Détente',
    description: 'Pour jouer tranquille : plus d’XP, captures faciles, aucune perte à la mort.',
    values: { Difficulty: 'Casual', ExpRate: 1.5, PalCaptureRate: 1.5, CollectionDropRate: 1.5, EnemyDropItemRate: 1.5, DeathPenalty: 'None', PalEggDefaultHatchingTime: 1 },
  },
  {
    id: 'normal',
    name: 'Normal',
    description: 'Les réglages par défaut du jeu.',
    values: { Difficulty: 'None', ExpRate: 1, PalCaptureRate: 1, CollectionDropRate: 1, EnemyDropItemRate: 1, DeathPenalty: 'All', PalEggDefaultHatchingTime: 72 },
  },
  {
    id: 'hard',
    name: 'Difficile',
    description: 'Ennemis plus forts, ressources plus rares, on perd tout à la mort.',
    values: { Difficulty: 'Hard', ExpRate: 0.8, PalCaptureRate: 0.8, CollectionDropRate: 0.8, EnemyDropItemRate: 0.8, DeathPenalty: 'All', PlayerDamageRateDefense: 1.5 },
  },
  {
    id: 'x2',
    name: 'Taux x2',
    description: 'Expérience, captures, récolte et butin doublés.',
    values: { ExpRate: 2, PalCaptureRate: 2, CollectionDropRate: 2, EnemyDropItemRate: 2 },
  },
  {
    id: 'x3',
    name: 'Taux x3',
    description: 'Expérience, captures, récolte et butin triplés.',
    values: { ExpRate: 3, PalCaptureRate: 2, CollectionDropRate: 3, EnemyDropItemRate: 3 },
  },
];

/** "ExpRate: 3" -> "Taux d'expérience : x3" (affiché sur le calendrier public). */
export function describeValues(values: Values): string[] {
  return Object.entries(values).map(([k, v]) => {
    const label = INI_FIELDS[k]?.label ?? k;
    if (typeof v === 'boolean') return `${label} : ${v ? 'activé' : 'désactivé'}`;
    if (typeof v === 'number' && /Rate/.test(k)) return `${label} : x${v}`;
    return `${label} : ${v}`;
  });
}

const valuesSchema = z.record(z.union([z.string().max(200), z.number().finite(), z.boolean()]));

/** Ne garde que les réglages de jeu connus du fichier actuel. */
export function filterGameValues(values: Values, known: Set<string>): Values {
  return Object.fromEntries(Object.entries(values).filter(([k]) => isGameKey(k) && known.has(k)));
}

/** Deux événements qui se chevauchent dans le temps ne doivent pas modifier les mêmes réglages. */
export function conflicts(a: { startsAt: number; endsAt: number; values: Values }, b: { startsAt: number; endsAt: number; values: Values }): string[] {
  if (a.startsAt >= b.endsAt || b.startsAt >= a.endsAt) return [];
  return Object.keys(a.values).filter((k) => k in b.values);
}

interface EventRow {
  id: number;
  name: string;
  description: string;
  starts_at: number;
  ends_at: number;
  vals: string;
  restart: number;
  is_public: number;
  status: 'scheduled' | 'active' | 'done' | 'cancelled' | 'failed';
  saved_vals: string | null;
  error: string | null;
  created_by: string | null;
}

const audit = (host: FeatureHost, user: HostUser | null, action: string, target?: string) =>
  host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target });

const eventSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    values: valuesSchema,
    restart: z.boolean().default(true),
    isPublic: z.boolean().default(true),
  })
  .refine((e) => e.endsAt > e.startsAt, { message: 'La fin doit être après le début', path: ['endsAt'] })
  .refine((e) => e.endsAt - e.startsAt <= 31 * 86_400_000, { message: 'Un événement dure au plus 31 jours', path: ['endsAt'] });

export function createEvents(host: FeatureHost, bus: FeatureBus): Feature {
  const { db } = host;
  let stopTimer: (() => void) | null = null;
  let busy = false;
  const warned = new Map<number, Set<number>>();

  const managed = () => {
    if (host.server.mode() !== 'managed') throw httpError(409, 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS');
  };
  const knownKeys = async () => new Set(Object.keys(await host.server.readConfig()));

  const toApi = (e: EventRow) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    values: JSON.parse(e.vals) as Values,
    changes: describeValues(JSON.parse(e.vals) as Values),
    restart: e.restart === 1,
    isPublic: e.is_public === 1,
    status: e.status,
    error: e.error,
    createdBy: e.created_by,
  });

  const apply = async (values: Values, restart: boolean) => {
    if (restart) bus.emit('intentional', {});
    await host.server.updateConfig(values, restart);
  };

  const startEvent = async (e: EventRow) => {
    const values = JSON.parse(e.vals) as Values;
    try {
      const current = await host.server.readConfig();
      const saved = Object.fromEntries(Object.keys(values).filter((k) => k in current).map((k) => [k, current[k]]));
      db.prepare("UPDATE pro_events SET status = 'active', saved_vals = ?, error = NULL WHERE id = ?").run(JSON.stringify(saved), e.id);
      await host.palworld.announce(`L'événement « ${e.name} » commence !`).catch(() => {});
      await apply(values, e.restart === 1);
      bus.emit('event:started', { name: e.name });
    } catch (err) {
      db.prepare("UPDATE pro_events SET status = 'failed', error = ? WHERE id = ?").run(errorText(err), e.id);
    }
  };

  const endEvent = async (e: EventRow, status: 'done' | 'cancelled' = 'done') => {
    try {
      const saved = e.saved_vals ? (JSON.parse(e.saved_vals) as Values) : {};
      if (Object.keys(saved).length) {
        await host.palworld.announce(`L'événement « ${e.name} » est terminé, merci d'avoir participé !`).catch(() => {});
        await apply(saved, e.restart === 1);
      }
      db.prepare('UPDATE pro_events SET status = ?, error = NULL WHERE id = ?').run(status, e.id);
      bus.emit('event:ended', { name: e.name });
    } catch (err) {
      // On garde l'état "active" : la remise des anciens réglages sera retentée au prochain passage.
      db.prepare('UPDATE pro_events SET error = ? WHERE id = ?').run(`Retour aux anciens réglages impossible : ${errorText(err)}`, e.id);
    }
  };

  const tick = async () => {
    if (busy || host.server.mode() !== 'managed') return;
    busy = true;
    try {
      const now = Date.now();
      for (const e of db.prepare("SELECT * FROM pro_events WHERE status = 'active' AND ends_at <= ?").all(now) as EventRow[]) await endEvent(e);
      for (const e of db.prepare("SELECT * FROM pro_events WHERE status = 'scheduled' AND starts_at <= ?").all(now) as EventRow[]) {
        // Un événement dont la fin est déjà passée (serveur éteint pendant tout l'événement) est ignoré.
        if (e.ends_at <= now) db.prepare("UPDATE pro_events SET status = 'cancelled', error = 'Période passée pendant que PalCMS était arrêté' WHERE id = ?").run(e.id);
        else await startEvent(e);
      }
      // Rappels en jeu 15 et 5 minutes avant le début
      for (const e of db.prepare("SELECT * FROM pro_events WHERE status = 'scheduled' AND starts_at <= ?").all(now + 15 * 60_000 + 30_000) as EventRow[]) {
        const sent = warned.get(e.id) ?? new Set<number>();
        warned.set(e.id, sent);
        const left = e.starts_at - now;
        for (const m of [15, 5]) {
          if (!sent.has(m) && left <= m * 60_000 + 30_000 && left > (m - 1) * 60_000) {
            sent.add(m);
            await host.palworld.announce(`L'événement « ${e.name} » commence dans ${m} minutes${e.restart ? ' (redémarrage du serveur)' : ''}.`).catch(() => {});
          }
        }
      }
    } finally {
      busy = false;
    }
  };

  const presets = () => [
    ...BUILTIN_PRESETS.map((p) => ({ ...p, builtin: true, changes: describeValues(p.values) })),
    ...(db.prepare('SELECT id, name, description, vals FROM pro_presets ORDER BY name').all() as { id: number; name: string; description: string; vals: string }[]).map(
      (p) => ({ id: String(p.id), name: p.name, description: p.description, values: JSON.parse(p.vals) as Values, builtin: false, changes: describeValues(JSON.parse(p.vals) as Values) }),
    ),
  ];

  return {
    start() {
      addMenuOnce(host, 'feature.events.menuAdded', [{ label: 'Événements', url: '/evenements' }], '/actualites');
      stopTimer = every(30_000, tick);
    },
    stop() {
      stopTimer?.();
    },
    routes: [
      // Préréglages
      { method: 'GET', path: 'presets', access: 'staff', permission: 'server.events', handler: () => presets() },
      {
        method: 'POST',
        path: 'presets',
        access: 'staff',
        permission: 'server.events',
        handler: async ({ body, user }) => {
          managed();
          const p = parseBody(z.object({ name: z.string().trim().min(1).max(60), description: z.string().trim().max(300).default(''), values: valuesSchema }), body);
          const values = filterGameValues(p.values, await knownKeys());
          if (!Object.keys(values).length) throw httpError(400, 'Aucun réglage de jeu dans ce préréglage');
          const r = db.prepare('INSERT INTO pro_presets (name, description, vals, created_at) VALUES (?, ?, ?, ?)').run(p.name, p.description, JSON.stringify(values), Date.now());
          audit(host, user, 'preset.create', p.name);
          return { id: String(r.lastInsertRowid) };
        },
      },
      {
        method: 'DELETE',
        path: 'presets/:id',
        access: 'staff',
        permission: 'server.events',
        handler: ({ params, user }) => {
          db.prepare('DELETE FROM pro_presets WHERE id = ?').run(Number(params.id));
          audit(host, user, 'preset.delete', params.id);
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'presets/:id/apply',
        access: 'staff',
        permission: 'server.config',
        handler: async ({ params, body, user }) => {
          managed();
          const { restart } = parseBody(z.object({ restart: z.boolean().default(false) }), body);
          const preset = presets().find((p) => p.id === params.id);
          if (!preset) throw httpError(404, 'Préréglage introuvable');
          const values = filterGameValues(preset.values, await knownKeys());
          await apply(values, restart);
          audit(host, user, 'preset.apply', preset.name);
          return { ok: true, restarted: restart };
        },
      },
      // Import / export de la configuration (sans les mots de passe)
      {
        method: 'GET',
        path: 'config/export',
        access: 'staff',
        permission: 'server.config',
        handler: async () => {
          managed();
          const all = await host.server.readConfig();
          const values = Object.fromEntries(Object.entries(all).filter(([k]) => !SECRET_KEYS.includes(k) && !INI_LOCKED_KEYS.includes(k)));
          return { format: 'palcms-config', version: host.version, exportedAt: Date.now(), values };
        },
      },
      {
        method: 'POST',
        path: 'config/import',
        access: 'staff',
        permission: 'server.config',
        handler: async ({ body, user }) => {
          managed();
          const b = parseBody(z.object({ values: valuesSchema, restart: z.boolean().default(false) }), body);
          const known = await knownKeys();
          const values = Object.fromEntries(Object.entries(b.values).filter(([k]) => known.has(k) && !SECRET_KEYS.includes(k) && !INI_LOCKED_KEYS.includes(k)));
          if (!Object.keys(values).length) throw httpError(400, 'Aucun réglage reconnu dans ce fichier');
          if (b.restart) bus.emit('intentional', {});
          const { restarted } = await host.server.updateConfig(values, b.restart);
          audit(host, user, 'config.import', `${Object.keys(values).length} réglages`);
          return { ok: true, applied: Object.keys(values).length, ignored: Object.keys(b.values).length - Object.keys(values).length, restarted };
        },
      },
      // Événements
      {
        method: 'GET',
        path: 'events',
        access: 'staff',
        permission: 'server.events',
        handler: () => (db.prepare('SELECT * FROM pro_events ORDER BY starts_at DESC LIMIT 200').all() as EventRow[]).map(toApi),
      },
      {
        method: 'POST',
        path: 'events',
        access: 'staff',
        permission: 'server.events',
        handler: async ({ body, user }) => {
          managed();
          const e = parseBody(eventSchema, body);
          if (e.endsAt <= Date.now()) throw httpError(400, 'Cet événement est déjà terminé');
          const values = filterGameValues(e.values, await knownKeys());
          if (!Object.keys(values).length) throw httpError(400, 'Choisis au moins un réglage de jeu à modifier');
          for (const other of (db.prepare("SELECT * FROM pro_events WHERE status IN ('scheduled', 'active')").all() as EventRow[]).map(toApi)) {
            const keys = conflicts({ ...e, values }, other);
            if (keys.length) throw httpError(409, `Chevauche « ${other.name} » sur : ${keys.map((k) => INI_FIELDS[k]?.label ?? k).join(', ')}`);
          }
          const r = db
            .prepare('INSERT INTO pro_events (name, description, starts_at, ends_at, vals, restart, is_public, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(e.name, e.description, e.startsAt, e.endsAt, JSON.stringify(values), e.restart ? 1 : 0, e.isPublic ? 1 : 0, user!.username, Date.now());
          audit(host, user, 'event.create', e.name);
          void tick();
          return { id: Number(r.lastInsertRowid) };
        },
      },
      {
        method: 'DELETE',
        path: 'events/:id',
        access: 'staff',
        permission: 'server.events',
        handler: async ({ params, user }) => {
          const e = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(Number(params.id)) as EventRow | undefined;
          if (!e) throw httpError(404, 'Événement introuvable');
          if (e.status === 'active') await endEvent(e, 'cancelled');
          else if (e.status === 'scheduled') db.prepare("UPDATE pro_events SET status = 'cancelled' WHERE id = ?").run(e.id);
          else db.prepare('DELETE FROM pro_events WHERE id = ?').run(e.id);
          audit(host, user, 'event.cancel', e.name);
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'events/:id/start-now',
        access: 'staff',
        permission: 'server.events',
        handler: async ({ params, user }) => {
          managed();
          const e = db.prepare("SELECT * FROM pro_events WHERE id = ? AND status = 'scheduled'").get(Number(params.id)) as EventRow | undefined;
          if (!e) throw httpError(404, 'Événement introuvable ou déjà commencé');
          db.prepare('UPDATE pro_events SET starts_at = ? WHERE id = ?').run(Date.now(), e.id);
          audit(host, user, 'event.start', e.name);
          await tick();
          return { ok: true };
        },
      },
      // Calendrier public
      {
        method: 'GET',
        path: 'calendar',
        access: 'public',
        handler: (ctx) => {
          if (!host.modules.isEnabled('calendar') && !ctx.can('server.events')) throw httpError(404, 'Page désactivée');
          const rows = db
            .prepare("SELECT * FROM pro_events WHERE is_public = 1 AND status IN ('scheduled', 'active') AND ends_at > ? ORDER BY starts_at LIMIT 50")
            .all(Date.now()) as EventRow[];
          const past = db
            .prepare("SELECT * FROM pro_events WHERE is_public = 1 AND status = 'done' ORDER BY ends_at DESC LIMIT 5")
            .all() as EventRow[];
          const pub = (e: EventRow) => ({ id: e.id, name: e.name, description: e.description, startsAt: e.starts_at, endsAt: e.ends_at, status: e.status, changes: describeValues(JSON.parse(e.vals) as Values) });
          return { upcoming: rows.map(pub), past: past.map(pub) };
        },
      },
    ],
  };
}
