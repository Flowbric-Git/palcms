/**
 * Internal interface between the CMS core and its features (map, backups, team…).
 * Each feature receives a FeatureHost and declares its routes, modules and background tasks.
 */
import type { Permission } from './permissions';
import type { Lang, Vars } from './i18n';
import type { Channel, LeaderboardEntry, ServerStatus, WsServerMessage } from './types';

/** Binary stream (subset of Node's stream.Readable), without depending on Node types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ByteStream { pipe(dest: any): any; on(event: string, fn: (...args: any[]) => void): any }

// Shared data

export interface HostPlayer {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
  level: number;
  building_count: number;
}

export interface HostMetrics {
  serverfps: number;
  currentplayernum: number;
  serverframetime: number;
  maxplayernum: number;
  uptime: number;
  days?: number;
  basecampnum?: number;
}

export interface HostUser {
  id: number;
  username: string;
  display_name: string;
  role: 'superadmin' | 'admin' | 'player';
  status: string;
}

export interface HostEvents {
  audit: { userId: number | null; username: string | null; action: string; target?: string; details?: unknown };
  tick: { players: HostPlayer[]; status: ServerStatus };
  'server:online': Record<string, never>;
  'server:offline': Record<string, never>;
  'server:action': { action: 'start' | 'stop' | 'restart'; by: string | null };
  'player:join': { uid: string; name: string };
  'player:leave': { uid: string; name: string };
  'news:published': { title: string; slug: string };
  'member:pending': { username: string; inGameName: string | null };
}

export type HostEventName = keyof HostEvents;

/** Minimal access to the SQLite database (subset of better-sqlite3). */
export interface HostStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}
export interface HostDatabase {
  prepare(sql: string): HostStatement;
  exec(sql: string): void;
  transaction<F extends (...args: never[]) => unknown>(fn: F): F;
}

export interface HostMigration {
  id: string;
  sql: string;
}

export interface HostModuleDef {
  id: string;
  name: string;
  description: string;
  area: 'public' | 'server' | 'site';
  toggleable: boolean;
  defaultEnabled: boolean;
}

/** CMS services available to features. */
export interface FeatureHost {
  version: string;
  basePath: string;
  publicUrl: string;
  db: HostDatabase;
  settings: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
  runMigrations(list: HostMigration[]): void;
  events: {
    on<E extends HostEventName>(event: E, fn: (data: HostEvents[E]) => void): () => void;
    emit<E extends HostEventName>(event: E, data: HostEvents[E]): void;
  };
  realtime: {
    broadcast(channel: Channel, msg: WsServerMessage): void;
    setSnapshot(channel: Channel, key: string, fn: (() => WsServerMessage[]) | null): void;
  };
  palworld: {
    announce(message: string): Promise<void>;
    kick(userid: string, message: string): Promise<void>;
    ban(userid: string, message: string): Promise<void>;
    unban(userid: string): Promise<void>;
    save(): Promise<void>;
    /** Clean shutdown: the server warns players, waits "waittime" seconds, then saves and stops. */
    shutdown(waittime: number, message: string): Promise<void>;
  };
  palctl(args: string[], opts?: { onLine?: (l: string) => void; timeoutMs?: number }): Promise<string>;
  /** palctl command with binary output (e.g. downloading a backup). */
  palctlStream(args: string[]): ByteStream;
  /** Full text output of a palctl command, without size limit (e.g. world JSON export). */
  palctlText(args: string[], opts?: { timeoutMs?: number }): Promise<string>;
  server: {
    /** managed: run by PalCMS (palctl available); external: existing server; none: no server. */
    mode(): import('./schemas').ServerMode;
    /** Connection to the external server (null when the server is run by PalCMS or absent). */
    external(): import('./schemas').ExternalServer | null;
    state(): Promise<string>;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    status(): ServerStatus;
    /** Latest raw REST API metrics (null when the server does not answer). */
    metrics(): HostMetrics | null;
    onlinePlayers(): HostPlayer[];
    leaderboardRows(): { public_id: string; name: string; level: number; online: number; playtime_seconds: number }[];
    publicPlayerId(uid: string): string;
    readConfig(): Promise<Record<string, string | number | boolean>>;
    updateConfig(values: Record<string, string | number | boolean>, restart: boolean): Promise<{ restarted: boolean }>;
  };
  site: {
    get(): import('./schemas').SiteSettings;
    save(value: import('./schemas').SiteSettings): void;
  };
  modules: {
    isEnabled(id: string): boolean;
  };
  /** Language of the site. */
  lang(): Lang;
  /** Translates an English text into the site language (Discord, in-game messages…). */
  t(text: string, vars?: Vars): string;
  /** Translates a message that was already filled in (e.g. a stored English alert) into the site language. */
  tMessage(message: string): string;
  log(message: string): void;
}

// Feature routes

export interface FeatureContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  user: HostUser | null;
  can(permission: Permission): boolean;
  /** Stores an uploaded image (multipart) and returns its public URL. */
  saveUpload(maxBytes: number): Promise<string>;
  /** Reads an uploaded file (multipart) without storing it, e.g. an extension package. */
  readUpload(maxBytes: number): Promise<{ filename: string; data: Uint8Array }>;
}

export interface FeatureFile {
  kind: 'file';
  stream: ByteStream;
  filename: string;
  contentType: string;
}

export interface FeatureRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path relative to /api/features, with ":name" parameters. */
  path: string;
  /** public: everyone; user: signed in; staff: team (with an optional permission). */
  access: 'public' | 'user' | 'staff';
  permission?: Permission;
  handler(ctx: FeatureContext): Promise<unknown> | unknown;
}

export interface FeatureSet {
  version: string;
  modules: HostModuleDef[];
  migrations: HostMigration[];
  routes: FeatureRoute[];
  /** How permissions are shared between team members (roles). */
  hasPermission(user: HostUser, permission: Permission): boolean;
  start(): void;
  stop(): void;
}

export type CreateFeatures = (host: FeatureHost) => FeatureSet;

