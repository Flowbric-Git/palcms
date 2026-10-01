// State shared by the fake palctl and the fake Palworld server (development only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.dev-data');
fs.mkdirSync(DEV_DIR, { recursive: true });

const STATE_FILE = path.join(DEV_DIR, 'state.json');
export const INI_FILE = path.join(DEV_DIR, 'PalWorldSettings.ini');
export const LOG_FILE = path.join(DEV_DIR, 'palworld.log');

const DEFAULT = { depsInstalled: false, palworldInstalled: false, service: { active: false, enabled: false, port: 8211, players: 32 } };

export function readState() {
  try {
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch {
    return structuredClone(DEFAULT);
  }
}

export function writeState(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

export function appendLog(line) {
  fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} palworld[4242]: ${line}\n`);
}

/** Reads AdminPassword and RESTAPIPort from the simulated ini. */
export function readIniBasics() {
  try {
    const ini = fs.readFileSync(INI_FILE, 'utf8');
    const pwd = /AdminPassword="([^"]*)"/.exec(ini)?.[1] ?? '';
    const port = Number(/RESTAPIPort=(\d+)/.exec(ini)?.[1] ?? 8212);
    const name = /ServerName="([^"]*)"/.exec(ini)?.[1] ?? 'Dev server';
    const max = Number(/ServerPlayerMaxNum=(\d+)/.exec(ini)?.[1] ?? 32);
    return { adminPassword: pwd, restPort: port, serverName: name, maxPlayers: max };
  } catch {
    return null;
  }
}
