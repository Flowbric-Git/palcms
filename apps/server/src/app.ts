import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { routePrefix } from '@palcms/shared';
import { config, uploadsDir } from './config';
import { realtime } from './core/realtime';
import { isSetupDone } from './core/site';
import { MAX_UPLOAD_BYTES } from './core/uploads';
import { SESSION_COOKIE, requireAdmin, userFromCookie } from './auth/sessions';
import { setupRoutes } from './setup/routes';
import { hasSetupSession } from './setup/token';
import { publicRoutes } from './routes/public';
import { authRoutes } from './routes/auth';
import { adminServerRoutes } from './routes/admin/server';
import { adminSiteRoutes } from './routes/admin/site';
import { adminMemberRoutes } from './routes/admin/members';
import { featureRoutes } from './features/routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'warn' },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(websocket);

  app.decorateRequest('user', null);
  const publicHost = new URL(config.publicUrl).host;

  app.addHook('onRequest', async (req, reply) => {
    // Protection CSRF : une requête qui modifie quelque chose doit venir du site lui-même.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch {
          /* origine illisible */
        }
        const allowed = [req.headers.host, req.headers['x-forwarded-host'], publicHost];
        if (!host || !allowed.includes(host)) return reply.code(403).send({ error: 'Origine refusée' });
      }
    }
    req.user = userFromCookie(req.cookies[SESSION_COOKIE]);
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  const prefix = routePrefix(config.basePath);

  await app.register(
    async (api) => {
      await api.register(publicRoutes, { prefix: '/api/public' });
      await api.register(authRoutes, { prefix: '/api/auth' });
      await api.register(setupRoutes, { prefix: '/api/setup' });
      await api.register(featureRoutes, { prefix: '/api/features' });

      await api.register(
        async (admin) => {
          admin.addHook('preHandler', async (req, reply) => {
            if (!isSetupDone()) return reply.code(409).send({ error: "L'installation n'est pas terminée" });
            return requireAdmin(req, reply);
          });
          await admin.register(adminServerRoutes, { prefix: '/server' });
          await admin.register(adminSiteRoutes, { prefix: '/site' });
          await admin.register(adminMemberRoutes, { prefix: '/members' });
        },
        { prefix: '/api/admin' },
      );

      api.get('/ws', { websocket: true }, (socket, req) => {
        realtime.attach(socket, { canSetup: !isSetupDone() && hasSetupSession(req), user: req.user });
      });
    },
    { prefix },
  );

  // Fichiers envoyés et site React

  fs.mkdirSync(uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: `${config.basePath}uploads/`,
    decorateReply: false,
    index: false,
  });

  const indexFile = path.join(config.webDist, 'index.html');
  const hasWeb = fs.existsSync(indexFile);
  let indexHtml = '';
  if (hasWeb) {
    // Le front est compilé avec des chemins relatifs : on lui indique ici sous quel chemin il est servi.
    indexHtml = fs
      .readFileSync(indexFile, 'utf8')
      .replace(
        '<head>',
        `<head><base href="${config.basePath}"><script>window.__PALCMS__=${JSON.stringify({ basePath: config.basePath })}</script>`,
      );
    // La racine doit renvoyer la page React : sans cela, le module de fichiers statiques
    // répond 403 sur un dossier (index désactivé).
    const sendIndex = (_req: unknown, reply: import('fastify').FastifyReply) =>
      reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(indexHtml);
    app.get(config.basePath, sendIndex);
    app.get(`${config.basePath}index.html`, sendIndex);
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: config.basePath,
      index: false,
      wildcard: true,
      maxAge: '1h',
    });
  }

  if (prefix) app.get(prefix, (_req, reply) => reply.redirect(config.basePath));

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0];
    const isApi = url.startsWith(`${config.basePath}api/`) || url.startsWith(`${config.basePath}uploads/`);
    if (req.method === 'GET' && !isApi && hasWeb && url.startsWith(config.basePath)) {
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(indexHtml);
    }
    return reply.code(404).send({ error: 'Introuvable' });
  });

  return app;
}
