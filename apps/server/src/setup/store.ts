import { db } from '../db';
import type { StoredTask, TaskStore } from './taskRunner';

const MAX_LOG = 200_000;

interface Row {
  id: string;
  status: StoredTask['status'];
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
}

/** Persistance SQLite des étapes d'installation (table setup_tasks). */
export class DbTaskStore implements TaskStore {
  get(id: string): StoredTask | undefined {
    const r = db.prepare<[string], Row>('SELECT id, status, error, started_at, finished_at FROM setup_tasks WHERE id = ?').get(id);
    return r ? { id: r.id, status: r.status, error: r.error, startedAt: r.started_at, finishedAt: r.finished_at } : undefined;
  }

  save(t: StoredTask): void {
    db.prepare(
      `INSERT INTO setup_tasks (id, status, error, started_at, finished_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, error = excluded.error,
         started_at = excluded.started_at, finished_at = excluded.finished_at`,
    ).run(t.id, t.status, t.error, t.startedAt, t.finishedAt);
  }

  appendLog(id: string, line: string): void {
    db.prepare(`UPDATE setup_tasks SET log = substr(log || ? || char(10), -${MAX_LOG}) WHERE id = ?`).run(line, id);
  }

  getLog(id: string): string {
    return db.prepare<[string], { log: string }>('SELECT log FROM setup_tasks WHERE id = ?').get(id)?.log ?? '';
  }

  resetLog(id: string): void {
    db.prepare('UPDATE setup_tasks SET log = ? WHERE id = ?').run('', id);
  }

  /** Remet des étapes "à faire" (ex. après modification du formulaire du serveur). */
  reset(ids: string[]): void {
    const stmt = db.prepare('DELETE FROM setup_tasks WHERE id = ?');
    for (const id of ids) stmt.run(id);
  }
}
