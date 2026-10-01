import { palworldConnection, type PalworldConnection } from '../core/site';

/**
 * Client for the official REST API of the Palworld dedicated server (http://host:8212/v1/api/...).
 * The server may be installed by PalCMS (127.0.0.1) or live elsewhere (external server).
 */

export interface PalInfo {
  version: string;
  servername: string;
  description: string;
  worldguid?: string;
}

export interface PalMetrics {
  serverfps: number;
  currentplayernum: number;
  serverframetime: number;
  maxplayernum: number;
  uptime: number;
  days?: number;
  basecampnum?: number;
}

export interface PalPlayer {
  name: string;
  accountName: string;
  playerId: string;
  userId: string;
  ip: string;
  ping: number;
  location_x: number;
  location_y: number;
  level: number;
  building_count: number;
}

export class PalworldApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
  ) {
    super(message);
  }
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  conn: PalworldConnection | null = palworldConnection(),
): Promise<T> {
  if (!conn) throw new PalworldApiError('No Palworld server connected', null);
  const auth = Buffer.from(`admin:${conn.password}`).toString('base64');
  // An IPv6 address must be in brackets in a URL.
  const host = conn.host.includes(':') && !conn.host.startsWith('[') ? `[${conn.host}]` : conn.host;
  let res: Response;
  try {
    res = await fetch(`http://${host}:${conn.port}/v1/api/${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    throw new PalworldApiError('Palworld server unreachable', null);
  }
  if (res.status === 401) throw new PalworldApiError('Admin password refused by the Palworld API', 401);
  if (!res.ok) throw new PalworldApiError(`Palworld API: error ${res.status}`, res.status);
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/** Tests a REST API connection (e.g. existing server entered by the admin) without saving it. */
export async function testConnection(conn: PalworldConnection): Promise<{ ok: true; info: PalInfo } | { ok: false; error: string; hint: string }> {
  try {
    return { ok: true, info: await call<PalInfo>('GET', 'info', undefined, conn) };
  } catch (e) {
    const err = e as PalworldApiError;
    const hint =
      err.status === 401
        ? 'Check the admin password (AdminPassword).'
        : err.status === null
          ? 'Check the address, the port, that RESTAPIEnabled=True on the server and that this port can be reached from this VPS.'
          : '';
    return { ok: false, error: err.message, hint };
  }
}

export const palworld = {
  info: () => call<PalInfo>('GET', 'info'),
  metrics: () => call<PalMetrics>('GET', 'metrics'),
  players: async () => (await call<{ players: PalPlayer[] }>('GET', 'players')).players ?? [],
  settings: () => call<Record<string, unknown>>('GET', 'settings'),
  announce: (message: string) => call<void>('POST', 'announce', { message }),
  kick: (userid: string, message: string) => call<void>('POST', 'kick', { userid, message }),
  ban: (userid: string, message: string) => call<void>('POST', 'ban', { userid, message }),
  unban: (userid: string) => call<void>('POST', 'unban', { userid }),
  save: () => call<void>('POST', 'save'),
  shutdown: (waittime: number, message: string) => call<void>('POST', 'shutdown', { waittime, message }),
};
