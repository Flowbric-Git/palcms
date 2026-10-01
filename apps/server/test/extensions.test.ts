import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { satisfiesVersion, type FeatureHost } from '@palcms/shared';

// Temporary database and extensions folder, before any import that opens the database.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'palcms-ext-'));
process.env.DATA_DIR = tmp;
process.env.PALCMS_VERSION = '1.0.1';

const { readPackage, verifySignature, sha256 } = await import('../src/extensions/package');
const store = await import('../src/extensions/store');
const { PluginRuntime } = await import('../src/extensions/plugins');
const { annotate } = await import('../src/extensions/market');
const { db, runMigrations, settings } = await import('../src/db');
const { CORE_MIGRATIONS } = await import('../src/core/migrations');

const manifest = (extra: Record<string, unknown> = {}) => ({ id: 'demo', type: 'plugin', name: 'Demo', version: '1.0.0', ...extra });

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

const SERVER_JS = `
export default function (pal) {
  pal.migrate([{ id: '001', sql: 'CREATE TABLE plugin_demo_hits (n INTEGER)' }]);
  pal.route({ method: 'GET', path: 'hello/:name', access: 'public', handler: ({ params }) => ({ hello: params.name, greeting: pal.config().greeting }) });
  pal.onStop(() => { globalThis.__demoStopped = true; });
}`;

describe('compatible versions', () => {
  it('reads simple constraints', () => {
    expect(satisfiesVersion('1.0.1', '>=1.0.1')).toBe(true);
    expect(satisfiesVersion('1.0.0', '>=1.0.1')).toBe(false);
    expect(satisfiesVersion('1.4.0', '>=1.0.1 <2.0.0')).toBe(true);
    expect(satisfiesVersion('2.0.0', '>=1.0.1 <2.0.0')).toBe(false);
    expect(satisfiesVersion('1.2.0', '^1.0.0')).toBe(true);
    expect(satisfiesVersion('2.1.0', '^1.0.0')).toBe(false);
    expect(satisfiesVersion('1.0.1', undefined)).toBe(true);
    expect(satisfiesVersion('1.0.1', 'anything')).toBe(false);
  });
});

describe('reading packages', () => {
  it('accepts a valid package, even inside a folder', () => {
    const pkg = readPackage(zip({ 'demo/palcms.json': JSON.stringify(manifest()), 'demo/web.js': 'export default () => {}' }));
    expect(pkg.manifest.id).toBe('demo');
    expect([...pkg.files.keys()].sort()).toEqual(['palcms.json', 'web.js']);
  });

  it('refuses dangerous paths and unexpected files', () => {
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()), '../evil.js': 'x' }))).toThrow(/Forbidden path/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()), 'web.js': 'x', 'page.html': 'x' }))).toThrow(/not allowed/);
  });

  it('checks the manifest', () => {
    expect(() => readPackage(zip({ 'web.js': 'x' }))).toThrow(/palcms.json not found/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'Not Good' })), 'web.js': 'x' }))).toThrow(/Invalid id/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'market' })), 'web.js': 'x' }))).toThrow(/reserved/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ type: 'theme' })), 'server.js': 'x' }))).toThrow(/theme/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()) }))).toThrow(/neither server.js/);
    expect(() => readPackage(strToU8('not a zip'))).toThrow(/Unreadable/);
  });
});

