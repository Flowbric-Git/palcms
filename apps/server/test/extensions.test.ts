import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { satisfiesVersion, type FeatureHost } from '@palcms/shared';

// Base et dossier d'extensions temporaires, avant tout import qui ouvre la base.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'palcms-ext-'));
process.env.DATA_DIR = tmp;
process.env.PALCMS_VERSION = '1.0.1';

const { readPackage, verifySignature, sha256 } = await import('../src/extensions/package');
const store = await import('../src/extensions/store');
const { PluginRuntime } = await import('../src/extensions/plugins');
const { annotate } = await import('../src/extensions/market');
const { db, runMigrations, settings } = await import('../src/db');
const { CORE_MIGRATIONS } = await import('../src/core/migrations');

const manifest = (extra: Record<string, unknown> = {}) => ({ id: 'demo', type: 'plugin', name: 'Démo', version: '1.0.0', ...extra });

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

const SERVER_JS = `
export default function (pal) {
  pal.migrate([{ id: '001', sql: 'CREATE TABLE plugin_demo_hits (n INTEGER)' }]);
  pal.route({ method: 'GET', path: 'hello/:name', access: 'public', handler: ({ params }) => ({ hello: params.name, greeting: pal.config().greeting }) });
  pal.onStop(() => { globalThis.__demoStopped = true; });
}`;

describe('versions compatibles', () => {
  it('lit les contraintes simples', () => {
    expect(satisfiesVersion('1.0.1', '>=1.0.1')).toBe(true);
    expect(satisfiesVersion('1.0.0', '>=1.0.1')).toBe(false);
    expect(satisfiesVersion('1.4.0', '>=1.0.1 <2.0.0')).toBe(true);
    expect(satisfiesVersion('2.0.0', '>=1.0.1 <2.0.0')).toBe(false);
    expect(satisfiesVersion('1.2.0', '^1.0.0')).toBe(true);
    expect(satisfiesVersion('2.1.0', '^1.0.0')).toBe(false);
    expect(satisfiesVersion('1.0.1', undefined)).toBe(true);
    expect(satisfiesVersion('1.0.1', 'n’importe quoi')).toBe(false);
  });
});

describe('lecture des paquets', () => {
  it('accepte un paquet valide, même rangé dans un dossier', () => {
    const pkg = readPackage(zip({ 'demo/palcms.json': JSON.stringify(manifest()), 'demo/web.js': 'export default () => {}' }));
    expect(pkg.manifest.id).toBe('demo');
    expect([...pkg.files.keys()].sort()).toEqual(['palcms.json', 'web.js']);
  });

  it('refuse les chemins dangereux et les fichiers inattendus', () => {
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()), '../evil.js': 'x' }))).toThrow(/interdit/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()), 'web.js': 'x', 'page.html': 'x' }))).toThrow(/non autorisé/);
  });

  it('vérifie le manifeste', () => {
    expect(() => readPackage(zip({ 'web.js': 'x' }))).toThrow(/palcms.json introuvable/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'Pas Bon' })), 'web.js': 'x' }))).toThrow(/Identifiant/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'market' })), 'web.js': 'x' }))).toThrow(/réservé/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest({ type: 'theme' })), 'server.js': 'x' }))).toThrow(/thème/);
    expect(() => readPackage(zip({ 'palcms.json': JSON.stringify(manifest()) }))).toThrow(/ni server.js/);
    expect(() => readPackage(strToU8('pas un zip'))).toThrow(/illisible/);
  });
});

describe('signature du market', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const data = zip({ 'palcms.json': JSON.stringify(manifest()), 'web.js': 'x' });
  const sig = crypto.sign(null, data, privateKey).toString('base64');

  it('accepte un paquet signé par une clé de confiance', () => {
    expect(verifySignature(data, sig, [pub])).toBe(true);
  });

  it('refuse un paquet modifié ou une autre clé', () => {
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const changed = new Uint8Array(data);
    changed[changed.length - 5] ^= 1;
    expect(verifySignature(changed, sig, [pub])).toBe(false);
    expect(verifySignature(data, sig, [other])).toBe(false);
    expect(verifySignature(data, 'abc', [pub])).toBe(false);
  });

  it('calcule l’empreinte SHA-256', () => {
    expect(sha256(data)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('installation et plugins', () => {
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

  it('installe un paquet désactivé, puis le charge une fois activé', async () => {
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

    // Mise à jour : l'ancienne version est arrêtée puis la nouvelle chargée.
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

  it('signale l’erreur d’un plugin cassé sans planter', async () => {
    store.installFromZip(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'casse' })), 'server.js': 'export default () => { throw new Error("boum") }' }), {
      source: 'upload',
      verified: false,
    });
    store.setEnabled('casse', true);
    const rt = new PluginRuntime(host);
    await rt.start();
    expect(rt.isLoaded('casse')).toBe(false);
    expect(store.getExtension('casse')?.error).toBe('boum');
    rt.stop();
  });

  it('active un thème et expose ses réglages', () => {
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

  it('refuse une extension prévue pour une autre version de PalCMS', () => {
    store.installFromZip(zip({ 'palcms.json': JSON.stringify(manifest({ id: 'futur', palcms: '>=2.0.0' })), 'web.js': 'x' }), {
      source: 'upload',
      verified: false,
    });
    expect(store.getExtension('futur')?.compatible).toBe(false);
    expect(() => store.setEnabled('futur', true)).toThrow(/incompatible/);
  });

  it('compare le catalogue du market aux extensions installées', () => {
    const base = { type: 'plugin' as const, name: 'x', summary: '', author: '', download: 'https://x/y.zip', sha256: 'a'.repeat(64), signature: 's' };
    const list = annotate([
      { ...base, id: 'demo', version: '1.2.0' },
      { ...base, id: 'nouveau', version: '1.0.0', palcms: '>=9.0.0' },
    ]);
    expect(list[0]).toMatchObject({ installed: '1.1.0', update: true, compatible: true });
    expect(list[1]).toMatchObject({ installed: null, update: false, compatible: false });
  });
});
