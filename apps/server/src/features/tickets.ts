import { z } from 'zod';
import type { FeatureHost } from '@palcms/shared';
import { httpError, parseBody, type Feature, type FeatureBus } from './util';

interface TicketRow {
  id: number;
  user_id: number;
  kind: 'report' | 'suggestion';
  subject: string;
  message: string;
  target: string | null;
  status: 'open' | 'answered' | 'closed';
  reply: string | null;
  replied_by: string | null;
  created_at: number;
  updated_at: number;
  username?: string;
}

const toApi = (t: TicketRow) => ({
  id: t.id,
  kind: t.kind,
  subject: t.subject,
  message: t.message,
  target: t.target,
  status: t.status,
  reply: t.reply,
  repliedBy: t.replied_by,
  createdAt: t.created_at,
  updatedAt: t.updated_at,
  ...(t.username !== undefined ? { username: t.username } : {}),
});

export function createTickets(host: FeatureHost, bus: FeatureBus): Feature {
  const { db } = host;
  const enabled = () => {
    if (!host.modules.isEnabled('tickets')) throw httpError(404, 'Reports are disabled');
  };

  return {
    routes: [
      {
        method: 'POST',
        path: 'tickets',
        access: 'user',
        handler: ({ body, user }) => {
          enabled();
          if (user!.status !== 'active') throw httpError(403, 'Your account must be approved to send a message to the team');
          const t = parseBody(
            z.object({
              kind: z.enum(['report', 'suggestion']),
              subject: z.string().trim().min(3, 'Subject too short').max(120),
              message: z.string().trim().min(10, 'Message too short (10 characters minimum)').max(3000),
              target: z.string().trim().max(64).optional(),
            }),
            body,
          );
          // Anti-abuse: one request per minute and 5 open requests at most.
          const last = db.prepare('SELECT MAX(created_at) AS t FROM pro_tickets WHERE user_id = ?').get(user!.id) as { t: number | null };
          if (last.t && Date.now() - last.t < 60_000) throw httpError(429, 'Wait a minute before sending another request');
          const open = db.prepare("SELECT COUNT(*) AS c FROM pro_tickets WHERE user_id = ? AND status = 'open'").get(user!.id) as { c: number };
          if (open.c >= 5) throw httpError(429, 'You already have 5 requests waiting for an answer');
          const now = Date.now();
          const r = db
            .prepare('INSERT INTO pro_tickets (user_id, kind, subject, message, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(user!.id, t.kind, t.subject, t.message, t.kind === 'report' ? t.target || null : null, now, now);
          bus.emit('ticket:new', { kind: t.kind, subject: t.subject, username: user!.username });
          return { id: Number(r.lastInsertRowid) };
        },
      },
      {
        method: 'GET',
        path: 'me/tickets',
        access: 'user',
        handler: ({ user }) => (db.prepare('SELECT * FROM pro_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(user!.id) as TicketRow[]).map(toApi),
      },
      {
        method: 'GET',
        path: 'tickets',
        access: 'staff',
        permission: 'site.tickets',
        handler: ({ query }) => {
          const where = query.status === 'all' ? '' : query.status === 'closed' ? "WHERE t.status != 'open'" : "WHERE t.status = 'open'";
          return {
            open: (db.prepare("SELECT COUNT(*) AS c FROM pro_tickets WHERE status = 'open'").get() as { c: number }).c,
            items: (db.prepare(`SELECT t.*, u.username FROM pro_tickets t JOIN users u ON u.id = t.user_id ${where} ORDER BY t.created_at DESC LIMIT 200`).all() as TicketRow[]).map(toApi),
          };
        },
      },
      {
        method: 'POST',
        path: 'tickets/:id/reply',
        access: 'staff',
        permission: 'site.tickets',
        handler: ({ params, body, user }) => {
          const b = parseBody(z.object({ reply: z.string().trim().max(3000).default(''), close: z.boolean().default(false) }), body);
          if (!b.reply && !b.close) throw httpError(400, 'Write an answer or close the request');
          const t = db.prepare('SELECT id, subject FROM pro_tickets WHERE id = ?').get(Number(params.id)) as { id: number; subject: string } | undefined;
          if (!t) throw httpError(404, 'Request not found');
          const status = b.close ? 'closed' : 'answered';
          if (b.reply) {
            db.prepare('UPDATE pro_tickets SET reply = ?, replied_by = ?, status = ?, updated_at = ? WHERE id = ?').run(b.reply, user!.username, status, Date.now(), t.id);
          } else {
            db.prepare('UPDATE pro_tickets SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), t.id);
          }
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: b.close ? 'ticket.close' : 'ticket.reply', target: t.subject });
          return { ok: true };
        },
      },
      {
        method: 'DELETE',
        path: 'tickets/:id',
        access: 'staff',
        permission: 'site.tickets',
        handler: ({ params, user }) => {
          db.prepare('DELETE FROM pro_tickets WHERE id = ?').run(Number(params.id));
          host.events.emit('audit', { userId: user!.id, username: user!.username, action: 'ticket.delete', target: params.id });
          return { ok: true };
        },
      },
    ],
  };
}
