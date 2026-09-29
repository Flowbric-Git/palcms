import fs from 'node:fs';
import { z } from 'zod';
import { EXTENSION_ID_RE, EXTENSION_VERSION_RE, compareVersions, satisfiesVersion, type InstalledExtension, type MarketEntry, type MarketResource } from '@palcms/shared';
import { config } from '../config';
import { MAX_PACKAGE_BYTES, PackageError, readPackage, sha256, verifySignature } from './package';
import { installPackage, listExtensions } from './store';

/** Clé publique du market officiel (palcms.online) : seuls les paquets signés avec sa clé privée sont "vérifiés". */
export const MARKET_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlINUr5GPJh4QHwBNSsYWUpOvEgw5xouIWL584M/zQcc=
-----END PUBLIC KEY-----`;

export function trustedKeys(): string[] {
  const extra = config.trustedKeyFiles.flatMap((f) => {
    try {
      return [fs.readFileSync(f, 'utf8')];
    } catch {
      console.warn(`[extensions] clé de confiance illisible : ${f}`);
      return [];
    }
  });
  return [MARKET_PUBLIC_KEY, ...extra];
}

const resourceSchema = z.object({
  id: z.string().regex(EXTENSION_ID_RE),
  type: z.enum(['plugin', 'theme']),
  name: z.string().min(1).max(80),
  summary: z.string().max(300).default(''),
  author: z.string().max(80).default(''),
  version: z.string().regex(EXTENSION_VERSION_RE),
  iconUrl: z.string().url().optional(),
  screenshots: z.array(z.string().url()).max(10).optional(),
  downloads: z.number().int().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  url: z.string().url().optional(),
  palcms: z.string().max(60).optional(),
  download: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().min(80).max(120),
  updatedAt: z.string().optional(),
});

const catalogSchema = z.object({ resources: z.array(z.unknown()).max(5000) });

let cache: { at: number; resources: MarketResource[] } | null = null;
const CACHE_MS = 10 * 60_000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': `PalCMS/${config.version}` } });
  if (!res.ok) throw new PackageError(`Le market a répondu ${res.status}`);
  return res;
}

/** Catalogue du market (mis en cache 10 minutes). Les entrées mal formées sont ignorées. */
export async function fetchCatalog(force = false): Promise<MarketResource[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.resources;
  let json: unknown;
  try {
    json = await (await fetchWithTimeout(`${config.marketUrl}/resources`, 10_000)).json();
  } catch (e) {
    if (e instanceof PackageError) throw e;
    throw new PackageError('Le market est injoignable pour le moment');
  }
  const parsed = catalogSchema.safeParse(json);
  if (!parsed.success) throw new PackageError('Réponse du market illisible');
  const resources = parsed.data.resources.flatMap((r) => {
    const res = resourceSchema.safeParse(r);
    return res.success ? [res.data as MarketResource] : [];
  });
  cache = { at: Date.now(), resources };
  return resources;
}

export function annotate(resources: MarketResource[], installed: InstalledExtension[] = listExtensions()): MarketEntry[] {
  const byId = new Map(installed.map((e) => [e.id, e]));
  return resources.map((r) => {
    const inst = byId.get(r.id);
    return {
      ...r,
      installed: inst?.version ?? null,
      update: !!inst && compareVersions(r.version, inst.version) > 0,
      compatible: satisfiesVersion(config.version, r.palcms),
    };
  });
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetchWithTimeout(url, 60_000);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_PACKAGE_BYTES) throw new PackageError('Paquet trop volumineux (20 Mo maximum)');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_PACKAGE_BYTES) throw new PackageError('Paquet trop volumineux (20 Mo maximum)');
  return buf;
}

/** Télécharge, vérifie (empreinte + signature) et installe une ressource du market. */
export async function installFromMarket(id: string): Promise<InstalledExtension> {
  const resource = (await fetchCatalog()).find((r) => r.id === id);
  if (!resource) throw new PackageError('Ressource introuvable sur le market');
  if (!satisfiesVersion(config.version, resource.palcms)) {
    throw new PackageError(`Cette ressource demande PalCMS ${resource.palcms} (version installée : ${config.version})`);
  }
  const data = await download(resource.download);
  if (sha256(data) !== resource.sha256.toLowerCase()) throw new PackageError('Le fichier téléchargé est corrompu (empreinte différente)');
  if (!verifySignature(data, resource.signature, trustedKeys())) {
    throw new PackageError('Signature invalide : ce paquet n’a pas été validé par le market');
  }
  const pkg = readPackage(data);
  if (pkg.manifest.id !== resource.id || pkg.manifest.type !== resource.type) {
    throw new PackageError('Le paquet ne correspond pas à la ressource annoncée');
  }
  return installPackage(pkg, { source: 'market', verified: true });
}
