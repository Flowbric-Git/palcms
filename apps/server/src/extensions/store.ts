import fs from 'node:fs';
import path from 'node:path';
import {
  EXTENSION_ID_RE,
  satisfiesVersion,
  type BootExtensions,
  type ExtensionManifest,
  type ExtensionSettingDef,
  type ExtensionSettingValues,
  type ExtensionSource,
  type ExtensionType,
  type InstalledExtension,
} from '@palcms/shared';
import { config } from '../config';
import { db, runMigrations, settings } from '../db';
import { manifestSchema, readPackage, PackageError, type ExtensionPackage } from './package';

runMigrations([
  {
    id: 'core:004-extensions',
    sql: `
      CREATE TABLE extensions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        version TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        verified INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        installed_at INTEGER NOT NULL
      );
    `,
  },
]);

interface Row {
  id: string;
  type: ExtensionType;
  version: string;
  enabled: number;
  verified: number;
  source: ExtensionSource;
  installed_at: number;
}

const ACTIVE_THEME = 'extensions.theme';
const settingsKey = (id: string) => `extensions.settings.${id}`;

/** Folder of installed extensions (one sub-folder per extension). */
export function extensionsDir(): string {
  return path.join(config.dataDir, 'extensions');
}

export function extensionPath(id: string, file = ''): string {
  if (!EXTENSION_ID_RE.test(id)) throw new PackageError('Invalid id');
  return path.join(extensionsDir(), id, file);
}

const manifests = new Map<string, { mtime: number; manifest: ExtensionManifest | null }>();

/** Manifest of an installed extension (read again only when the file changed). */
export function readManifest(id: string): ExtensionManifest | null {
  const file = extensionPath(id, 'palcms.json');
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const cached = manifests.get(id);
  if (cached && cached.mtime === mtime) return cached.manifest;
  let manifest: ExtensionManifest | null = null;
  try {
    const res = manifestSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    manifest = res.success && res.data.id === id ? (res.data as ExtensionManifest) : null;
  } catch {
    manifest = null;
  }
  manifests.set(id, { mtime, manifest });
  return manifest;
}

const has = (id: string, file: string) => fs.existsSync(extensionPath(id, file));
const rows = () => db.prepare<[], Row>('SELECT * FROM extensions ORDER BY type, id').all();
const row = (id: string) => db.prepare<[string], Row>('SELECT * FROM extensions WHERE id = ?').get(id);

/** Plugin loading errors, shown in the panel. */
export const loadErrors = new Map<string, string>();

export function activeThemeId(): string | null {
  const id = settings.get<string | null>(ACTIVE_THEME, null);
  if (!id) return null;
  const r = row(id);
  return r && r.type === 'theme' && readManifest(id) ? id : null;
}

export function setActiveTheme(id: string | null): void {
  if (id) {
    const r = row(id);
    if (!r || r.type !== 'theme') throw new PackageError('Theme not found');
    const m = readManifest(id);
    if (m && !satisfiesVersion(config.version, m.palcms)) {
      throw new PackageError(`This theme requires PalCMS ${m.palcms} (installed version: ${config.version})`);
    }
  }
  settings.set(ACTIVE_THEME, id);
}

/** Setting values, completed with the manifest defaults. */
export function extensionSettings(id: string, defs: ExtensionSettingDef[] = readManifest(id)?.settings ?? []): ExtensionSettingValues {
  const saved = settings.get<ExtensionSettingValues>(settingsKey(id), {});
  const out: ExtensionSettingValues = {};
  for (const d of defs) {
    const v = saved[d.key] ?? d.default;
    if (v !== undefined) out[d.key] = v;
  }
  return out;
}

export function saveExtensionSettings(id: string, values: Record<string, unknown>): ExtensionSettingValues {
  const m = readManifest(id);
  if (!m) throw new PackageError('Extension not found');
  const clean: ExtensionSettingValues = {};
  for (const d of m.settings ?? []) {
    const v = values[d.key];
    if (v === undefined) continue;
    if (d.type === 'toggle') clean[d.key] = v === true;
    else if (d.type === 'number') {
      const n = Number(v);
      if (Number.isFinite(n)) clean[d.key] = n;
    } else if (typeof v === 'string') {
      if (d.type === 'select' && d.options && !d.options.some((o) => o.value === v)) continue;
      if (d.type === 'color' && !/^#[0-9a-fA-F]{3,8}$/.test(v)) continue;
      clean[d.key] = v.slice(0, 5000);
    }
  }
  settings.set(settingsKey(id), clean);
  return extensionSettings(id, m.settings);
}

function toInstalled(r: Row): InstalledExtension | null {
  const m = readManifest(r.id);
  if (!m) return null;
  return {
    id: r.id,
    type: r.type,
    name: m.name,
    version: m.version,
    description: m.description ?? '',
    author: m.author ?? '',
    homepage: m.homepage ?? null,
    iconUrl: m.icon ? `extensions/${r.id}/${m.icon}?v=${m.version}-${r.installed_at.toString(36)}` : null,
    enabled: r.enabled === 1,
    active: r.type === 'theme' && activeThemeId() === r.id,
    verified: r.verified === 1,
    source: r.source,
    installedAt: r.installed_at,
    compatible: satisfiesVersion(config.version, m.palcms),
    palcms: m.palcms ?? null,
    hasServer: has(r.id, 'server.js'),
    hasWeb: has(r.id, 'web.js'),
    hasCss: has(r.id, 'style.css'),
    settings: m.settings ?? [],
    error: loadErrors.get(r.id) ?? null,
  };
}

/**
 * Registers folders dropped by hand into the extensions folder (development):
 * they show up disabled and unverified.
 */
export function scanLocalExtensions(): void {
  const dir = extensionsDir();
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!EXTENSION_ID_RE.test(name) || row(name)) continue;
    const m = readManifest(name);
    if (!m) continue;
    db.prepare('INSERT INTO extensions (id, type, version, enabled, verified, source, installed_at) VALUES (?, ?, ?, 0, 0, ?, ?)').run(
      m.id,
      m.type,
      m.version,
      'local',
      Date.now(),
    );
  }
}

