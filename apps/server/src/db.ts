import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'palcms.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`);

export interface Migration {
  id: string;
  sql: string;
}

/** Applique les migrations pas encore passées, chacune dans sa transaction. */
export function runMigrations(list: Migration[]): string[] {
  const has = db.prepare('SELECT 1 FROM migrations WHERE id = ?');
  const mark = db.prepare('INSERT INTO migrations (id, applied_at) VALUES (?, ?)');
  const applied: string[] = [];
  for (const m of list) {
    if (has.get(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      mark.run(m.id, Date.now());
    })();
    applied.push(m.id);
  }
  return applied;
}

const getSetting = () => db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?');
const setSetting = () =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

/** Petit magasin clé/valeur JSON (table settings). */
export const settings = {
  get<T>(key: string, fallback: T): T {
    const row = getSetting().get(key);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    setSetting().run(key, JSON.stringify(value));
  },
  delete(key: string): void {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  },
};