describe('market signature', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const data = zip({ 'palcms.json': JSON.stringify(manifest()), 'web.js': 'x' });
  const sig = crypto.sign(null, data, privateKey).toString('base64');

  it('accepts a package signed by a trusted key', () => {
    expect(verifySignature(data, sig, [pub])).toBe(true);
  });

  it('refuses a modified package or another key', () => {
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const changed = new Uint8Array(data);
    changed[changed.length - 5] ^= 1;
    expect(verifySignature(changed, sig, [pub])).toBe(false);
    expect(verifySignature(data, sig, [other])).toBe(false);
    expect(verifySignature(data, 'abc', [pub])).toBe(false);
  });

  it('computes the SHA-256 fingerprint', () => {
    expect(sha256(data)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('install and plugins', () => {
  beforeAll(() => {
    runMigrations(CORE_MIGRATIONS);
  });
  afterAll(() => {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const host = {
    version: '1.0.1',
    db,
    settings,
    runMigrations: (list: { id: string; sql: string }[]) => runMigrations(list),
    events: { on: () => () => {}, emit: () => {} },
  } as unknown as FeatureHost;

  const pluginZip = (version: string) =>
    zip({
      'palcms.json': JSON.stringify(manifest({ version, settings: [{ key: 'greeting', type: 'text', label: 'Salut', default: 'bonjour' }] })),
      'server.js': SERVER_JS,
      'web.js': 'export default () => {}',
    });

  it('installs a package turned off, then loads it once turned on', async () => {
    const ext = store.installFromZip(pluginZip('1.0.0'), { source: 'upload', verified: false });
    expect(ext).toMatchObject({ id: 'demo', enabled: false, verified: false, hasServer: true, hasWeb: true, compatible: true });
    expect(store.bootExtensions().plugins).toEqual([]);

    const rt = new PluginRuntime(host);
    await rt.start();
    expect(rt.isLoaded('demo')).toBe(false);

    store.setEnabled('demo', true);
    await rt.sync();
    expect(rt.isLoaded('demo')).toBe(true);
    const route = rt.routes('demo').find((r) => r.path === 'hello/:name')!;
    expect(await route.handler({ params: { name: 'Lamball' } } as never)).toEqual({ hello: 'Lamball', greeting: 'bonjour' });
    expect(db.prepare("SELECT 1 FROM migrations WHERE id = 'plugin:demo:001'").get()).toBeTruthy();
    expect(store.bootExtensions().plugins).toMatchObject([{ id: 'demo', version: '1.0.0', web: true, css: false }]);

    store.saveExtensionSettings('demo', { greeting: 'salut', inconnu: 'x' });
    expect(await route.handler({ params: { name: 'A' } } as never)).toEqual({ hello: 'A', greeting: 'salut' });

    // Update: the old version is stopped, then the new one is loaded.
    store.installFromZip(pluginZip('1.1.0'), { source: 'upload', verified: false });
    await rt.sync();
    expect((globalThis as { __demoStopped?: boolean }).__demoStopped).toBe(true);
    expect(store.getExtension('demo')?.version).toBe('1.1.0');
    expect(rt.isLoaded('demo')).toBe(true);

    store.setEnabled('demo', false);
    await rt.sync();
    expect(rt.isLoaded('demo')).toBe(false);
    rt.stop();
  });

  it('reports the error of a broken plugin without crashing', async () => {
    store.installFromZip(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'broken' })), 'server.js': 'export default () => { throw new Error("boom") }' }), {
      source: 'upload',
      verified: false,
    });
    store.setEnabled('broken', true);
    const rt = new PluginRuntime(host);
    await rt.start();
    expect(rt.isLoaded('broken')).toBe(false);
    expect(store.getExtension('broken')?.error).toBe('boom');
    rt.stop();
  });

  it('turns on a theme and exposes its settings', () => {
    store.installFromZip(
      zip({
        'palcms.json': JSON.stringify({
          id: 'nuit',
          type: 'theme',
          name: 'Nuit',
          version: '1.0.0',
          settings: [
            { key: 'couleur', type: 'color', label: 'Couleur', default: '#112233' },
            { key: 'style', type: 'select', label: 'Style', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
          ],
        }),
        'style.css': 'body{}',
      }),
      { source: 'market', verified: true },
    );
    store.setActiveTheme('nuit');
    store.saveExtensionSettings('nuit', { couleur: 'red; }', style: 'z' });
    expect(store.bootExtensions().theme).toMatchObject({ id: 'nuit', version: '1.0.0', web: false, css: true, settings: { couleur: '#112233', style: 'a' } });
    store.saveExtensionSettings('nuit', { couleur: '#abcdef', style: 'b' });
    expect(store.bootExtensions().theme?.settings).toEqual({ couleur: '#abcdef', style: 'b' });

    store.removeExtension('nuit');
    expect(store.bootExtensions().theme).toBeNull();
    expect(fs.existsSync(path.join(tmp, 'extensions', 'nuit'))).toBe(false);
  });

  it('refuses an extension made for another PalCMS version', () => {
    store.installFromZip(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'futur', palcms: '>=2.0.0' })), 'web.js': 'x' }), {
      source: 'upload',
      verified: false,
    });
    expect(store.getExtension('futur')?.compatible).toBe(false);
    expect(() => store.setEnabled('futur', true)).toThrow(/incompatible/);
  });

  it('compares the market catalogue with the installed extensions', () => {
    const base = { type: 'plugin' as const, name: 'x', summary: '', author: '', download: 'https://x/y.zip', sha256: 'a'.repeat(64), signature: 's' };
    const list = annotate([
      { ...base, id: 'demo', version: '1.2.0' },
      { ...base, id: 'nouveau', version: '1.0.0', palcms: '>=9.0.0' },
    ]);
    expect(list[0]).toMatchObject({ installed: '1.1.0', update: true, compatible: true });
    expect(list[1]).toMatchObject({ installed: null, update: false, compatible: false });
  });
});
