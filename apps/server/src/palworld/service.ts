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
    // systemctl is-active returns a non-zero code when the service is stopped.
    out = lastLine((e as { output?: string }).output);
  }
  return (KNOWN as string[]).includes(out) ? (out as ServiceState) : 'unknown';
}

/** Saves the world before a stop if the API answers (stops anyway otherwise). */
async function trySave(): Promise<void> {
  try {
    await palworld.save();
  } catch {
    /* server already stopped or unreachable */
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

// Live logs ("logs" channel)

let stopTail: (() => void) | null = null;

realtime.setHooks('logs', {
  onFirst: () => {
    if (!isManaged()) {
      realtime.broadcast('logs', { type: 'error', data: 'Logs unavailable: the server is not run by PalCMS.' });
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
