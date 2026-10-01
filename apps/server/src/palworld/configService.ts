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
 * Edits PalWorldSettings.ini. Keys managed by the CMS (REST API) are ignored.
 * Changing the port, max players or admin password requires a restart.
 */
export async function updateConfig(
  values: Record<string, string | number | boolean>,
  restart: boolean,
): Promise<{ restarted: boolean }> {
  const pal = getPalworldConfig();
  if (!pal) throw new ConfigError('Server not configured');
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
  if (port < 1024 || port > 65535 || port === pal.restApiPort) throw new ConfigError('Invalid game port');
  if (maxPlayers < 1 || maxPlayers > 32) throw new ConfigError('Max players: between 1 and 32');

  await runPalctl(['write-config'], { input: serializeOptionSettings(entries) });

  const portChanged = before.port !== JSON.stringify(getValue(entries, 'PublicPort'));
  const playersChanged = before.players !== JSON.stringify(getValue(entries, 'ServerPlayerMaxNum'));
  const passwordChanged = before.adminPassword !== JSON.stringify(getValue(entries, 'AdminPassword'));
  if (portChanged || playersChanged) {
    await runPalctl(['write-service', String(port), String(maxPlayers)]);
    if (portChanged) await runPalctl(['firewall-open', String(port)]);
  }

  // The CMS uses the admin password to talk to the API: changing it requires a restart.
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
