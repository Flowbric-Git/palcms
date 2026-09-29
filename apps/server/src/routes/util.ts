import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { modules } from '../core/modules';
import { isManaged } from '../core/site';

/** Valide le corps de la requête ; en cas d'erreur, répond 400 avec le détail par champ et renvoie null. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown, reply: FastifyReply): T | null {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  const flat = res.error.flatten();
  const first = Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? 'Données invalides';
  void reply.code(400).send({ error: first, details: flat });
  return null;
}

/** Garde : la route n'existe que si le module est activé. */
export function requireModule(id: string) {
  return async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!modules.isEnabled(id)) return reply.code(404).send({ error: 'Fonctionnalité désactivée' });
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Garde : actions qui exigent un serveur installé et géré par PalCMS (palctl, service, fichiers). */
export async function requireManaged(_req: FastifyRequest, reply: FastifyReply) {
  if (!isManaged()) {
    return reply.code(409).send({ error: 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS' });
  }
}
