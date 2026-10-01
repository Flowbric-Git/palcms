import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { newsSchema, pageSchema, siteSettingsSchema, type PageItem } from '@palcms/shared';
import { db, settings } from '../../db';
import { modules } from '../../core/modules';
import { cleanHtml, slugify } from '../../core/sanitize';
import { getSiteSettings, saveSiteSettings, steamApiKey } from '../../core/site';
import { saveImageUpload } from '../../core/uploads';
import { NEWS_SELECT, toNewsItem } from '../public';
import { errorMessage, parse } from '../util';
import { audit, requirePermission } from '../../core/permissions';
import { events } from '../../core/events';

const P = {
  appearance: { preHandler: requirePermission('site.appearance') },
  modules: { preHandler: requirePermission('site.modules') },
  pages: { preHandler: requirePermission('site.pages') },
  news: { preHandler: requirePermission('site.news') },
};

interface PageRow {
  id: number;
  slug: string;
  title: string;
  content_html: string;
  published: number;
  updated_at: number;
}

const toPage = (r: PageRow): PageItem => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  contentHtml: r.content_html,
  published: r.published === 1,
  updatedAt: r.updated_at,
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function adminSiteRoutes(app: FastifyInstance) {
  // Site settings

  app.get('/settings', P.appearance, async () => ({ site: getSiteSettings(), steamApiKeySet: !!steamApiKey() }));

  app.put('/settings', P.appearance, async (req, reply) => {
    const body = parse(siteSettingsSchema, req.body, reply);
    if (!body) return;
    saveSiteSettings(body);
    audit(req, 'site.settings');
    return { site: body };
  });

  app.put('/steam-api-key', P.appearance, async (req, reply) => {
    const body = parse(z.object({ key: z.string().trim().max(64).regex(/^[A-Fa-f0-9]*$/, 'Invalid Steam key') }), req.body, reply);
    if (!body) return;
    settings.set('secret.steamApiKey', body.key);
    return { steamApiKeySet: !!body.key };
  });

  // Modules

  app.get('/modules', P.modules, async () => modules.list());

  app.put<{ Params: { id: string } }>('/modules/:id', P.modules, async (req, reply) => {
    const body = parse(z.object({ enabled: z.boolean() }), req.body, reply);
    if (!body) return;
    try {
      modules.setEnabled(req.params.id, body.enabled);
      audit(req, body.enabled ? 'module.enable' : 'module.disable', req.params.id);
      return modules.list();
    } catch (e) {
      return reply.code(400).send({ error: errorMessage(e) });
    }
  });

  // Pages

  app.get('/pages', P.pages, async () => db.prepare<[], PageRow>('SELECT * FROM pages ORDER BY title').all().map(toPage));

  app.get('/pages/:id', P.pages, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const row = db.prepare<[number], PageRow>('SELECT * FROM pages WHERE id = ?').get(id);
    return row ? toPage(row) : reply.code(404).send({ error: 'Page not found' });
  });

  app.post('/pages', P.pages, async (req, reply) => {
    const body = parse(pageSchema, req.body, reply);
    if (!body) return;
    if (db.prepare('SELECT 1 FROM pages WHERE slug = ?').get(body.slug)) return reply.code(409).send({ error: 'This address is already used' });
    const res = db
      .prepare('INSERT INTO pages (slug, title, content_html, published, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(body.slug, body.title, cleanHtml(body.contentHtml), body.published ? 1 : 0, Date.now());
    audit(req, 'page.create', body.slug);
    return toPage(db.prepare<[number], PageRow>('SELECT * FROM pages WHERE id = ?').get(Number(res.lastInsertRowid))!);
  });

  app.put('/pages/:id', P.pages, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = parse(pageSchema, req.body, reply);
    if (!body) return;
    if (db.prepare('SELECT 1 FROM pages WHERE slug = ? AND id != ?').get(body.slug, id)) {
      return reply.code(409).send({ error: 'This address is already used' });
    }
    const res = db
      .prepare('UPDATE pages SET slug = ?, title = ?, content_html = ?, published = ?, updated_at = ? WHERE id = ?')
      .run(body.slug, body.title, cleanHtml(body.contentHtml), body.published ? 1 : 0, Date.now(), id);
    if (!res.changes) return reply.code(404).send({ error: 'Page not found' });
    audit(req, 'page.update', body.slug);
    return toPage(db.prepare<[number], PageRow>('SELECT * FROM pages WHERE id = ?').get(id)!);
  });

  app.delete('/pages/:id', P.pages, async (req) => {
    const { id } = idParam.parse(req.params);
    audit(req, 'page.delete', String(id));
    db.prepare('DELETE FROM pages WHERE id = ?').run(id);
    return { ok: true };
  });

  // News

  app.get('/news', P.news, async () =>
    db
      .prepare(`${NEWS_SELECT} ORDER BY COALESCE(n.published_at, n.updated_at) DESC`)
      .all()
      .map((r) => toNewsItem(r as Parameters<typeof toNewsItem>[0])),
  );

  app.get('/news/:id', P.news, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const row = db.prepare(`${NEWS_SELECT} WHERE n.id = ?`).get(id);
    return row ? toNewsItem(row as Parameters<typeof toNewsItem>[0]) : reply.code(404).send({ error: 'Article not found' });
  });

  const uniqueNewsSlug = (base: string, exceptId: number | null) => {
    let slug = base;
    for (let i = 2; db.prepare('SELECT 1 FROM news WHERE slug = ? AND id IS NOT ?').get(slug, exceptId); i++) slug = `${base}-${i}`;
    return slug;
  };

  app.post('/news', P.news, async (req, reply) => {
    const body = parse(newsSchema, req.body, reply);
    if (!body) return;
    const now = Date.now();
    const slug = uniqueNewsSlug(body.slug || slugify(body.title), null);
    const res = db
      .prepare(
        `INSERT INTO news (slug, title, excerpt, content_html, cover_url, published, published_at, author_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(slug, body.title, body.excerpt, cleanHtml(body.contentHtml), body.coverUrl || null, body.published ? 1 : 0, body.published ? now : null, req.user!.id, now);
    audit(req, 'news.create', slug);
    if (body.published) events.emit('news:published', { title: body.title, slug });
    return toNewsItem(db.prepare(`${NEWS_SELECT} WHERE n.id = ?`).get(Number(res.lastInsertRowid)) as Parameters<typeof toNewsItem>[0]);
  });

  app.put('/news/:id', P.news, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = parse(newsSchema, req.body, reply);
    if (!body) return;
    const current = db.prepare<[number], { published_at: number | null }>('SELECT published_at FROM news WHERE id = ?').get(id);
    if (!current) return reply.code(404).send({ error: 'Article not found' });
    const now = Date.now();
    const slug = uniqueNewsSlug(body.slug || slugify(body.title), id);
    db.prepare(
      `UPDATE news SET slug = ?, title = ?, excerpt = ?, content_html = ?, cover_url = ?, published = ?, published_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      slug,
      body.title,
      body.excerpt,
      cleanHtml(body.contentHtml),
      body.coverUrl || null,
      body.published ? 1 : 0,
      body.published ? (current.published_at ?? now) : null,
      now,
      id,
    );
    audit(req, 'news.update', slug);
    if (body.published && current.published_at === null) events.emit('news:published', { title: body.title, slug });
    return toNewsItem(db.prepare(`${NEWS_SELECT} WHERE n.id = ?`).get(id) as Parameters<typeof toNewsItem>[0]);
  });

  app.delete('/news/:id', P.news, async (req) => {
    const { id } = idParam.parse(req.params);
    audit(req, 'news.delete', String(id));
    db.prepare('DELETE FROM news WHERE id = ?').run(id);
    return { ok: true };
  });

  // Images

  app.post('/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file' });
    try {
      return { url: await saveImageUpload(file) };
    } catch (e) {
      return reply.code(400).send({ error: errorMessage(e) });
    }
  });
}
