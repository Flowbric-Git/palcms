import type { MemberStatus, PublicUser, Role } from '@palcms/shared';
import { db } from '../db';
import { isStaff, permissionsOf } from '../core/permissions';

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string | null;
  role: Role;
  status: MemberStatus;
  steam_id: string | null;
  player_uid: string | null;
  in_game_name: string | null;
  avatar_url: string | null;
  created_at: number;
  last_login_at: number | null;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id);
}

export function findUserByLogin(login: string): UserRow | undefined {
  return db.prepare<[string, string], UserRow>('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
}

export function findUserBySteamId(steamId: string): UserRow | undefined {
  return db.prepare<[string], UserRow>('SELECT * FROM users WHERE steam_id = ?').get(steamId);
}

export function usernameTaken(username: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
}

export function emailTaken(email: string): boolean {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
}

/** Finds a free username from a base name (Steam name…). */
export function uniqueUsername(base: string): string {
  let clean = base.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20);
  if (clean.length < 3) clean = `player${clean}`;
  let candidate = clean;
  for (let i = 2; usernameTaken(candidate); i++) candidate = `${clean.slice(0, 20)}${i}`;
  return candidate;
}

export interface NewUser {
  username: string;
  displayName: string;
  email?: string | null;
  passwordHash?: string | null;
  role: Role;
  status: MemberStatus;
  steamId?: string | null;
  playerUid?: string | null;
  inGameName?: string | null;
  avatarUrl?: string | null;
}

export function createUser(u: NewUser): number {
  const res = db
    .prepare(
      `INSERT INTO users (username, display_name, email, password_hash, role, status, steam_id, player_uid, in_game_name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      u.username,
      u.displayName,
      u.email ?? null,
      u.passwordHash ?? null,
      u.role,
      u.status,
      u.steamId ?? null,
      u.playerUid ?? null,
      u.inGameName ?? null,
      u.avatarUrl ?? null,
      Date.now(),
    );
  return Number(res.lastInsertRowid);
}

export function isAdmin(u: Pick<UserRow, 'role' | 'status'> | null | undefined): boolean {
  return isStaff(u);
}

export function toPublicUser(u: UserRow): PublicUser {
  const player = u.player_uid
    ? db.prepare<[string], { public_id: string }>('SELECT public_id FROM players WHERE uid = ?').get(u.player_uid)
    : undefined;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    avatarUrl: u.avatar_url,
    steam: !!u.steam_id,
    playerPublicId: player?.public_id ?? null,
    permissions: permissionsOf(u),
  };
}
