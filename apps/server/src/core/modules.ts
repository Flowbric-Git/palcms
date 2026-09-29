import type { ModuleInfo } from '@palcms/shared';
import { db } from '../db';
import { MODULES as FEATURE_MODULES } from '../features/schema';

/**
 * Une fonctionnalité affichée dans "Gestion du site > Modules".
 * Les modules "toggleable" peuvent être activés ou désactivés par l'admin.
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
    name: 'Statut en direct',
    description: "Statut du serveur, joueurs en ligne et IP à copier sur l'accueil.",
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'leaderboard',
    name: 'Classement',
    description: 'Classement des joueurs en temps réel (par niveau).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'news',
    name: 'Actualités',
    description: 'Articles publiés sur le site.',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'registration',
    name: 'Inscription des joueurs',
    description: 'Comptes joueurs (Steam validé automatiquement, email validé par un admin).',
    area: 'public',
    toggleable: true,
    defaultEnabled: true,
  },
  {
    id: 'pages',
    name: 'Pages',
    description: 'Pages libres (règles, rejoindre…).',
    area: 'site',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'server-control',
    name: 'Contrôle du serveur',
    description: 'Démarrer, arrêter, redémarrer le serveur Palworld.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'server-config',
    name: 'Configuration du serveur',
    description: 'Éditeur de PalWorldSettings.ini.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'players',
    name: 'Joueurs',
    description: 'Joueurs connectés et historique.',
    area: 'server',
    toggleable: false,
    defaultEnabled: true,
  },
  {
    id: 'logs',
    name: 'Logs',
    description: 'Logs du serveur en direct.',
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

  /** Enregistre l'état par défaut de chaque module (sans écraser un choix existant). */
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
    if (!def || !def.toggleable) throw new Error('Module inconnu ou non désactivable');
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
