import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FeatureFile, FeatureRoute } from '@palcms/shared';
import { hasPermission, isStaff } from '../core/permissions';
import { saveImageUpload } from '../core/uploads';
import { isSetupDone } from '../core/site';
import { errorMessage } from '../routes/util';
import { features } from './runtime';

function match(route: FeatureRoute, method: string, parts: string[]): Record<string, string> | null {
  if (route.method !== method) return null;
  const pattern = route.path.split('/').filter(Boolean);
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
    else if (pattern[i] !== parts[i]) return null;
  }
  return params;
}

const isFile = (v: unknown): v is FeatureFile => !!v && typeof v === 'object' && (v as FeatureFile).kind === 'file';

/** Passerelle /api/features : routes déclarées par les fonctionnalités, avec contrôle d'accès. */
export async function featureRoutes(app: FastifyInstance) {
  const dispatch = async (req: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
    if (!isSetupDone()) return reply.code(409).send({ error: "L'installation n'est pas terminée" });
    const parts = req.params['*'].split('/').filter(Boolean);
    let route: FeatureRoute | undefined;
    let params: Record<string, string> | null = null;
    for (const r of features().routes) {
      params = match(r, req.method, parts);
      if (params) {
        route = r;
        break;
      }
    }
    if (!route || !params) return reply.code(404).send({ error: 'Introuvable' });

    const user = req.user;
    if (route.access !== 'public' && !user) return reply.code(401).send({ error: 'Connexion requise' });
    if (route.access === 'staff') {
      if (!isStaff(user)) return reply.code(403).send({ error: 'Accès réservé à l’équipe' });
      if (route.permission && !hasPermission(user, route.permission)) return reply.code(403).send({ error: 'Permission insuffisante' });
    }

    try {
      const result = await route.handler({
        params,
        query: req.query as Record<string, string | undefined>,
        body: req.body,
        user,
        can: (p) => hasPermission(user, p),
        saveUpload: async (maxBytes) => {
          const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
          if (!file) throw Object.assign(new Error('Aucun fichier'), { status: 400 });
          try {
            return await saveImageUpload(file, maxBytes);
          } catch (e) {
            throw Object.assign(e as Error, { status: 400 });
          }
        },
      });
      if (isFile(result)) {
        return reply
          .type(result.contentType)
          .header('Content-Disposition', `attachment; filename="${result.filename.replace(/[^\w.-]/g, '_')}"`)
          .send(result.stream);
      }
      return result ?? { ok: true };
    } catch (e) {
      const status = typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : 500;
      if (status >= 500) req.log.error(e);
      return reply.code(status).send({ error: errorMessage(e) });
    }
  };

  for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
    app.route({ method, url: '/*', handler: dispatch });
  }
}
