// Demo: extension packages downloaded from the real market (or uploaded), kept in the browser.
// The zip is stored in IndexedDB, unzipped when the site starts, and its files are served as blob: addresses.

import { unzipSync } from 'fflate';
import type { ExtensionManifest } from '@palcms/shared';
import { demoFiles } from '../lib/extensions';

const DB = 'palcms-demo-packages';
const STORE = 'zips';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const savePackage = (id: string, zip: Uint8Array) => tx('readwrite', (s) => s.put(zip, id));
export const deletePackage = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearPackages = () => tx('readwrite', (s) => s.clear());

export interface DemoPackage {
  manifest: ExtensionManifest;
  hasServer: boolean;
  hasWeb: boolean;
  hasCss: boolean;
}

/** Reads and checks a package (same rules as the server for what the demo needs). */
export function readPackage(zip: Uint8Array): DemoPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new Error('Invalid package: this is not a zip file');
  }
  if (!files['palcms.json']) throw new Error('Invalid package: palcms.json is missing');
  const manifest = JSON.parse(new TextDecoder().decode(files['palcms.json'])) as ExtensionManifest;
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(manifest.id ?? '') || !['plugin', 'theme'].includes(manifest.type)) {
    throw new Error('Invalid package: palcms.json');
  }
  return { manifest, hasServer: !!files['server.js'], hasWeb: !!files['web.js'], hasCss: !!files['style.css'] };
}

export async function sha256(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TYPES: Record<string, string> = {
  js: 'text/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
};
const blobUrl = (data: Uint8Array | string, name: string) =>
  URL.createObjectURL(new Blob([data as BlobPart], { type: TYPES[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' }));

/** Unzips every stored package and fills the file addresses used by the extension loader. */
export async function prepareFiles(): Promise<void> {
  let ids: IDBValidKey[];
  try {
    ids = await tx('readonly', (s) => s.getAllKeys());
  } catch {
    return; // IndexedDB unavailable (private browsing): extensions from the market do not load
  }
  for (const id of ids as string[]) {
    try {
      const files = unzipSync((await tx('readonly', (s) => s.get(id))) as Uint8Array);
      const assets = new Map<string, string>();
      for (const [name, data] of Object.entries(files)) {
        if (!name.startsWith('assets/') || name.endsWith('/')) continue;
        const u = blobUrl(data, name);
        assets.set(name, u);
        demoFiles.set(`${id}/${name}`, u);
      }
      if (files['web.js']) demoFiles.set(`${id}/web.js`, blobUrl(files['web.js'], 'web.js'));
      if (files['style.css']) {
        // A blob: stylesheet has no folder: its url(./assets/…) point to the unzipped files.
        const css = new TextDecoder()
          .decode(files['style.css'])
          .replace(/url\(\s*(['"]?)(?:\.\/)?(assets\/[^'")]+)\1\s*\)/g, (m, _q, p: string) => (assets.has(p) ? `url("${assets.get(p)}")` : m));
        demoFiles.set(`${id}/style.css`, blobUrl(css, 'style.css'));
      }
    } catch (e) {
      console.error(`[demo] ${id}:`, e);
    }
  }
}
