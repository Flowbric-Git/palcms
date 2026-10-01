import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { memberDecisionSchema } from '@palcms/shared';
import { db } from '../../db';
import { destroyUserSessions } from '../../auth/sessions';
import { findUserById } from '../../auth/users';
import { parse } from '../util';
import { audit, requirePermission } from '../../core/permissions';

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Player accounts: approving email sign-ups, linking to a character, banning. */
export async function adminMemberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requirePermission('site.members'));

  app.get<{ Querystring: { status?: string } }>('/', async (req) => {
    const status = ['active', 'pending', 'rejected', 'banned'].includes(req.query.status ?? '') ? req.query.status : null;
    return db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName, u.email, u.role, u.status, u.in_game_name AS inGameName,
                u.steam_id IS NOT NULL AS steam, u.player_uid AS playerUid, p.name AS playerName, p.level AS playerLevel,
                u.created_at AS createdAt, u.last_login_at AS lastLoginAt
         FROM users u LEFT JOIN players p ON p.uid = u.player_uid
         WHERE (? IS NULL OR u.status = ?)
         ORDER BY u.status = 'pending' DESC, u.created_at DESC`,
      )
      .all(status, status);
  });

  /** Known characters, to link an account approved by hand. */
  app.get('/players', async () =>
    db.prepare('SELECT uid, name, level, last_seen AS lastSeen FROM players ORDER BY name').all(),
  );

  const guardTarget = (id: number, actorId: number) => {
    const target = findUserById(id);
    if (!target) return { ok: false, error: 'Account not found', code: 404 } as const;
    if (target.role === 'superadmin') return { ok: false, error: 'The main administrator account cannot be changed here', code: 403 } as const;
    if (target.id === actorId) return { ok: false, error: 'Not possible on your own account', code: 403 } as const;
    return { ok: true, target } as const;
  };

  const playerExists = (uid: string) => !!db.prepare('SELECT 1 FROM players WHERE uid = ?').get(uid);

  app.post('/:id/approve', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = parse(memberDecisionSchema, req.body ?? {}, reply);
    if (!body) return;
    const g = guardTarget(id, req.user!.id);
    if (!g.ok) return reply.code(g.code).send({ error: g.error });
    if (body.playerUid && !playerExists(body.playerUid)) return reply.code(400).send({ error: 'Character not found' });
    db.prepare("UPDATE users SET status = 'active', player_uid = COALESCE(?, player_uid) WHERE id = ?").run(body.playerUid ?? null, id);
    audit(req, 'member.approve', g.target.username);
    return { ok: true };
  });

  app.post('/:id/link', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = parse(memberDecisionSchema, req.body ?? {}, reply);
    if (!body) return;
    const g = guardTarget(id, req.user!.id);
    if (!g.ok) return reply.code(g.code).send({ error: g.error });
    if (g.target.steam_id) return reply.code(400).send({ error: 'This account is linked automatically through Steam' });
    if (body.playerUid && !playerExists(body.playerUid)) return reply.code(400).send({ error: 'Character not found' });
    db.prepare('UPDATE users SET player_uid = ? WHERE id = ?').run(body.playerUid ?? null, id);
    audit(req, 'member.link', g.target.username);
    return { ok: true };
  });

  const setStatus = (status: 'rejected' | 'banned' | 'active') => async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    const { id } = idParam.parse(req.params);
    const g = guardTarget(id, req.user!.id);
    if (!g.ok) return reply.code(g.code).send({ error: g.error });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
    if (status !== 'active') destroyUserSessions(id);
    audit(req, `member.${status}`, g.target.username);
    return { ok: true };
  };

  app.post('/:id/reject', setStatus('rejected'));
  app.post('/:id/ban', setStatus('banned'));
  app.post('/:id/unban', setStatus('active'));

  app.delete('/:id', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const g = guardTarget(id, req.user!.id);
    if (!g.ok) return reply.code(g.code).send({ error: g.error });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    audit(req, 'member.delete', g.target.username);
    return { ok: true };
  });
}
