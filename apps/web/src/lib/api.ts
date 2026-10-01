import { t, tm } from './i18n';

declare global {
  interface Window {
    __PALCMS__?: { basePath: string };
  }
}

/** Demo build: no server, the API is simulated in the browser. */
export const isDemo = import.meta.env.VITE_DEMO === '1';

/** Path the site is served under ("/" or "/cms/"), injected by the server. */
export const basePath = isDemo ? import.meta.env.BASE_URL : (window.__PALCMS__?.basePath ?? '/');

/** Absolute URL of a site resource: url("api/x") -> "/cms/api/x". */
export const url = (path: string) => basePath + path.replace(/^\/+/, '');

/** True for an external link (http/https), as opposed to a path of the site ("/news"). */
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
    const msg = this.details?.fieldErrors?.[name]?.[0];
    return msg ? tm(msg) : undefined;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (isDemo) {
    const { demoRequest } = await import('../demo/engine');
    try {
      return await demoRequest<T>(method, path, body);
    } catch (e) {
      throw new ApiError(tm((e as Error).message), (e as { status?: number }).status ?? 500);
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
    throw new ApiError(d?.error ? tm(d.error) : t('Error {status}', { status: res.status }), res.status, d?.details);
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
