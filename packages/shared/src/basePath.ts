/**
 * Normalizes the path the site is served under: "/" or "/cms/".
 * Always a slash at both ends, with a limited set of characters to prevent any injection
 * into the Nginx configuration or cookies.
 */
export function normalizeBasePath(input: string | undefined | null): string {
  let p = (input ?? '/').trim();
  if (p === '') p = '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  p = p.replace(/\/{2,}/g, '/');
  if (!/^\/[A-Za-z0-9/_-]*$/.test(p)) {
    throw new Error(`Invalid site path: "${input}" (letters, digits, "-", "_" and "/" only)`);
  }
  return p;
}

/** Route prefix: "" for "/", "/cms" for "/cms/". */
export function routePrefix(basePath: string): string {
  const b = normalizeBasePath(basePath);
  return b === '/' ? '' : b.slice(0, -1);
}

/** Builds a site-relative URL: joinBase("/cms/", "api/x") -> "/cms/api/x". */
export function joinBase(basePath: string, path: string): string {
  return normalizeBasePath(basePath) + path.replace(/^\/+/, '');
}
