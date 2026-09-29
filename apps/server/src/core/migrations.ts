import type { Migration } from '../db';
import { MIGRATIONS as FEATURE_MIGRATIONS } from '../features/schema';

const BASE_MIGRATIONS: Migration[] = [
  {
    id: 'core:001-initial',
    sql: `
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'player',
        status TEXT NOT NULL DEFAULT 'pending',
        steam_id TEXT UNIQUE,
        player_uid TEXT,
        in_game_name TEXT,
        avatar_url TEXT,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE setup_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        error TEXT,
        log TEXT NOT NULL DEFAULT '',
        started_at INTEGER,
        finished_at INTEGER
      );

      CREATE TABLE modules (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);

      CREATE TABLE pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        excerpt TEXT NOT NULL DEFAULT '',
        content_html TEXT NOT NULL DEFAULT '',
        cover_url TEXT,
        published INTEGER NOT NULL DEFAULT 0,
        published_at INTEGER,
        author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE players (
        uid TEXT PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        player_id TEXT,
        name TEXT NOT NULL,
        account_name TEXT,
        level INTEGER NOT NULL DEFAULT 0,
        building_count INTEGER NOT NULL DEFAULT 0,
        online INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        playtime_seconds INTEGER NOT NULL DEFAULT 0,
        last_x REAL,
        last_y REAL
      );

      CREATE TABLE player_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL REFERENCES players(uid) ON DELETE CASCADE,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
      CREATE INDEX idx_player_sessions_uid ON player_sessions(uid);

      CREATE TABLE metrics (
        ts INTEGER PRIMARY KEY,
        fps REAL,
        players INTEGER,
        frame_time REAL,
        days INTEGER
      );
    `,
  },
];

/** Toutes les migrations, dans l'ordre : tables du cœur puis des fonctionnalités. */
export const CORE_MIGRATIONS: Migration[] = [...BASE_MIGRATIONS, ...FEATURE_MIGRATIONS];
