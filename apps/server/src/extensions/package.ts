import crypto from 'node:crypto';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { EXTENSION_ID_RE, EXTENSION_VERSION_RE, type ExtensionManifest } from '@palcms/shared';

export const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 2000;

const settingSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/, 'Clé de réglage invalide'),
  type: z.enum(['color', 'text', 'textarea', 'image', 'toggle', 'select', 'number']),
  label: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  default: z.union([z.string().max(2000), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ value: z.string().max(80), label: z.string().max(80) })).max(50).optional(),
});

export const manifestSchema = z.object({
  id: z.string().regex(EXTENSION_ID_RE, 'Identifiant invalide (minuscules, chiffres et tirets, 2 à 40 caractères)'),
  type: z.enum(['plugin', 'theme']),
  name: z.string().min(1).max(60),
  version: z.string().regex(EXTENSION_VERSION_RE, 'Version invalide (format 1.2.3)'),
  description: z.string().max(500).optional(),
  author: z.string().max(60).optional(),
  homepage: z.string().url().max(300).optional(),
  palcms: z.string().max(60).optional(),
  icon: z.string().max(200).optional(),
  settings: z.array(settingSchema).max(40).optional(),
});

/** Fichiers acceptés dans un paquet : le reste est refusé pour garder les paquets propres. */
const ALLOWED = [/^palcms\.json$/, /^server\.js$/, /^web\.js$/, /^style\.css$/, /^assets\/[\w./-]+$/, /^(README|LICENSE|CHANGELOG)(\.md|\.txt)?$/i];

/** Identifiants utilisés par les routes du panel (extensions/options, extensions/themes…). */
const RESERVED_IDS = ['options', 'market', 'upload', 'themes', 'palcms', 'core'];

export interface ExtensionPackage {
  manifest: ExtensionManifest;
  files: Map<string, Uint8Array>;
}

export class PackageError extends Error {
  status = 400;
}

function fail(message: string): never {
  throw new PackageError(message);
}

/** Lit et vérifie un paquet .zip (manifeste, chemins, tailles). */
export function readPackage(data: Uint8Array): ExtensionPackage {
  if (data.byteLength > MAX_PACKAGE_BYTES) fail('Paquet trop volumineux (20 Mo maximum)');
  let entries: Record<string, Uint8Array>;
  let total = 0;
  let count = 0;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        if (++count > MAX_FILES) fail('Trop de fichiers dans le paquet');
        total += f.originalSize;
        if (total > MAX_UNPACKED_BYTES) fail('Paquet trop volumineux une fois décompressé');
        return !f.name.endsWith('/');
      },
    });
  } catch (e) {
    if (e instanceof PackageError) throw e;
    fail('Fichier .zip illisible');
  }

  let names = Object.keys(entries).map((n) => n.replace(/\\/g, '/'));
  // Un zip créé depuis un dossier contient souvent un dossier racine : on le retire.
  if (!names.includes('palcms.json')) {
    const root = names.find((n) => /^[^/]+\/palcms\.json$/.test(n))?.split('/')[0];
    if (!root) fail('palcms.json introuvable à la racine du paquet');
    names = names.map((n) => (n.startsWith(`${root}/`) ? n.slice(root.length + 1) : n));
    entries = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.replace(/\\/g, '/').replace(`${root}/`, ''), v]));
  }

  const files = new Map<string, Uint8Array>();
  for (const [raw, content] of Object.entries(entries)) {
    const name = raw.replace(/\\/g, '/');
    if (name.split('/').some((p) => p === '..' || p === '.' || p === '') || name.startsWith('/')) fail(`Chemin interdit : ${name}`);
    if (/^__MACOSX\/|(^|\/)\.DS_Store$|(^|\/)Thumbs\.db$/.test(name)) continue;
    if (!ALLOWED.some((re) => re.test(name))) fail(`Fichier non autorisé dans le paquet : ${name}`);
    files.set(name, content);
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(files.get('palcms.json')));
  } catch {
    fail('palcms.json n’est pas un JSON valide');
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(`palcms.json : ${issue.path.join('.') || 'racine'} : ${issue.message}`);
  }
  const manifest = parsed.data as ExtensionManifest;
  if (RESERVED_IDS.includes(manifest.id)) fail(`L'identifiant "${manifest.id}" est réservé`);
  if (manifest.icon && !files.has(manifest.icon)) fail(`Icône introuvable dans le paquet : ${manifest.icon}`);
  if (manifest.type === 'theme' && files.has('server.js')) fail('Un thème ne peut pas contenir de server.js');
  if (!files.has('server.js') && !files.has('web.js') && !files.has('style.css')) {
    fail('Le paquet ne contient ni server.js, ni web.js, ni style.css');
  }
  return { manifest, files };
}

export const sha256 = (data: Uint8Array) => crypto.createHash('sha256').update(data).digest('hex');

/** Vérifie la signature Ed25519 (base64) d'un paquet avec l'une des clés publiques de confiance. */
export function verifySignature(data: Uint8Array, signature: string, publicKeys: string[]): boolean {
  let sig: Buffer;
  try {
    sig = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  return publicKeys.some((pem) => {
    try {
      return crypto.verify(null, data, crypto.createPublicKey(pem), sig);
    } catch {
      return false;
    }
  });
}
