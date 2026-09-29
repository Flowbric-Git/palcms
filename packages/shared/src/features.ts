/**
 * Interface interne entre le cœur du CMS et ses fonctionnalités (carte, sauvegardes, équipe…).
 * Chaque fonctionnalité reçoit un FeatureHost et déclare ses routes, modules et tâches de fond.
 */
import type { Permission } from './permissions';
import type { Channel, LeaderboardEntry, ServerStatus, WsServerMessage } from './types';

/** Flux binaire (sous-ensemble de stream.Readable de Node), sans dépendre des types Node. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ByteStream { pipe(dest: any): any; on(event: string, fn: (...args: any[]) => void): any }

// Données partagées

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

/** Accès minimal à la base SQLite (sous-ensemble de better-sqlite3). */
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

/** Services du CMS mis à disposition des fonctionnalités. */
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
    /** Arrêt propre : le serveur prévient les joueurs, attend "waittime" secondes puis sauvegarde et s'arrête. */
    shutdown(waittime: number, message: string): Promise<void>;
  };
  palctl(args: string[], opts?: { onLine?: (l: string) => void; timeoutMs?: number }): Promise<string>;
  /** Commande palctl dont la sortie est binaire (ex. téléchargement d'une sauvegarde). */
  palctlStream(args: string[]): ByteStream;
  /** Sortie texte complète d'une commande palctl, sans limite de taille (ex. export JSON du monde). */
  palctlText(args: string[], opts?: { timeoutMs?: number }): Promise<string>;
  server: {
    /** managed : géré par PalCMS (palctl disponible) ; external : serveur existant ; none : aucun serveur. */
    mode(): import('./schemas').ServerMode;
    /** Connexion au serveur externe (null si le serveur est géré par PalCMS ou absent). */
    external(): import('./schemas').ExternalServer | null;
    state(): Promise<string>;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    status(): ServerStatus;
    /** Dernières métriques brutes de l'API REST (null si le serveur ne répond pas). */
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
  log(message: string): void;
}

// Routes des fonctionnalités

export interface FeatureContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  user: HostUser | null;
  can(permission: Permission): boolean;
  /** Récupère une image envoyée (multipart) et renvoie son URL publique. */
  saveUpload(maxBytes: number): Promise<string>;
  /** Lit un fichier envoyé (multipart) sans l'enregistrer, ex. un paquet d'extension. */
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
  /** Chemin relatif à /api/features, avec paramètres ":nom". */
  path: string;
  /** public : tout le monde ; user : connecté ; staff : équipe (avec permission éventuelle). */
  access: 'public' | 'user' | 'staff';
  permission?: Permission;
  handler(ctx: FeatureContext): Promise<unknown> | unknown;
}

export interface FeatureSet {
  version: string;
  modules: HostModuleDef[];
  migrations: HostMigration[];
  routes: FeatureRoute[];
  /** Répartition des permissions entre les membres de l'équipe (rôles). */
  hasPermission(user: HostUser, permission: Permission): boolean;
  start(): void;
  stop(): void;
}

export type CreateFeatures = (host: FeatureHost) => FeatureSet;

