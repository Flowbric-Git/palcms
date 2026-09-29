import type { FastifyInstance } from 'fastify';
import type { Bootstrap, NewsItem, NewsSummary, PageItem, PlayerProfile } from '@palcms/shared';
import { db } from '../db';
import { config } from '../config';
import { modules } from '../core/modules';
import { getServerMode, getSiteSettings, isSetupDone } from '../core/site';
import { toPublicUser } from '../auth/users';
import { poller } from '../palworld/poller';
import { requireModule } from './util';
import { bootExtensions } from '../extensions/store';

interface NewsRow {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content_html: string;
  cover_url: string | null;
  published: number;
  published_at: number | null;
  author: string | null;
}

export function toNewsSummary(r: NewsRow): NewsSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    coverUrl: r.cover_url,
    publishedAt: r.published_at,
    author: r.author,
  };
}

export function toNewsItem(r: NewsRow): NewsItem {
  return { ...toNewsSummary(r), contentHtml: r.content_html, published: r.published === 1 };
}

export const NEWS_SELECT = `SELECT n.*, u.display_name AS author FROM news n LEFT JOIN users u ON u.id = n.author_id`;

export async function publicRoutes(app: FastifyInstance) {
  app.get('/bootstrap', async (req): Promise<Bootstrap> => {
    return {
      setupDone: isSetupDone(),
      version: config.version,
      serverMode: getServerMode(),
      site: getSiteSettings(),
      modules: modules.enabledMap(),
      user: req.user ? toPublicUser(req.user) : null,
      extensions: isSetupDone() ? bootExtensions() : { theme: null, plugins: [] },
    };
  });

  app.get('/status', async () => ({
    status: poller.getStatus(),
    players: modules.isEnabled('status') ? poller.getPublicPlayers() : [],
  }));

  app.get('/leaderboard', { preHandler: requireModule('leaderboard') }, async () => poller.getLeaderboard(100));

  app.get<{ Params: { id: string } }>('/players/:id', async (req, reply): Promise<PlayerProfile | void> => {
    const row = db
      .prepare<
        [string],
        { uid: string; public_id: string; name: string; level: number; online: number; playtime_seconds: number; first_seen: number; last_seen: number }
      >('SELECT uid, public_id, name, level, online, playtime_seconds, first_seen, last_seen FROM players WHERE public_id = ?')
      .get(req.params.id);
    if (!row) return reply.code(404).send({ error: 'Joueur introuvable' });
    const member = db
      .prepare<[string], { username: string; display_name: string }>(
        "SELECT username, display_name FROM users WHERE player_uid = ? AND status = 'active'",
      )
      .get(row.uid);
    const rank = modules.isEnabled('leaderboard')
      ? (poller.getLeaderboard(100_000).find((e) => e.id === row.public_id)?.rank ?? null)
      : null;
    return {
      id: row.public_id,
      name: row.name,
      level: row.level,
      online: row.online === 1,
      playtimeSeconds: row.playtime_seconds,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      rank,
      member: member ? { username: member.username, displayName: member.display_name } : null,
    };
  });

  app.get<{ Querystring: { page?: string } }>('/news', { preHandler: requireModule('news') }, async (req) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = 10;
    const rows = db
      .prepare<[number, number], NewsRow>(`${NEWS_SELECT} WHERE n.published = 1 ORDER BY n.published_at DESC LIMIT ? OFFSET ?`)
      .all(perPage, (page - 1) * perPage);
    const total = db.prepare<[], { c: number }>('SELECT COUNT(*) AS c FROM news WHERE published = 1').get()!.c;
    return { items: rows.map(toNewsSummary), page, pages: Math.max(1, Math.ceil(total / perPage)) };
  });

  app.get<{ Params: { slug: string } }>('/news/:slug', { preHandler: requireModule('news') }, async (req, reply) => {
    const row = db.prepare<[string], NewsRow>(`${NEWS_SELECT} WHERE n.slug = ? AND n.published = 1`).get(req.params.slug);
    if (!row) return reply.code(404).send({ error: 'Article introuvable' });
    return toNewsItem(row);
  });

  app.get<{ Params: { slug: string } }>('/pages/:slug', async (req, reply): Promise<PageItem | void> => {
    const row = db
      .prepare<[string], { id: number; slug: string; title: string; content_html: string; published: number; updated_at: number }>(
        'SELECT * FROM pages WHERE slug = ? AND published = 1',
      )
      .get(req.params.slug);
    if (!row) return reply.code(404).send({ error: 'Page introuvable' });
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      contentHtml: row.content_html,
      published: true,
      updatedAt: row.updated_at,
    };
  });
}
