import type { FastifyInstance } from 'fastify';
import { loginSchema, profileUpdateSchema, registerSchema } from '@palcms/shared';
import { db } from '../db';
import { config } from '../config';
import { modules } from '../core/modules';
import { getSiteSettings, steamApiKey } from '../core/site';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password';
import { createSession, destroySession, destroyUserSessions, requireUser } from '../auth/sessions';
import { fetchSteamProfile, palworldUidFromSteam, steamLoginUrl, verifySteamResponse } from '../auth/steam';
import {
  createUser,
  emailTaken,
  findUserById,
  findUserBySteamId,
  findUserByLogin,
  toPublicUser,
  uniqueUsername,
  usernameTaken,
} from '../auth/users';
import { errorMessage, parse } from './util';
import { events } from '../core/events';

const steamReturnTo = () => `${config.publicUrl}${config.basePath}api/auth/steam/callback`;

function registrationOpen(method: 'steam' | 'email'): boolean {
  return modules.isEnabled('registration') && getSiteSettings().registration[method];
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  app.post('/login', strict, async (req, reply) => {
    const body = parse(loginSchema, req.body, reply);
    if (!body) return;
    const user = findUserByLogin(body.login);
    const ok = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return reply.code(401).send({ error: 'Identifiants incorrects' });
    if (user.status === 'banned') return reply.code(403).send({ error: 'Ce compte est banni' });
    if (user.status === 'rejected') return reply.code(403).send({ error: "Ton inscription a été refusée par l'équipe" });
    createSession(reply, user.id);
    return { user: toPublicUser(user) };
  });

  app.post('/logout', async (req, reply) => {
    destroySession(req, reply);
    return { ok: true };
  });

  app.post('/register', strict, async (req, reply) => {
    if (!registrationOpen('email')) return reply.code(403).send({ error: "L'inscription par email est fermée" });
    const body = parse(registerSchema, req.body, reply);
    if (!body) return;
    if (usernameTaken(body.username)) return reply.code(409).send({ error: "Ce nom d'utilisateur est déjà pris" });
    if (emailTaken(body.email)) return reply.code(409).send({ error: 'Cet email est déjà utilisé' });
    const id = createUser({
      username: body.username,
      displayName: body.username,
      email: body.email,
      passwordHash: await hashPassword(body.password),
      role: 'player',
      status: 'pending',
      inGameName: body.inGameName,
    });
    events.emit('member:pending', { username: body.username, inGameName: body.inGameName });
    createSession(reply, id);
    return { user: toPublicUser(findUserById(id)!) };
  });

  app.get('/me', async (req) => ({ user: req.user ? toPublicUser(req.user) : null }));

  app.patch('/me', { preHandler: requireUser }, async (req, reply) => {
    const body = parse(profileUpdateSchema, req.body, reply);
    if (!body) return;
    const user = req.user!;
    if (body.displayName) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(body.displayName, user.id);
    if (body.newPassword) {
      // Un compte créé via Steam n'a pas de mot de passe : il peut en définir un sans l'ancien.
      if (user.password_hash && !(await verifyPassword(body.currentPassword ?? '', user.password_hash))) {
        return reply.code(400).send({ error: 'Mot de passe actuel incorrect' });
      }
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.newPassword), user.id);
      destroyUserSessions(user.id);
      createSession(reply, user.id);
    }
    return { user: toPublicUser(findUserById(user.id)!) };
  });

  // Steam (inscription validée automatiquement)

  app.get('/steam', async (req, reply) => {
    if (!registrationOpen('steam') && !req.user) {
      return reply.redirect(`${config.basePath}connexion?erreur=${encodeURIComponent('Connexion Steam désactivée')}`);
    }
    return reply.redirect(steamLoginUrl(steamReturnTo(), `${config.publicUrl}/`));
  });

  app.get<{ Querystring: Record<string, string> }>('/steam/callback', strict, async (req, reply) => {
    const fail = (msg: string) => reply.redirect(`${config.basePath}connexion?erreur=${encodeURIComponent(msg)}`);
    let steamId: string;
    try {
      steamId = await verifySteamResponse(req.query, steamReturnTo());
    } catch (e) {
      return fail(errorMessage(e));
    }
    const playerUid = palworldUidFromSteam(steamId);
    const existing = findUserBySteamId(steamId);

    // Déjà connecté : on lie Steam au compte courant, ce qui le valide automatiquement.
    if (req.user) {
      if (existing && existing.id !== req.user.id) return fail('Ce compte Steam est déjà lié à un autre compte');
      const status = req.user.status === 'pending' ? 'active' : req.user.status;
      db.prepare('UPDATE users SET steam_id = ?, player_uid = ?, status = ? WHERE id = ?').run(steamId, playerUid, status, req.user.id);
      return reply.redirect(`${config.basePath}profil`);
    }

    if (existing) {
      if (existing.status === 'banned') return fail('Ce compte est banni');
      createSession(reply, existing.id);
      return reply.redirect(`${config.basePath}profil`);
    }

    if (!registrationOpen('steam')) return fail('Les inscriptions via Steam sont fermées');
    const profile = await fetchSteamProfile(steamId, steamApiKey());
    const base = profile?.personaName || `joueur${steamId.slice(-6)}`;
    const id = createUser({
      username: uniqueUsername(base),
      displayName: (profile?.personaName || base).slice(0, 32),
      role: 'player',
      status: 'active',
      steamId,
      playerUid,
      avatarUrl: profile?.avatarUrl ?? null,
    });
    createSession(reply, id);
    return reply.redirect(`${config.basePath}profil?bienvenue=1`);
  });
}
