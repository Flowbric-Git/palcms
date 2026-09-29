import type { CreateFeatures, FeatureRoute, Permission } from '@palcms/shared';
import { MIGRATIONS, MODULES } from './schema';
import { FeatureBus, httpError, type Feature } from './util';
import { createAudit, createTeam } from './team';
import { createLeaderboard, createMap, createStats } from './players';
import { createAnnouncements, createBackups, createSchedules } from './operations';
import { createDiscord, createModeration, createRcon, createThemes } from './community';
import { createWorld } from './world';
import { createMonitoring } from './monitoring';
import { createEvents } from './events';
import { createAntiCheat, createSanctions } from './sanctions';
import { createTickets } from './tickets';
import { createUpdates } from './updates';
import { createExtensions } from './extensions';

export { MIGRATIONS as FEATURE_MIGRATIONS, MODULES as FEATURE_MODULES };

/** Permissions dont les routes exigent un serveur installé et géré par PalCMS (palctl). */
const MANAGED_ONLY: Permission[] = ['server.backups', 'server.schedules'];

/** Assemble les fonctionnalités du CMS (carte, sauvegardes, équipe…) autour des services du cœur. */
export const createFeatures: CreateFeatures = (host) => {
  const bus = new FeatureBus();
  const team = createTeam(host);
  const backups = createBackups(host, bus);
  const world = createWorld(host, bus);
  const features: Feature[] = [
    world,
    createMonitoring(host, bus),
    createEvents(host, bus),
    createSanctions(host),
    createAntiCheat(host, bus, world),
    createTickets(host, bus),
    createUpdates(host, bus, backups),
    team,
    createAudit(host),
    createMap(host),
    createLeaderboard(host),
    createStats(host),
    backups,
    createSchedules(host, bus, backups),
    createAnnouncements(host),
    createModeration(host),
    createRcon(host),
    createDiscord(host, bus),
    createThemes(host),
    // En dernier : les plugins démarrent une fois toutes les fonctionnalités du CMS en place.
    createExtensions(host),
  ];

  return {
    version: host.version,
    modules: MODULES,
    migrations: MIGRATIONS,
    routes: features
      .flatMap((f) => f.routes ?? [])
      .map((r): FeatureRoute =>
        r.permission && MANAGED_ONLY.includes(r.permission)
          ? {
              ...r,
              handler: (ctx) => {
                if (host.server.mode() !== 'managed') {
                  throw httpError(409, 'Disponible uniquement pour un serveur installé par PalCMS sur ce VPS');
                }
                return r.handler(ctx);
              },
            }
          : r,
      ),
    hasPermission: team.hasPermission,
    start() {
      for (const f of features) f.start?.();
    },
    stop() {
      for (const f of features) f.stop?.();
    },
  };
};
