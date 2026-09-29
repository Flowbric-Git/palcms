import { INI_LOCKED_KEYS } from '@palcms/shared';
import { getPalworldConfig, savePalworldConfig } from '../core/site';
import { decodeValue, forceCmsKeys, getValue, parseOptionSettings, serializeOptionSettings, setValue, type IniEntry } from './iniConfig';
import { runPalctl } from './palctl';
import { restartServer } from './service';

export class ConfigError extends Error {}

export async function readConfigEntries(): Promise<IniEntry[]> {
  return parseOptionSettings(await runPalctl(['read-config']));
}

export async function readConfigValues(): Promise<Record<string, string | number | boolean>> {
  return Object.fromEntries((await readConfigEntries()).map((e) => [e.key, decodeValue(e.raw).value]));
}

/**
 * Modifie PalWorldSettings.ini. Les clés gérées par le CMS (API REST) sont ignorées.
 * Un changement de port, de joueurs max ou de mot de passe admin impose un redémarrage.
 */
export async function updateConfig(
  values: Record<string, string | number | boolean>,
  restart: boolean,
): Promise<{ restarted: boolean }> {
  const pal = getPalworldConfig();
  if (!pal) throw new ConfigError('Serveur non configuré');
  const entries = await readConfigEntries();
  const before = {
    port: JSON.stringify(getValue(entries, 'PublicPort')),
    players: JSON.stringify(getValue(entries, 'ServerPlayerMaxNum')),
    adminPassword: JSON.stringify(getValue(entries, 'AdminPassword')),
  };
  for (const [key, value] of Object.entries(values)) {
    if (INI_LOCKED_KEYS.includes(key)) continue;
    setValue(entries, key, value);
  }
  forceCmsKeys(entries, pal.restApiPort);

  const num = (k: string, fallback: number) => {
    const v = getValue(entries, k);
    return v?.type === 'number' ? v.value : fallback;
  };
  const str = (k: string, fallback: string) => {
    const v = getValue(entries, k);
    return v?.type === 'string' ? v.value : fallback;
  };
  const port = num('PublicPort', pal.port);
  const maxPlayers = num('ServerPlayerMaxNum', pal.maxPlayers);
  if (port < 1024 || port > 65535 || port === pal.restApiPort) throw new ConfigError('Port de jeu invalide');
  if (maxPlayers < 1 || maxPlayers > 32) throw new ConfigError('Joueurs maximum : entre 1 et 32');

  await runPalctl(['write-config'], { input: serializeOptionSettings(entries) });

  const portChanged = before.port !== JSON.stringify(getValue(entries, 'PublicPort'));
  const playersChanged = before.players !== JSON.stringify(getValue(entries, 'ServerPlayerMaxNum'));
  const passwordChanged = before.adminPassword !== JSON.stringify(getValue(entries, 'AdminPassword'));
  if (portChanged || playersChanged) {
    await runPalctl(['write-service', String(port), String(maxPlayers)]);
    if (portChanged) await runPalctl(['firewall-open', String(port)]);
  }

  // Le CMS utilise le mot de passe admin pour parler à l'API : un changement impose un redémarrage.
  const mustRestart = restart || passwordChanged || portChanged || playersChanged;
  savePalworldConfig({
    ...pal,
    port,
    maxPlayers,
    adminPassword: str('AdminPassword', pal.adminPassword),
    serverName: str('ServerName', pal.serverName),
    serverPassword: str('ServerPassword', pal.serverPassword),
    description: str('ServerDescription', pal.description),
  });
  if (mustRestart) await restartServer();
  return { restarted: mustRestart };
}
