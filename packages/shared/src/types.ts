import type { ExternalServer, ServerMode, SiteSettings } from './schemas';
import type { Permission } from './permissions';

export type Role = 'superadmin' | 'admin' | 'player';
export type MemberStatus = 'active' | 'pending' | 'rejected' | 'banned';

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: MemberStatus;
  avatarUrl: string | null;
  steam: boolean;
  /** Identifiant public du personnage lié (jamais le Steam ID). */
  playerPublicId: string | null;
  /** Permissions du panel admin (vide pour un joueur). */
  permissions: Permission[];
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  area: 'public' | 'server' | 'site';
  toggleable: boolean;
  enabled: boolean;
}

export interface Bootstrap {
  setupDone: boolean;
  version: string;
  /** managed : installé et géré par PalCMS ; external : serveur existant connecté ; none : site seul. */
  serverMode: ServerMode;
  site: SiteSettings;
  modules: Record<string, boolean>;
  user: PublicUser | null;
}

export interface ServerStatus {
  online: boolean;
  name: string;
  version: string | null;
  players: number;
  maxPlayers: number;
  fps: number | null;
  days: number | null;
  uptime: number | null;
  address: string;
  updatedAt: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  level: number;
  online: boolean;
}

export interface LeaderboardEntry extends PublicPlayer {
  rank: number;
  playtimeSeconds: number;
}

export interface PlayerProfile extends PublicPlayer {
  playtimeSeconds: number;
  firstSeen: number;
  lastSeen: number;
  rank: number | null;
  member: { username: string; displayName: string } | null;
}

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface TaskState {
  id: string;
  label: string;
  status: TaskStatus;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export type SetupStep = 'token' | 'mode' | 'server' | 'external' | 'install' | 'admin' | 'site' | 'finish';

export interface SetupState {
  done: boolean;
  authorized: boolean;
  step: SetupStep;
  mode: ServerMode | null;
  installing: boolean;
  tasks: TaskState[];
  serverForm: Record<string, unknown> | null;
  externalForm: ExternalServer | null;
}

export type Channel = 'public' | 'setup' | 'logs' | 'admin';

export type WsServerMessage =
  | { type: 'status'; data: ServerStatus }
  | { type: 'players'; data: PublicPlayer[] }
  | { type: 'leaderboard'; data: LeaderboardEntry[] }
  | { type: 'task'; data: TaskState }
  | { type: 'task-log'; data: { id: string; line: string } }
  | { type: 'log'; data: string }
  | { type: 'error'; data: string }
  | { type: 'feature'; event: string; data: unknown };

export type WsClientMessage = { type: 'sub' | 'unsub'; channel: Channel };

export interface NewsSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  coverUrl: string | null;
  publishedAt: number | null;
  author: string | null;
}

export interface NewsItem extends NewsSummary {
  contentHtml: string;
  published: boolean;
}

export interface PageItem {
  id: number;
  slug: string;
  title: string;
  contentHtml: string;
  published: boolean;
  updatedAt: number;
}

