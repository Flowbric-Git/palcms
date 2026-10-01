import crypto from 'node:crypto';
import { unzipSync } from 'fflate';
import { z } from 'zod';
import { EXTENSION_ID_RE, EXTENSION_VERSION_RE, type ExtensionManifest } from '@palcms/shared';

export const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 60 * 1024 * 1024;
const MAX_FILES = 2000;

const settingSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/, 'Invalid setting key'),
  type: z.enum(['color', 'text', 'textarea', 'image', 'toggle', 'select', 'number']),
  label: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  default: z.union([z.string().max(2000), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ value: z.string().max(80), label: z.string().max(80) })).max(50).optional(),
});

export const manifestSchema = z.object({
  id: z.string().regex(EXTENSION_ID_RE, 'Invalid id (lowercase letters, digits and dashes, 2 to 40 characters)'),
  type: z.enum(['plugin', 'theme']),
  name: z.string().min(1).max(60),
  version: z.string().regex(EXTENSION_VERSION_RE, 'Invalid version (format 1.2.3)'),
  description: z.string().max(500).optional(),
  author: z.string().max(60).optional(),
  homepage: z.string().url().max(300).optional(),
  palcms: z.string().max(60).optional(),
  icon: z.string().max(200).optional(),
  settings: z.array(settingSchema).max(40).optional(),
});

/** Files accepted in a package: anything else is refused to keep packages clean. */
const ALLOWED = [/^palcms\.json$/, /^server\.js$/, /^web\.js$/, /^style\.css$/, /^assets\/[\w./-]+$/, /^(README|LICENSE|CHANGELOG)(\.md|\.txt)?$/i];

/** Ids used by the panel routes (extensions/options, extensions/themes…). */
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

/** Reads and checks a .zip package (manifest, paths, sizes). */
export function readPackage(data: Uint8Array): ExtensionPackage {
  if (data.byteLength > MAX_PACKAGE_BYTES) fail('Package too large (20 MB maximum)');
  let entries: Record<string, Uint8Array>;
  let total = 0;
  let count = 0;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        if (++count > MAX_FILES) fail('Too many files in the package');
        total += f.originalSize;
        if (total > MAX_UNPACKED_BYTES) fail('Package too large once unpacked');
        return !f.name.endsWith('/');
      },
    });
  } catch (e) {
    if (e instanceof PackageError) throw e;
    fail('Unreadable .zip file');
  }

  let names = Object.keys(entries).map((n) => n.replace(/\\/g, '/'));
  // A zip made from a folder often has a root folder: strip it.
  if (!names.includes('palcms.json')) {
    const root = names.find((n) => /^[^/]+\/palcms\.json$/.test(n))?.split('/')[0];
    if (!root) fail('palcms.json not found at the root of the package');
    names = names.map((n) => (n.startsWith(`${root}/`) ? n.slice(root.length + 1) : n));
    entries = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.replace(/\\/g, '/').replace(`${root}/`, ''), v]));
  }

  const files = new Map<string, Uint8Array>();
  for (const [raw, content] of Object.entries(entries)) {
    const name = raw.replace(/\\/g, '/');
    if (name.split('/').some((p) => p === '..' || p === '.' || p === '') || name.startsWith('/')) fail(`Forbidden path: ${name}`);
    if (/^__MACOSX\/|(^|\/)\.DS_Store$|(^|\/)Thumbs\.db$/.test(name)) continue;
    if (!ALLOWED.some((re) => re.test(name))) fail(`File not allowed in the package: ${name}`);
    files.set(name, content);
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(files.get('palcms.json')));
  } catch {
    fail('palcms.json is not valid JSON');
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(`palcms.json: ${issue.path.join('.') || 'root'}: ${issue.message}`);
  }
  const manifest = parsed.data as ExtensionManifest;
  if (RESERVED_IDS.includes(manifest.id)) fail(`The id "${manifest.id}" is reserved`);
  if (manifest.icon && !files.has(manifest.icon)) fail(`Icon not found in the package: ${manifest.icon}`);
  if (manifest.type === 'theme' && files.has('server.js')) fail('A theme cannot contain server.js');
  if (!files.has('server.js') && !files.has('web.js') && !files.has('style.css')) {
    fail('The package contains neither server.js, web.js nor style.css');
  }
  return { manifest, files };
}

export const sha256 = (data: Uint8Array) => crypto.createHash('sha256').update(data).digest('hex');

/** Checks a package's Ed25519 signature (base64) against one of the trusted public keys. */
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
