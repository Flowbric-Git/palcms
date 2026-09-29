declare global {
  interface Window {
    __PALCMS__?: { basePath: string };
  }
}

/** Build de démo (GitHub Pages) : pas de serveur, l'API est simulée dans le navigateur. */
export const isDemo = import.meta.env.VITE_DEMO === '1';

/** Chemin sous lequel le site est servi ("/" ou "/cms/"), injecté par le serveur. */
export const basePath = isDemo ? import.meta.env.BASE_URL : (window.__PALCMS__?.basePath ?? '/');

/** URL absolue d'une ressource du site : url("api/x") -> "/cms/api/x". */
export const url = (path: string) => basePath + path.replace(/^\/+/, '');

/** Convertit un lien du menu ("/actualites") en chemin du routeur, ou laisse une URL externe. */
export const isExternal = (href: string) => /^https?:\/\//.test(href);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: { fieldErrors?: Record<string, string[]> },
  ) {
    super(message);
  }
  field(name: string): string | undefined {
    return this.details?.fieldErrors?.[name]?.[0];
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (isDemo) {
    const { demoRequest } = await import('../demo/engine');
    try {
      return await demoRequest<T>(method, path, body);
    } catch (e) {
      throw new ApiError((e as Error).message, (e as { status?: number }).status ?? 500);
    }
  }
  const res = await fetch(url(`api/${path}`), {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = data as { error?: string; details?: ApiError['details'] } | null;
    throw new ApiError(d?.error ?? `Erreur ${res.status}`, res.status, d?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: (path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('POST', path, form);
  },
};

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
