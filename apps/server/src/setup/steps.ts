import os from 'node:os';
import { config } from '../config';
import { getPalworldConfig } from '../core/site';
import { buildIniFromSetup } from '../palworld/iniConfig';
import { runPalctl } from '../palworld/palctl';
import { palworld } from '../palworld/restClient';
import type { TaskContext, TaskDef } from './taskRunner';

const MIN = 60_000;

function requirePal() {
  const pal = getPalworldConfig();
  if (!pal) throw new Error('Server form not filled in');
  return pal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Palworld server install steps, in order. Each one can safely run again. Labels and logs are translated on display. */
export const INSTALL_STEPS: TaskDef[] = [
  {
    id: 'check-system',
    label: 'Checking the system',
    async run(ctx: TaskContext) {
      const memGb = os.totalmem() / 1024 ** 3;
      ctx.log(`System: ${os.type()} ${os.release()} (${os.arch()})`);
      ctx.log(`CPUs: ${os.cpus().length} — Memory: ${memGb.toFixed(1)} GB`);
      if (memGb < 7.5) ctx.log('⚠ Less than 8 GB of RAM: the Palworld server may run out of memory.');
      else if (memGb < 15) ctx.log('ℹ 16 GB of RAM is recommended for more than 8 players.');
    },
  },
  {
    id: 'install-deps',
    label: 'Installing SteamCMD and dependencies',
    async run(ctx) {
      await runPalctl(['install-deps'], { onLine: ctx.log, timeoutMs: 30 * MIN });
    },
  },
  {
    id: 'install-palworld',
    label: 'Downloading the Palworld server (several GB)',
    async run(ctx) {
      await runPalctl(['install-palworld'], { onLine: ctx.log, timeoutMs: 90 * MIN });
    },
  },
  {
    id: 'write-config',
    label: 'Writing PalWorldSettings.ini',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['write-config'], { onLine: ctx.log, input: buildIniFromSetup(pal, undefined, new URL(config.publicUrl).hostname) });
      ctx.log('Configuration written (REST API enabled, local access only).');
    },
  },
  {
    id: 'create-service',
    label: 'Creating the palworld service',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['write-service', String(pal.port), String(pal.maxPlayers)], { onLine: ctx.log });
      await runPalctl(['service', 'enable'], { onLine: ctx.log });
    },
  },
  {
    id: 'open-firewall',
    label: 'Opening the game port in the firewall',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['firewall-open', String(pal.port)], { onLine: ctx.log });
    },
  },
  {
    id: 'start-server',
    label: 'Starting and checking the server',
    async run(ctx) {
      await runPalctl(['service', 'restart'], { onLine: ctx.log, timeoutMs: 2 * MIN });
      ctx.log('Waiting for the REST API to answer (may take 1 to 2 minutes on first start)…');
      const deadline = Date.now() + 5 * MIN;
      let lastError = '';
      while (Date.now() < deadline) {
        try {
          const info = await palworld.info();
          ctx.log(`✔ Server online: "${info.servername}" (version ${info.version})`);
          return;
        } catch (e) {
          lastError = (e as Error).message;
          await sleep(5000);
        }
      }
      throw new Error(`The server does not answer after 5 minutes (${lastError})`);
    },
  },
];

/** Steps to run again when the server form is changed afterwards. */
export const CONFIG_DEPENDENT_STEPS = ['write-config', 'create-service', 'open-firewall', 'start-server'];
