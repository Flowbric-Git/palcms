import type { ModuleInfo } from '@palcms/shared';
import { db } from '../db';
import { MODULES as FEATURE_MODULES } from '../features/schema';

/**
 * A feature listed in "Website > Modules" (name and description are translated on display).
 * "toggleable" modules can be turned on or off by the admin.
 */
export interface ModuleDef {
  id: string;
  name: string;
  description: string;
  area: 'public' | 'server' | 'site';
  toggleable: boolean;
  defaultEnabled: boolean;
}

export const CORE_MODULES: ModuleDef[] = [
  {
    id: 'status',
    name: 'Live status',
    description: 'Server status, online players and address to copy on the home page.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    description: 'Live player leaderboard (by level).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'news',
    name: 'News',
    description: 'Articles published on the site.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'registration',
    name: 'Player registration',
    description: 'Player accounts (Steam approved automatically, email approved by an admin).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'pages',
    name: 'Pages',
    description: 'Free pages (rules, how to join…).',
    area: 'site',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'server-control',
    name: 'Server control',
    description: 'Start, stop and restart the Palworld server.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'server-config',
    name: 'Server configuration',
    description: 'PalWorldSettings.ini editor.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'players',
    name: 'Players',
    description: 'Online players and history.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'logs',
    name: 'Logs',
    description: 'Live server logs.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
];

class ModuleRegistry {
  private defs = new Map<string, ModuleDef>();

  register(def: ModuleDef): void {
    this.defs.set(def.id, def);
  }

  get(id: string): ModuleDef | undefined {
    return this.defs.get(id);
  }

  /** Stores the default state of each module (without overwriting an existing choice). */
  installAll(): void {
    const insert = db.prepare('INSERT OR IGNORE INTO modules (id, enabled) VALUES (?, ?)');
    for (const def of this.defs.values()) insert.run(def.id, def.defaultEnabled ? 1 : 0);
  }

  isEnabled(id: string): boolean {
    const def = this.defs.get(id);
    if (!def) return false;
    if (!def.toggleable) return true;
    const row = db.prepare<[string], { enabled: number }>('SELECT enabled FROM modules WHERE id = ?').get(id);
    return row ? row.enabled === 1 : def.defaultEnabled;
  }

  setEnabled(id: string, enabled: boolean): void {
    const def = this.defs.get(id);
    if (!def || !def.toggleable) throw new Error('Unknown module or module that cannot be turned off');
    db.prepare('INSERT INTO modules (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled').run(
      id,
      enabled ? 1 : 0,
    );
  }

  list(): ModuleInfo[] {
    return [...this.defs.values()].map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      area: d.area,
      toggleable: d.toggleable,
      enabled: this.isEnabled(d.id),
    }));
  }

  enabledMap(): Record<string, boolean> {
    return Object.fromEntries(this.list().map((m) => [m.id, m.enabled]));
  }
}

export const modules = new ModuleRegistry();
for (const def of [...CORE_MODULES, ...FEATURE_MODULES]) modules.register(def);
