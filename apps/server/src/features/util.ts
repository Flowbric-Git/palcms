import type { FeatureHost, FeatureRoute } from '@palcms/shared';
import type { ZodType, ZodTypeDef } from 'zod';

/** A CMS feature: its routes and, when needed, a start / stop (background tasks, listeners). */
export interface Feature {
  routes?: FeatureRoute[];
  start?(): void;
  stop?(): void;
}

export type FeatureFactory = (host: FeatureHost, bus: FeatureBus) => Feature;

/** HTTP error sent as is to the browser (the gateway reads "status"). */
export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  const res = schema.safeParse(data ?? {});
  if (res.success) return res.data;
  const flat = res.error.flatten();
  throw httpError(400, (Object.values(flat.fieldErrors).flat() as string[])[0] ?? flat.formErrors[0] ?? 'Invalid data');
}

type ProEvents = {
  'backup:done': { name: string; tag: string };
  'backup:failed': { tag: string; error: string };
  'restart:warning': { minutes: number };
  'restart:done': { updated: boolean };
  'restart:failed': { error: string };
  'update:done': Record<string, never>;
  /** Intended stop (scheduled restart, restore…): not a crash. */
  intentional: Record<string, never>;
  'world:synced': { players: number; guilds: number };
  'world:failed': { error: string };
  /** Monitoring alert (low FPS, memory, disk, API unreachable, crash…). */
  alert: { level: 'info' | 'warning' | 'critical'; kind: string; message: string };
  'event:started': { name: string };
  'event:ended': { name: string };
  'update:available': { current: string; latest: string };
  'flag:new': { name: string; kind: string; details: string };
  'ticket:new': { kind: string; subject: string; username: string };
};

/** Small internal bus between features (e.g. backups → Discord). */
export class FeatureBus {
  private listeners = new Map<string, Set<(d: unknown) => void>>();
  on<E extends keyof ProEvents>(event: E, fn: (d: ProEvents[E]) => void): () => void {
    let s = this.listeners.get(event);
    if (!s) this.listeners.set(event, (s = new Set()));
    s.add(fn as (d: unknown) => void);
    return () => s!.delete(fn as (d: unknown) => void);
  }
  emit<E extends keyof ProEvents>(event: E, data: ProEvents[E]): void {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        fn(data);
      } catch (e) {
        console.error(`[features] ${event}`, e);
      }
    }
  }
}

/** Timer that does not block process exit and survives errors. */
export function every(ms: number, fn: () => unknown): () => void {
  const t = setInterval(() => {
    Promise.resolve()
      .then(fn)
      .catch((e) => console.error('[features] background task:', e));
  }, ms);
  t.unref?.();
  return () => clearInterval(t);
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Adds links to the site menu once (in the first version that offers them),
 * right after "after". The admin is then free to move or remove them.
 */
export function addMenuOnce(host: FeatureHost, key: string, items: { label: string; url: string }[], after: string) {
  if (host.settings.get(key, false)) return;
  const site = host.site.get();
  const menu = [...site.menu];
  let at = menu.findIndex((m) => m.url === after);
  at = at >= 0 ? at + 1 : menu.length;
  for (const item of items) {
    if (menu.some((m) => m.url === item.url)) continue;
    menu.splice(at++, 0, item);
  }
  host.site.save({ ...site, menu: menu.slice(0, 20) });
  host.settings.set(key, true);
}

/** Local VPS date as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
