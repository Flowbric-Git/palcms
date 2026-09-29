import type { TaskState, TaskStatus } from '@palcms/shared';

export interface TaskContext {
  log(line: string): void;
}

export interface TaskDef {
  id: string;
  label: string;
  run(ctx: TaskContext): Promise<void>;
}

export interface StoredTask {
  id: string;
  status: TaskStatus;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

/** Persistance de l'état des tâches (SQLite en production, mémoire dans les tests). */
export interface TaskStore {
  get(id: string): StoredTask | undefined;
  save(task: StoredTask): void;
  appendLog(id: string, line: string): void;
  getLog(id: string): string;
  resetLog(id: string): void;
}

export type TaskEvent = { type: 'task'; data: TaskState } | { type: 'task-log'; data: { id: string; line: string } };

/**
 * Exécute des étapes d'installation les unes après les autres.
 * - une étape réussie n'est jamais rejouée (reprise après crash ou après une erreur) ;
 * - la première erreur arrête la suite, "Réessayer" relance à partir de l'étape en échec ;
 * - une étape restée "running" (crash du CMS) est marquée en échec au redémarrage.
 */
export class TaskRunner {
  private busy = false;

  constructor(
    private store: TaskStore,
    private defs: TaskDef[],
    private emit: (ev: TaskEvent) => void = () => {},
  ) {}

  get running(): boolean {
    return this.busy;
  }

  state(): TaskState[] {
    return this.defs.map((d) => this.toState(d));
  }

  allDone(): boolean {
    return this.defs.every((d) => this.store.get(d.id)?.status === 'done');
  }

  /** À appeler au démarrage du CMS. */
  recover(): void {
    for (const d of this.defs) {
      const t = this.store.get(d.id);
      if (t?.status === 'running') {
        this.store.save({ ...t, status: 'failed', error: 'Interrompu (redémarrage du CMS)', finishedAt: Date.now() });
      }
    }
  }

  /** Lance toutes les étapes restantes. Renvoie true si tout est terminé avec succès. */
  async runAll(): Promise<boolean> {
    if (this.busy) throw new Error('Une installation est déjà en cours');
    this.busy = true;
    try {
      for (const def of this.defs) {
        const existing = this.store.get(def.id);
        if (existing?.status === 'done') continue;

        const task: StoredTask = { id: def.id, status: 'running', error: null, startedAt: Date.now(), finishedAt: null };
        this.store.resetLog(def.id);
        this.store.save(task);
        this.emit({ type: 'task', data: this.toState(def) });

        const ctx: TaskContext = {
          log: (line) => {
            this.store.appendLog(def.id, line);
            this.emit({ type: 'task-log', data: { id: def.id, line } });
          },
        };

        try {
          await def.run(ctx);
          this.store.save({ ...task, status: 'done', finishedAt: Date.now() });
          this.emit({ type: 'task', data: this.toState(def) });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          ctx.log(`✖ ${message}`);
          this.store.save({ ...task, status: 'failed', error: message, finishedAt: Date.now() });
          this.emit({ type: 'task', data: this.toState(def) });
          return false;
        }
      }
      return true;
    } finally {
      this.busy = false;
    }
  }

  private toState(def: TaskDef): TaskState {
    const t = this.store.get(def.id);
    return {
      id: def.id,
      label: def.label,
      status: t?.status ?? 'pending',
      error: t?.error ?? null,
      startedAt: t?.startedAt ?? null,
      finishedAt: t?.finishedAt ?? null,
    };
  }
}

export class MemoryTaskStore implements TaskStore {
  tasks = new Map<string, StoredTask>();
  logs = new Map<string, string>();
  get(id: string) {
    return this.tasks.get(id);
  }
  save(task: StoredTask) {
    this.tasks.set(task.id, { ...task });
  }
  appendLog(id: string, line: string) {
    this.logs.set(id, (this.logs.get(id) ?? '') + line + '\n');
  }
  getLog(id: string) {
    return this.logs.get(id) ?? '';
  }
  resetLog(id: string) {
    this.logs.set(id, '');
  }
}