export function listExtensions(): InstalledExtension[] {
  scanLocalExtensions();
  return rows()
    .map(toInstalled)
    .filter((e): e is InstalledExtension => !!e);
}

export function getExtension(id: string): InstalledExtension | null {
  const r = row(id);
  return r ? toInstalled(r) : null;
}

/** Plugins to load on the server. */
export function enabledPlugins(): InstalledExtension[] {
  return listExtensions().filter((e) => e.type === 'plugin' && e.enabled && e.compatible);
}

const rev = (e: InstalledExtension) => `${e.version}-${e.installedAt.toString(36)}`;

export function bootExtensions(): BootExtensions {
  const list = listExtensions();
  const themeId = activeThemeId();
  const theme = themeId ? list.find((e) => e.id === themeId && e.compatible) : undefined;
  return {
    theme: theme
      ? { id: theme.id, version: theme.version, rev: rev(theme), web: theme.hasWeb, css: theme.hasCss, settings: extensionSettings(theme.id, theme.settings) }
      : null,
    plugins: list
      .filter((e) => e.type === 'plugin' && e.enabled && e.compatible && !loadErrors.has(e.id) && (e.hasWeb || e.hasCss))
      .map((e) => ({ id: e.id, version: e.version, rev: rev(e), web: e.hasWeb, css: e.hasCss })),
  };
}

/**
 * Installs (or updates) a package: files are written to a temporary folder,
 * then replace the old version in one go.
 */
export function installPackage(pkg: ExtensionPackage, opts: { source: ExtensionSource; verified: boolean }): InstalledExtension {
  const { manifest, files } = pkg;
  const existing = row(manifest.id);
  if (existing && existing.type !== manifest.type) throw new PackageError(`An extension "${manifest.id}" of another type is already installed`);

  const dir = extensionsDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = extensionPath(manifest.id);
  const tmp = path.join(dir, `.tmp-${manifest.id}-${Date.now()}`);
  const old = path.join(dir, `.old-${manifest.id}-${Date.now()}`);
  try {
    for (const [name, content] of files) {
      const file = path.join(tmp, name);
      if (!file.startsWith(tmp + path.sep)) throw new PackageError(`Forbidden path: ${name}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    if (fs.existsSync(target)) fs.renameSync(target, old);
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (fs.existsSync(old) && !fs.existsSync(target)) fs.renameSync(old, target);
    throw e;
  }
  fs.rmSync(old, { recursive: true, force: true });
  manifests.delete(manifest.id);
  loadErrors.delete(manifest.id);

  db.prepare(
    `INSERT INTO extensions (id, type, version, enabled, verified, source, installed_at) VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET version = excluded.version, verified = excluded.verified, source = excluded.source, installed_at = excluded.installed_at`,
  ).run(manifest.id, manifest.type, manifest.version, opts.verified ? 1 : 0, opts.source, Date.now());
  return getExtension(manifest.id)!;
}

export function installFromZip(data: Uint8Array, opts: { source: ExtensionSource; verified: boolean }): InstalledExtension {
  return installPackage(readPackage(data), opts);
}

export function setEnabled(id: string, enabled: boolean): void {
  const r = row(id);
  if (!r) throw new PackageError('Extension not found');
  if (enabled && !satisfiesVersion(config.version, readManifest(id)?.palcms)) {
    throw new PackageError('Extension incompatible with this PalCMS version');
  }
  db.prepare('UPDATE extensions SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

/** Removes an extension's files. Tables created by a plugin are kept. */
export function removeExtension(id: string): void {
  if (!row(id)) throw new PackageError('Extension not found');
  if (activeThemeId() === id) settings.set(ACTIVE_THEME, null);
  db.prepare('DELETE FROM extensions WHERE id = ?').run(id);
  fs.rmSync(extensionPath(id), { recursive: true, force: true });
  manifests.delete(id);
  loadErrors.delete(id);
}
