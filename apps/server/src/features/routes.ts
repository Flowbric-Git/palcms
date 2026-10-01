import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FeatureFile, FeatureRoute } from '@palcms/shared';
import { hasPermission, isStaff } from '../core/permissions';
import { saveImageUpload } from '../core/uploads';
import { isSetupDone } from '../core/site';
import { errorMessage } from '../routes/util';
import { features } from './runtime';
import { pluginRuntime } from './extensions';

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

/** Finds the requested route among "routes", checks access and runs it. */
async function dispatch(req: FastifyRequest, reply: FastifyReply, routes: FeatureRoute[], path: string) {
  if (!isSetupDone()) return reply.code(409).send({ error: 'Setup is not finished' });
  const parts = path.split('/').filter(Boolean);
  let route: FeatureRoute | undefined;
  let params: Record<string, string> | null = null;
  for (const r of routes) {
    params = match(r, req.method, parts);
    if (params) {
      route = r;
      break;
    }
  }
  if (!route || !params) return reply.code(404).send({ error: 'Not found' });

  const user = req.user;
  if (route.access !== 'public' && !user) return reply.code(401).send({ error: 'Login required' });
  if (route.access === 'staff') {
    if (!isStaff(user)) return reply.code(403).send({ error: 'Team only' });
    if (route.permission && !hasPermission(user, route.permission)) return reply.code(403).send({ error: 'Insufficient permission' });
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
        if (!file) throw Object.assign(new Error('No file'), { status: 400 });
        try {
          return await saveImageUpload(file, maxBytes);
        } catch (e) {
          throw Object.assign(e as Error, { status: 400 });
        }
      },
      readUpload: async (maxBytes) => {
        const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
        if (!file) throw Object.assign(new Error('No file'), { status: 400 });
        const data = await file.toBuffer();
        if (file.file.truncated) throw Object.assign(new Error('File too large'), { status: 413 });
        return { filename: file.filename, data: new Uint8Array(data) };
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
}

/** /api/features gateway: routes declared by features, with access control. */
export async function featureRoutes(app: FastifyInstance) {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
    app.route<{ Params: { '*': string } }>({
      method,
      url: '/*',
      handler: (req, reply) => dispatch(req, reply, features().routes, req.params['*']),
    });
  }
}

/** /api/plugins/<id>/… gateway: routes declared by enabled plugins. */
export async function pluginRoutes(app: FastifyInstance) {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
    app.route<{ Params: { id: string; '*': string } }>({
      method,
      url: '/:id/*',
      handler: (req, reply) => {
        const rt = pluginRuntime();
        if (!rt?.isLoaded(req.params.id)) return reply.code(404).send({ error: 'Plugin not found or disabled' });
        return dispatch(req, reply, rt.routes(req.params.id), req.params['*']);
      },
    });
  }
}
