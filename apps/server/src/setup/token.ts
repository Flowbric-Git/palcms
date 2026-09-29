import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { settings } from '../db';
import { setupTokenPath } from '../config';
import { cookieOptions } from '../auth/sessions';

/**
 * Jeton d'installation à usage unique : affiché dans le terminal par install.sh,
 * il empêche un inconnu de prendre la main sur l'assistant avant le propriétaire du VPS.
 */
export const SETUP_COOKIE = 'palcms_setup';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest();

export function ensureSetupToken(): string {
  if (fs.existsSync(setupTokenPath)) {
    const existing = fs.readFileSync(setupTokenPath, 'utf8').trim();
    if (existing.length >= 16) return existing;
  }
  const token = crypto.randomBytes(12).toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
  fs.mkdirSync(path.dirname(setupTokenPath), { recursive: true });
  fs.writeFileSync(setupTokenPath, token + '\n', { mode: 0o600 });
  return token;
}

export function checkSetupToken(candidate: string): boolean {
  if (!fs.existsSync(setupTokenPath)) return false;
  const expected = fs.readFileSync(setupTokenPath, 'utf8').trim().toUpperCase();
  return crypto.timingSafeEqual(sha(expected), sha(candidate.trim().toUpperCase()));
}

export function removeSetupToken(): void {
  fs.rmSync(setupTokenPath, { force: true });
  settings.delete('setup.sessionHash');
}

export function grantSetupSession(reply: FastifyReply): void {
  const value = crypto.randomBytes(32).toString('base64url');
  settings.set('setup.sessionHash', sha(value).toString('hex'));
  reply.setCookie(SETUP_COOKIE, value, cookieOptions(24 * 3600));
}

export function hasSetupSession(req: FastifyRequest): boolean {
  const value = req.cookies[SETUP_COOKIE];
  const stored = settings.get<string | null>('setup.sessionHash', null);
  if (!value || !stored) return false;
  return crypto.timingSafeEqual(sha(value), Buffer.from(stored, 'hex'));
}
