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
  if (!pal) throw new Error('Formulaire du serveur non rempli');
  return pal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Étapes d'installation du serveur Palworld, dans l'ordre. Toutes sont rejouables sans danger. */
export const INSTALL_STEPS: TaskDef[] = [
  {
    id: 'check-system',
    label: 'Vérification du système',
    async run(ctx: TaskContext) {
      const memGb = os.totalmem() / 1024 ** 3;
      ctx.log(`Système : ${os.type()} ${os.release()} (${os.arch()})`);
      ctx.log(`Processeurs : ${os.cpus().length} — Mémoire : ${memGb.toFixed(1)} Go`);
      if (memGb < 7.5) ctx.log('⚠ Moins de 8 Go de RAM : le serveur Palworld risque de manquer de mémoire.');
      else if (memGb < 15) ctx.log('ℹ 16 Go de RAM sont conseillés pour plus de 8 joueurs.');
    },
  },
  {
    id: 'install-deps',
    label: 'Installation de SteamCMD et des dépendances',
    async run(ctx) {
      await runPalctl(['install-deps'], { onLine: ctx.log, timeoutMs: 30 * MIN });
    },
  },
  {
    id: 'install-palworld',
    label: 'Téléchargement du serveur Palworld (plusieurs Go)',
    async run(ctx) {
      await runPalctl(['install-palworld'], { onLine: ctx.log, timeoutMs: 90 * MIN });
    },
  },
  {
    id: 'write-config',
    label: 'Écriture de PalWorldSettings.ini',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['write-config'], { onLine: ctx.log, input: buildIniFromSetup(pal, undefined, new URL(config.publicUrl).hostname) });
      ctx.log('Configuration écrite (API REST activée, accessible en local uniquement).');
    },
  },
  {
    id: 'create-service',
    label: 'Création du service palworld',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['write-service', String(pal.port), String(pal.maxPlayers)], { onLine: ctx.log });
      await runPalctl(['service', 'enable'], { onLine: ctx.log });
    },
  },
  {
    id: 'open-firewall',
    label: 'Ouverture du port de jeu dans le pare-feu',
    async run(ctx) {
      const pal = requirePal();
      await runPalctl(['firewall-open', String(pal.port)], { onLine: ctx.log });
    },
  },
  {
    id: 'start-server',
    label: 'Démarrage et vérification du serveur',
    async run(ctx) {
      await runPalctl(['service', 'restart'], { onLine: ctx.log, timeoutMs: 2 * MIN });
      ctx.log("Attente de la réponse de l'API REST (peut prendre 1 à 2 minutes au premier lancement)…");
      const deadline = Date.now() + 5 * MIN;
      let lastError = '';
      while (Date.now() < deadline) {
        try {
          const info = await palworld.info();
          ctx.log(`✔ Serveur en ligne : « ${info.servername} » (version ${info.version})`);
          return;
        } catch (e) {
          lastError = (e as Error).message;
          await sleep(5000);
        }
      }
      throw new Error(`Le serveur ne répond pas après 5 minutes (${lastError})`);
    },
  },
];

/** Étapes à rejouer si le formulaire du serveur est modifié après coup. */
export const CONFIG_DEPENDENT_STEPS = ['write-config', 'create-service', 'open-firewall', 'start-server'];
