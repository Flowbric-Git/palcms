import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { EXTENSION_ID_RE } from '@palcms/shared';
import { extensionPath, getExtension } from './store';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Fichiers publics des extensions : web.js, style.css et le dossier assets/ (jamais server.js). */
export async function extensionFiles(app: FastifyInstance) {
  app.get<{ Params: { id: string; '*': string } }>('/:id/*', async (req, reply) => {
    const { id } = req.params;
    const file = req.params['*'];
    if (!EXTENSION_ID_RE.test(id) || !getExtension(id)) return reply.code(404).send({ error: 'Introuvable' });
    if (!(file === 'web.js' || file === 'style.css' || /^assets\/[\w./-]+$/.test(file)) || file.split('/').includes('..')) {
      return reply.code(404).send({ error: 'Introuvable' });
    }
    const type = TYPES[path.extname(file).toLowerCase()];
    // Pas de SVG ni de HTML : ils pourraient exécuter du script sur le domaine du site.
    if (!type) return reply.code(404).send({ error: 'Type de fichier non servi' });
    const full = extensionPath(id, file);
    if (!full.startsWith(extensionPath(id)) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return reply.code(404).send({ error: 'Introuvable' });
    }
    // L'URL porte la version (?v=1.2.3) : le navigateur peut garder le fichier en cache.
    return reply
      .type(type)
      .header('Cache-Control', req.query && (req.query as { v?: string }).v ? 'public, max-age=604800' : 'no-cache')
      .send(fs.createReadStream(full));
  });
}
