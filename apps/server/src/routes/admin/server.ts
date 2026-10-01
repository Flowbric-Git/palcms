import os from 'node:os';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { INI_LOCKED_KEYS, connectionTestSchema, externalServerSchema, serverConfigUpdateSchema } from '@palcms/shared';
import { db } from '../../db';
import { events } from '../../core/events';
import { audit, requirePermission } from '../../core/permissions';
import { decodeValue } from '../../palworld/iniConfig';
import { ConfigError, readConfigEntries, updateConfig } from '../../palworld/configService';
import { runPalctl } from '../../palworld/palctl';
import { poller } from '../../palworld/poller';
import { restartServer, serviceState, startServer, stopServer } from '../../palworld/service';
import { errorMessage, parse, requireManaged } from '../util';
import { getExternalServer, getServerMode, isManaged, saveExternalServer, setServerMode } from '../../core/site';
import { testConnection } from '../../palworld/restClient';

export async function adminServerRoutes(app: FastifyInstance) {
  app.get('/overview', async () => {
    // External or no server: PalCMS does not drive a systemd service.
    const mode = getServerMode();
    const service = mode === 'managed' ? await serviceState() : mode;
    const load = os.loadavg();
    const metrics = db
      .prepare<[number], { ts: number; fps: number; players: number }>('SELECT ts, fps, players FROM metrics WHERE ts > ? ORDER BY ts')
      .all(Date.now() - 24 * 3600 * 1000);
    return {
      mode,
      service,
      status: poller.getStatus(),
      host: {
        cpus: os.cpus().length,
        load: load[0],
        memTotal: os.totalmem(),
        memFree: os.freemem(),
        uptime: os.uptime(),
      },
      metrics,
    };
  });

  const control = { preHandler: [requirePermission('server.control'), requireManaged] };
  const action =
    (fn: () => Promise<void>, name: 'start' | 'stop' | 'restart', label: string) => async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        events.emit('server:action', { action: name, by: req.user?.username ?? null });
        await fn();
        audit(req, `server.${name}`);
        setTimeout(() => void poller.tick(), 3000);
        return { ok: true, message: label };
      } catch (e) {
        return reply.code(500).send({ error: errorMessage(e) });
      }
    };

  app.post('/start', control, action(startServer, 'start', 'Server started'));
  app.post('/stop', control, action(stopServer, 'stop', 'Server stopped'));
  app.post('/restart', control, action(restartServer, 'restart', 'Server restarted'));

  // Configuration (PalWorldSettings.ini)

  app.get('/config', { preHandler: [requirePermission('server.config'), requireManaged] }, async (_req, reply) => {
    try {
      const entries = await readConfigEntries();
      return {
        entries: entries.map((e) => ({ key: e.key, ...decodeValue(e.raw), locked: INI_LOCKED_KEYS.includes(e.key) })),
      };
    } catch (e) {
      return reply.code(500).send({ error: errorMessage(e) });
    }
  });

  app.put('/config', { preHandler: [requirePermission('server.config'), requireManaged] }, async (req, reply) => {
    const body = parse(serverConfigUpdateSchema, req.body, reply);
    if (!body) return;
    try {
      const { restarted } = await updateConfig(body.values, body.restart);
      audit(req, 'server.config', undefined, { keys: Object.keys(body.values) });
      return {
        ok: true,
        restarted,
        message: restarted ? 'Configuration saved, server restarted' : 'Configuration saved (applied on next restart)',
      };
    } catch (e) {
      return reply.code(e instanceof ConfigError ? 400 : 500).send({ error: errorMessage(e) });
    }
  });

  // Players

  app.get('/players', { preHandler: requirePermission('server.players') }, async () => {
    const online = poller.getOnlineRaw().map((p) => ({
      uid: p.userId,
      name: p.name,
      level: p.level,
      ping: Math.round(p.ping),
      ip: p.ip,
    }));
    const history = db
      .prepare(
        `SELECT p.uid, p.public_id AS publicId, p.name, p.level, p.online, p.first_seen AS firstSeen, p.last_seen AS lastSeen,
                p.playtime_seconds AS playtimeSeconds, u.username AS member
         FROM players p LEFT JOIN users u ON u.player_uid = p.uid
         ORDER BY p.online DESC, p.last_seen DESC LIMIT 500`,
      )
      .all();
    return { online, history };
  });

  // Logs

  app.get<{ Querystring: { lines?: string } }>('/logs', { preHandler: [requirePermission('server.logs'), requireManaged] }, async (req, reply) => {
    const lines = Math.min(2000, Math.max(1, Number(req.query.lines) || 300));
    try {
      return { lines: (await runPalctl(['logs', String(lines)])).split('\n').filter(Boolean) };
    } catch (e) {
      return reply.code(500).send({ error: errorMessage(e) });
    }
  });

  // Server connection (existing server)

  const connection = { preHandler: requirePermission('server.config') };

  app.get('/connection', connection, async () => {
    const ext = getExternalServer();
    return {
      mode: getServerMode(),
      // The password is never sent back: only whether it is set.
      external: ext ? { ...ext, adminPassword: '', hasPassword: !!ext.adminPassword } : null,
    };
  });

  app.post('/connection/test', connection, async (req, reply) => {
    const body = parse(connectionTestSchema.partial({ adminPassword: true }), req.body, reply);
    if (!body) return;
    const password = body.adminPassword || getExternalServer()?.adminPassword || '';
    return testConnection({ host: body.apiHost, port: body.apiPort, password });
  });

  app.put('/connection', connection, async (req, reply) => {
    if (isManaged()) return reply.code(409).send({ error: 'The server is installed and run by PalCMS on this VPS' });
    const body = parse(externalServerSchema.extend({ adminPassword: externalServerSchema.shape.adminPassword.or(z.literal('')) }), req.body, reply);
    if (!body) return;
    // Password left empty: keep the saved one.
    const adminPassword = body.adminPassword || getExternalServer()?.adminPassword;
    if (!adminPassword) return reply.code(400).send({ error: 'Admin password is required' });
    saveExternalServer({ ...body, adminPassword });
    setServerMode('external');
    poller.reset();
    audit(req, 'server.connect', `${body.apiHost}:${body.apiPort}`);
    return { ok: true };
  });

  app.delete('/connection', connection, async (req, reply) => {
    if (isManaged()) return reply.code(409).send({ error: 'The server is installed and run by PalCMS on this VPS' });
    saveExternalServer(null);
    setServerMode('none');
    poller.reset();
    audit(req, 'server.disconnect');
    return { ok: true };
  });
}
