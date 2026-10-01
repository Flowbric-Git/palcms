import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType, ZodTypeDef } from 'zod';
import { modules } from '../core/modules';
import { isManaged } from '../core/site';

/** Validates the request body; on error, answers 400 with per-field details and returns null. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown, reply: FastifyReply): T | null {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  const flat = res.error.flatten();
  const first = Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0] ?? 'Invalid data';
  void reply.code(400).send({ error: first, details: flat });
  return null;
}

/** Guard: the route only exists when the module is enabled. */
export function requireModule(id: string) {
  return async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!modules.isEnabled(id)) return reply.code(404).send({ error: 'Feature disabled' });
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Guard: actions that need a server installed and run by PalCMS (palctl, service, files). */
export async function requireManaged(_req: FastifyRequest, reply: FastifyReply) {
  if (!isManaged()) {
    return reply.code(409).send({ error: 'Only available for a server installed by PalCMS on this VPS' });
  }
}
