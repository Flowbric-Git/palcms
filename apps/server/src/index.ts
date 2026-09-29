import { config, setupTokenPath } from './config';
import { db, runMigrations } from './db';
import { CORE_MIGRATIONS } from './core/migrations';
import { isSetupDone } from './core/site';
import { purgeExpiredSessions } from './auth/sessions';
import { features, startFeatures, stopFeatures } from './features/runtime';
import { poller } from './palworld/poller';
import { setupRunner } from './setup/routes';
import { ensureSetupToken } from './setup/token';
import { buildApp } from './app';

runMigrations(CORE_MIGRATIONS);
setupRunner.recover();

features(); // routes et rôles disponibles dès le démarrage
if (isSetupDone()) {
  startFeatures();
  poller.start();
} else {
  const token = ensureSetupToken();
  const url = `${config.publicUrl}${config.basePath}setup`;
  console.log(
    [
      '',
      '  ┌────────────────────────────────────────────────────────┐',
      '  │  PalCMS : installation en attente                      │',
      '  └────────────────────────────────────────────────────────┘',
      `  Assistant : ${url}`,
      `  Jeton     : ${token}`,
      `  (enregistré dans ${setupTokenPath})`,
      '',
    ].join('\n'),
  );
}

setInterval(purgeExpiredSessions, 3600_000).unref();

const app = await buildApp();
await app.listen({ host: config.host, port: config.port });
console.log(`PalCMS ${config.version} à l'écoute sur http://${config.host}:${config.port}${config.basePath}`);

const shutdown = async () => {
  poller.stop();
  stopFeatures();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
