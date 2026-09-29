/**
 * Normalise le chemin sous lequel le site est servi : "/" ou "/cms/".
 * Toujours un slash au début et à la fin, caractères limités pour éviter toute injection
 * dans la configuration Nginx ou les cookies.
 */
export function normalizeBasePath(input: string | undefined | null): string {
  let p = (input ?? '/').trim();
  if (p === '') p = '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  p = p.replace(/\/{2,}/g, '/');
  if (!/^\/[A-Za-z0-9/_-]*$/.test(p)) {
    throw new Error(`Chemin de site invalide : "${input}" (lettres, chiffres, "-", "_" et "/" uniquement)`);
  }
  return p;
}

/** Préfixe à donner aux routes : "" pour "/", "/cms" pour "/cms/". */
export function routePrefix(basePath: string): string {
  const b = normalizeBasePath(basePath);
  return b === '/' ? '' : b.slice(0, -1);
}

/** Construit une URL relative au site : joinBase("/cms/", "api/x") -> "/cms/api/x". */
export function joinBase(basePath: string, path: string): string {
  return normalizeBasePath(basePath) + path.replace(/^\/+/, '');
}
