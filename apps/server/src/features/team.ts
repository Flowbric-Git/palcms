import { z } from 'zod';
import { ALL_PERMISSIONS, PERMISSIONS, type HostUser, type Permission, type FeatureHost } from '@palcms/shared';
import { every, httpError, parseBody, type Feature } from './util';

interface RoleRow {
  id: number;
  name: string;
  permissions: string;
  builtin: number;
}

const roleSchema = z.object({
  name: z.string().trim().min(2).max(40),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])).max(ALL_PERMISSIONS.length),
});

/** Team roles: Administrator, Moderator, Editor, plus custom roles. */
export function createTeam(host: FeatureHost): Feature & { hasPermission(user: HostUser, p: Permission): boolean } {
  const { db } = host;
  let cache: Map<number, Set<string>> | null = null;

  const roles = () => {
    if (!cache) {
      cache = new Map();
      for (const r of db.prepare('SELECT id, permissions FROM pro_roles').all() as RoleRow[]) {
        cache.set(r.id, new Set(JSON.parse(r.permissions) as string[]));
      }
    }
    return cache;
  };
  const invalidate = () => (cache = null);

  const hasPermission = (user: HostUser, p: Permission): boolean => {
    if (user.role === 'superadmin') return true;
    if (user.role !== 'admin') return false;
    const row = db.prepare('SELECT admin_role_id FROM users WHERE id = ?').get(user.id) as { admin_role_id: number | null } | undefined;
    // An admin without a role (e.g. created before roles existed) keeps every permission.
    if (!row || row.admin_role_id === null) return true;
    const perms = roles().get(row.admin_role_id);
    return !!perms && (perms.has('*') || perms.has(p));
  };

  const listRoles = () =>
    (db.prepare('SELECT id, name, permissions, builtin FROM pro_roles ORDER BY builtin DESC, name').all() as RoleRow[]).map((r) => {
      const perms = JSON.parse(r.permissions) as string[];
      return {
        id: r.id,
        name: r.name,
        builtin: r.builtin === 1,
        permissions: perms.includes('*') ? ALL_PERMISSIONS : perms,
        all: perms.includes('*'),
        members: (db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND admin_role_id = ?").get(r.id) as { c: number }).c,
      };
    });

  const audit = (user: HostUser | null, action: string, target?: string) =>
    host.events.emit('audit', { userId: user?.id ?? null, username: user?.username ?? null, action, target });

  return {
    hasPermission,
    routes: [
      {
        method: 'GET',
        path: 'team',
        access: 'staff',
        permission: 'admin.team',
        handler: () => ({
          roles: listRoles(),
          permissions: PERMISSIONS,
          staff: db
            .prepare(
              `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.admin_role_id AS roleId, r.name AS roleName, u.last_login_at AS lastLoginAt
               FROM users u LEFT JOIN pro_roles r ON r.id = u.admin_role_id
               WHERE u.role IN ('admin', 'superadmin') ORDER BY u.role = 'superadmin' DESC, u.username`,
            )
            .all(),
        }),
      },
      {
        method: 'GET',
        path: 'team/candidates',
        access: 'staff',
        permission: 'admin.team',
        handler: ({ query }) =>
          db
            .prepare(
              `SELECT id, username, display_name AS displayName FROM users
               WHERE role = 'player' AND status = 'active' AND (username LIKE ? OR display_name LIKE ?) ORDER BY username LIMIT 20`,
            )
            .all(`%${query.q ?? ''}%`, `%${query.q ?? ''}%`),
      },
      {
        method: 'PUT',
        path: 'team/:userId',
        access: 'staff',
        permission: 'admin.team',
        handler: ({ params, body, user }) => {
          const { roleId } = parseBody(z.object({ roleId: z.number().int().positive().nullable() }), body);
          const id = Number(params.userId);
          const target = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(id) as
            | { id: number; username: string; role: string; status: string }
            | undefined;
          if (!target) throw httpError(404, 'Account not found');
          if (target.role === 'superadmin') throw httpError(403, 'The main administrator account cannot be changed');
          if (target.id === user!.id) throw httpError(403, 'You cannot change your own role');
          if (target.status !== 'active') throw httpError(400, 'The account must be active');
          if (roleId === null) {
            db.prepare("UPDATE users SET role = 'player', admin_role_id = NULL WHERE id = ?").run(id);
            audit(user, 'team.remove', target.username);
          } else {
            if (!db.prepare('SELECT 1 FROM pro_roles WHERE id = ?').get(roleId)) throw httpError(400, 'Role not found');
            db.prepare("UPDATE users SET role = 'admin', admin_role_id = ? WHERE id = ?").run(roleId, id);
            audit(user, 'team.set-role', target.username);
          }
          return { ok: true };
        },
      },
      {
        method: 'POST',
        path: 'roles',
        access: 'staff',
        permission: 'admin.team',
        handler: ({ body, user }) => {
          const r = parseBody(roleSchema, body);
          if (db.prepare('SELECT 1 FROM pro_roles WHERE name = ?').get(r.name)) throw httpError(409, 'This role already exists');
          db.prepare('INSERT INTO pro_roles (name, permissions, builtin, created_at) VALUES (?, ?, 0, ?)').run(
            r.name,
            JSON.stringify(r.permissions),
            Date.now(),
          );
          invalidate();
          audit(user, 'role.create', r.name);
          return listRoles();
        },
      },
      {
        method: 'PUT',
        path: 'roles/:id',
        access: 'staff',
        permission: 'admin.team',
        handler: ({ params, body, user }) => {
          const r = parseBody(roleSchema, body);
          const current = db.prepare('SELECT * FROM pro_roles WHERE id = ?').get(Number(params.id)) as RoleRow | undefined;
          if (!current) throw httpError(404, 'Role not found');
          if (current.builtin && current.permissions === '["*"]') throw httpError(403, 'The Administrator role always has every permission');
          if (db.prepare('SELECT 1 FROM pro_roles WHERE name = ? AND id != ?').get(r.name, current.id)) throw httpError(409, 'This name is already taken');
          db.prepare('UPDATE pro_roles SET name = ?, permissions = ? WHERE id = ?').run(
            current.builtin ? current.name : r.name,
            JSON.stringify(r.permissions),
            current.id,
          );
          invalidate();
          audit(user, 'role.update', current.name);
          return listRoles();
        },
      },
      {
        method: 'DELETE',
        path: 'roles/:id',
        access: 'staff',
        permission: 'admin.team',
        handler: ({ params, user }) => {
          const current = db.prepare('SELECT * FROM pro_roles WHERE id = ?').get(Number(params.id)) as RoleRow | undefined;
          if (!current) throw httpError(404, 'Role not found');
          if (current.builtin) throw httpError(403, 'Built-in roles cannot be deleted');
          const used = (db.prepare('SELECT COUNT(*) AS c FROM users WHERE admin_role_id = ?').get(current.id) as { c: number }).c;
          if (used > 0) throw httpError(409, 'This role is still assigned to team members');
          db.prepare('DELETE FROM pro_roles WHERE id = ?').run(current.id);
          invalidate();
          audit(user, 'role.delete', current.name);
          return listRoles();
        },
      },
    ],
  };
}

/** Team audit log (kept for 180 days). */
export function createAudit(host: FeatureHost): Feature {
  const { db } = host;
  const stops: (() => void)[] = [];
  const purge = () => db.prepare('DELETE FROM pro_audit WHERE ts < ?').run(Date.now() - 180 * 24 * 3600_000);

  return {
    start() {
      stops.push(
        host.events.on('audit', (e) => {
          db.prepare('INSERT INTO pro_audit (ts, user_id, username, action, target, details) VALUES (?, ?, ?, ?, ?, ?)').run(
            Date.now(),
            e.userId,
            e.username,
            e.action,
            e.target ?? null,
            e.details === undefined ? null : JSON.stringify(e.details).slice(0, 2000),
          );
        }),
      );
      purge();
      stops.push(every(24 * 3600_000, purge));
    },
    stop() {
      stops.splice(0).forEach((s) => s());
    },
    routes: [
      {
        method: 'GET',
        path: 'audit',
        access: 'staff',
        permission: 'admin.audit',
        handler: ({ query }) => {
          const page = Math.max(1, Number(query.page) || 1);
          const q = `%${query.q ?? ''}%`;
          const where = 'WHERE username LIKE ? OR action LIKE ? OR target LIKE ?';
          const items = db
            .prepare(`SELECT id, ts, username, action, target, details FROM pro_audit ${where} ORDER BY ts DESC LIMIT 50 OFFSET ?`)
            .all(q, q, q, (page - 1) * 50);
          const total = (db.prepare(`SELECT COUNT(*) AS c FROM pro_audit ${where}`).get(q, q, q) as { c: number }).c;
          return { items, page, pages: Math.max(1, Math.ceil(total / 50)) };
        },
      },
    ],
  };
}
