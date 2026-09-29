import { realtime } from '../core/realtime';
import { isManaged } from '../core/site';
import { runPalctl, streamPalctl } from './palctl';
import { palworld } from './restClient';

export type ServiceState = 'active' | 'inactive' | 'activating' | 'deactivating' | 'failed' | 'unknown';

const KNOWN: ServiceState[] = ['active', 'inactive', 'activating', 'deactivating', 'failed'];

function lastLine(s: string | undefined): string {
  return s?.trim().split('\n').pop()?.trim() ?? '';
}

export async function serviceState(): Promise<ServiceState> {
  let out: string;
  try {
    out = lastLine(await runPalctl(['service', 'is-active']));
  } catch (e) {
    // systemctl is-active renvoie un code non nul quand le service est arrêté.
    out = lastLine((e as { output?: string }).output);
  }
  return (KNOWN as string[]).includes(out) ? (out as ServiceState) : 'unknown';
}

/** Sauvegarde le monde avant un arrêt si l'API répond (sinon on arrête quand même). */
async function trySave(): Promise<void> {
  try {
    await palworld.save();
  } catch {
    /* serveur déjà arrêté ou injoignable */
  }
}

export async function startServer(): Promise<void> {
  await runPalctl(['service', 'start'], { timeoutMs: 60_000 });
}

export async function stopServer(): Promise<void> {
  await trySave();
  await runPalctl(['service', 'stop'], { timeoutMs: 120_000 });
}

export async function restartServer(): Promise<void> {
  await trySave();
  await runPalctl(['service', 'restart'], { timeoutMs: 120_000 });
}

// Logs en direct (canal « logs »)

let stopTail: (() => void) | null = null;

realtime.setHooks('logs', {
  onFirst: () => {
    if (!isManaged()) {
      realtime.broadcast('logs', { type: 'error', data: 'Logs indisponibles : le serveur n’est pas géré par PalCMS.' });
      return;
    }
    try {
      stopTail = streamPalctl(
        ['tail-logs'],
        (line) => realtime.broadcast('logs', { type: 'log', data: line }),
        () => {
          stopTail = null;
        },
      );
    } catch (e) {
      realtime.broadcast('logs', { type: 'error', data: (e as Error).message });
    }
  },
  onLast: () => {
    stopTail?.();
    stopTail = null;
  },
});
