import { ALL_PERMISSIONS, type HostUser, type Permission } from '@palcms/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { events } from './events';

type Resolver = (user: HostUser, permission: Permission) => boolean;

let resolver: Resolver | null = null;

/** Les rôles de l'équipe fournissent la répartition des permissions ; sans eux, tout admin a tout. */
export function setPermissionResolver(fn: Resolver | null): void {
  resolver = fn;
}

export function isStaff(user: Pick<HostUser, 'role' | 'status'> | null | undefined): boolean {
  return !!user && user.status === 'active' && (user.role === 'admin' || user.role === 'superadmin');
}

export function hasPermission(user: HostUser | null | undefined, permission: Permission): boolean {
  if (!user || !isStaff(user)) return false;
  if (user.role === 'superadmin') return true;
  return resolver ? resolver(user, permission) : true;
}

export function permissionsOf(user: HostUser | null | undefined): Permission[] {
  return ALL_PERMISSIONS.filter((p) => hasPermission(user, p));
}

/** Garde Fastify : exige une permission du panel admin. */
export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Connexion requise' });
    if (!hasPermission(req.user, permission)) return reply.code(403).send({ error: 'Permission insuffisante' });
  };
}

/** Enregistre une action dans le journal des actions. */
export function audit(req: FastifyRequest, action: string, target?: string, details?: unknown): void {
  events.emit('audit', { userId: req.user?.id ?? null, username: req.user?.username ?? null, action, target, details });
}
