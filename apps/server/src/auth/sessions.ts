import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db';
import { config, secureCookies } from '../config';
import { findUserById, isAdmin, type UserRow } from './users';

export const SESSION_COOKIE = 'palcms_sid';
const TTL_MS = 30 * 24 * 3600 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function cookieOptions(maxAgeSeconds?: number) {
  return {
    path: config.basePath,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookies,
    ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds } : {}),
  };
}

export function createSession(reply: FastifyReply, userId: number): void {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    now + TTL_MS,
    now,
  );
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, userId);
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(TTL_MS / 1000));
}

export function destroySession(req: FastifyRequest, reply: FastifyReply): void {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
  reply.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function destroyUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function userFromCookie(token: string | undefined): UserRow | null {
  if (!token) return null;
  const row = db
    .prepare<[string], { user_id: number; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(hashToken(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
    return null;
  }
  const user = findUserById(row.user_id);
  if (!user || user.status === 'banned' || user.status === 'rejected') return null;
  return user;
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

// Gardes

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Connexion requise' });
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'Connexion requise' });
  if (!isAdmin(req.user)) return reply.code(403).send({ error: 'Accès réservé aux administrateurs' });
}
