import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { NewsItem, NewsSummary, PageItem } from '@palcms/shared';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { Prose, Spinner } from '../components/ui';
import { t } from '../lib/i18n';

export function Container({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto px-4 py-10 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>{children}</div>;
}

/** Loads a resource; returns null while loading, 'missing' when not found. */
function useResource<T>(path: string | null): T | null | 'missing' {
  const [data, setData] = useState<T | null | 'missing'>(null);
  useEffect(() => {
    if (!path) return;
    setData(null);
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setData(e instanceof ApiError && e.status === 404 ? 'missing' : 'missing'));
  }, [path]);
  return data;
}

export function NotFound() {
  return (
    <Container narrow>
      <div className="py-20 text-center">
        <p className="text-6xl font-extrabold text-accent">404</p>
        <p className="mt-4 text-lg">{t('This page does not exist.')}</p>
        <Link to="/" className="mt-6 inline-block font-medium text-accent">
          {t('Back to home')}
        </Link>
      </div>
    </Container>
  );
}

export function CmsPage() {
  const { slug } = useParams();
  const page = useResource<PageItem>(`public/pages/${slug}`);
  if (page === null) return <Spinner />;
  if (page === 'missing') return <NotFound />;
  return (
    <Container narrow>
      <h1 className="text-3xl font-bold">{page.title}</h1>
      <Prose html={page.contentHtml} className="mt-6" />
    </Container>
  );
}

export function NewsList() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page')) || 1;
  const data = useResource<{ items: NewsSummary[]; page: number; pages: number }>(`public/news?page=${page}`);
  if (data === null) return <Spinner />;
  if (data === 'missing') return <NotFound />;
  return (
    <Container>
      <h1 className="text-3xl font-bold">{t('News')}</h1>
      {data.items.length === 0 && <p className="mt-6 text-slate-500">{t('No news published.')}</p>}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((n) => (
          <Link
            key={n.id}
            to={`/news/${n.slug}`}
            className="group overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 dark:ring-slate-800"
          >
            {n.coverUrl ? (
              <img src={n.coverUrl} alt="" className="aspect-video w-full object-cover" />
            ) : (
              <div className="aspect-video w-full bg-gradient-to-br from-accent/40 to-accent/5" />
            )}
            <div className="p-4">
              <p className="text-xs text-slate-500">{formatDate(n.publishedAt)}</p>
              <h2 className="mt-1 font-semibold group-hover:text-accent">{n.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-slate-500">{n.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
      {data.pages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setParams({ page: String(p) })}
              className={`h-9 w-9 rounded-lg text-sm font-medium ${p === page ? 'bg-accent text-accent-fg' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </Container>
  );
}

export function NewsDetail() {
  const { slug } = useParams();
  const item = useResource<NewsItem>(`public/news/${slug}`);
  if (item === null) return <Spinner />;
  if (item === 'missing') return <NotFound />;
  return (
    <Container narrow>
      <Link to="/news" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-accent">
        <ArrowLeft className="h-4 w-4" /> {t('All news')}
      </Link>
      <h1 className="mt-4 text-3xl font-bold">{item.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {formatDate(item.publishedAt)}
        {item.author && ` · ${t('by {name}', { name: item.author })}`}
      </p>
      {item.coverUrl && <img src={item.coverUrl} alt="" className="mt-6 w-full rounded-xl" />}
      <Prose html={item.contentHtml} className="mt-6" />
    </Container>
  );
}
