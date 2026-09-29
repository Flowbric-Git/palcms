import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '../config';
import { validatePalctlArgs } from './palctlArgs';

export class PalctlError extends Error {
  constructor(
    message: string,
    public code: number,
    public output: string,
  ) {
    super(message);
  }
}

interface RunOptions {
  onLine?: (line: string) => void;
  input?: string;
  timeoutMs?: number;
}

const MAX_OUTPUT = 512 * 1024;

function start(args: string[]): ChildProcess {
  const err = validatePalctlArgs(args);
  if (err) throw new Error(err);
  const [cmd, ...pre] = config.palctl;
  return spawn(cmd, [...pre, ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
}

function lineSplitter(onLine: (l: string) => void) {
  let buf = '';
  return {
    push(chunk: Buffer) {
      buf += chunk.toString('utf8');
      // steamcmd réécrit sa progression avec \r : on le traite comme une fin de ligne.
      const parts = buf.split(/\r\n|\n|\r/);
      buf = parts.pop() ?? '';
      for (const p of parts) if (p.trim()) onLine(p);
    },
    flush() {
      if (buf.trim()) onLine(buf);
      buf = '';
    },
  };
}

/** Exécute une commande palctl et attend sa fin. Lève PalctlError si le code de sortie n'est pas 0. */
export function runPalctl(args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = start(args);
    } catch (e) {
      return reject(e);
    }
    let output = '';
    const onLine = (l: string) => {
      if (output.length < MAX_OUTPUT) output += l + '\n';
      opts.onLine?.(l);
    };
    const out = lineSplitter(onLine);
    const err = lineSplitter(onLine);
    child.stdout?.on('data', out.push);
    child.stderr?.on('data', err.push);

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM');
        }, opts.timeoutMs)
      : null;

    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(new PalctlError(`Impossible de lancer palctl : ${e.message}`, -1, output));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      out.flush();
      err.flush();
      if (code === 0) resolve(output);
      else reject(new PalctlError(`palctl ${args[0]} a échoué (code ${code})`, code ?? -1, output));
    });

    if (opts.input !== undefined) child.stdin?.end(opts.input);
    else child.stdin?.end();
  });
}

/**
 * Sortie complète d'une commande palctl (ex. export JSON du monde, plusieurs Mo),
 * sans la limite de runPalctl. Lève PalctlError avec la fin de stderr si la commande échoue.
 */
export function capturePalctl(args: string[], opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<Buffer> {
  const maxBytes = opts.maxBytes ?? 256 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = start(args);
    } catch (e) {
      return reject(e);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) child.kill('SIGTERM');
      else chunks.push(c);
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString('utf8')).slice(-4000);
    });
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs) : null;
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(new PalctlError(`Impossible de lancer palctl : ${e.message}`, -1, stderr));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new PalctlError(stderr.trim().split('\n').pop() || `palctl ${args[0]} a échoué (code ${code})`, code ?? -1, stderr));
    });
    child.stdin?.end();
  });
}

/** Sortie binaire brute d'une commande palctl (ex. téléchargement d'une sauvegarde). */
export function palctlRawStream(args: string[]): NodeJS.ReadableStream {
  const child = start(args);
  child.stdin?.end();
  child.stderr?.resume();
  return child.stdout!;
}

/** Lance une commande palctl longue (ex. suivi des logs). Renvoie une fonction d'arrêt. */
export function streamPalctl(args: string[], onLine: (line: string) => void, onExit?: () => void): () => void {
  const child = start(args);
  const out = lineSplitter(onLine);
  const err = lineSplitter(onLine);
  child.stdout?.on('data', out.push);
  child.stderr?.on('data', err.push);
  child.on('error', () => onExit?.());
  child.on('close', () => onExit?.());
  child.stdin?.end();
  return () => {
    if (child.exitCode === null) child.kill('SIGTERM');
  };
}
